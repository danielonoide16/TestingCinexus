const Movie = require('../models/movieModel');
const tmdbService = require('../services/tmdbService');

const toNumber = (value) => {
    if (value === undefined || value === null || value === '' || value === 'N/A') return undefined;
    const normalized = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isNaN(normalized) ? undefined : normalized;
};

const parseReleaseDate = (value) => {
    if (!value || value === 'N/A') return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const dedupeStrings = (items = []) => Array.from(new Set(items.map(item => String(item || '').trim()).filter(Boolean)));

const pickCertification = (releaseDates = [], preferredIso = 'US') => {
    const preferred = releaseDates.find(item => item.iso_3166_1 === preferredIso)?.release_dates || [];
    const any = preferred.find(item => item.certification)?.certification;
    if (any) return any;

    for (const country of releaseDates) {
        const certification = country.release_dates?.find(item => item.certification)?.certification;
        if (certification) return certification;
    }

    return undefined;
};

const mapTmdbMovie = (details) => ({
    title: details.title || details.name,
    year: toNumber((details.release_date || '').slice(0, 4)),
    rated: pickCertification(details.release_dates),
    released: parseReleaseDate(details.release_date),
    runtime: toNumber(details.runtime),
    genres: dedupeStrings((details.genres || []).map(genre => genre.name)),
    directors: dedupeStrings((details.credits?.crew || []).filter(person => person.job === 'Director').map(person => person.name)),
    writers: dedupeStrings((details.credits?.crew || []).filter(person => ['Writer', 'Screenplay', 'Story'].includes(person.job)).map(person => person.name)),
    actors: dedupeStrings((details.credits?.cast || []).slice(0, 12).map(person => person.name)),
    plot: details.overview || '',
    languages: dedupeStrings((details.spoken_languages || []).map(language => language.english_name || language.name)),
    countries: dedupeStrings((details.production_countries || []).map(country => country.name)),
    awards: '',
    poster: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : '',
    backdrop: details.backdrop_path ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}` : '',
    ratings: [
        details.vote_average ? { source: 'TMDb', value: `${Number(details.vote_average).toFixed(1)}/10` } : null,
        details.external_ids?.imdb_id && details.vote_average ? { source: 'IMDb (via TMDb)', value: `${Number(details.vote_average).toFixed(1)}/10` } : null
    ].filter(Boolean),
    metascore: undefined,
    imdbRating: details.vote_average,
    imdbVotes: details.vote_count,
    imdbID: details.external_ids?.imdb_id || undefined,
    tmdbId: details.id,
    type: 'movie',
    boxOffice: toNumber(details.revenue),
    popularity: details.popularity,
    voteAverage: details.vote_average,
    voteCount: details.vote_count
});

const getMovieFilter = (movieData) => {
    if (movieData.tmdbId) return { tmdbId: movieData.tmdbId };
    if (movieData.imdbID) return { imdbID: movieData.imdbID };
    return { title: movieData.title, year: movieData.year };
};

const upsertMovie = async (movieData) => Movie.findOneAndUpdate(
    getMovieFilter(movieData),
    movieData,
    {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true
    }
);

exports.createMovie = async (req, res) => {
    const payload = req.body;
    const movieData = {
        title: payload.title,
        year: toNumber(payload.year),
        rated: payload.rated,
        released: parseReleaseDate(payload.released),
        runtime: toNumber(payload.runtime),
        genres: dedupeStrings(payload.genres || []),
        directors: dedupeStrings(payload.directors || []),
        writers: dedupeStrings(payload.writers || []),
        actors: dedupeStrings(payload.actors || []),
        plot: payload.plot,
        languages: dedupeStrings(payload.languages || []),
        countries: dedupeStrings(payload.countries || []),
        awards: payload.awards,
        poster: payload.poster,
        backdrop: payload.backdrop,
        ratings: Array.isArray(payload.ratings) ? payload.ratings : [],
        metascore: toNumber(payload.metascore),
        imdbRating: toNumber(payload.imdbRating),
        imdbVotes: toNumber(payload.imdbVotes),
        imdbID: payload.imdbID,
        tmdbId: toNumber(payload.tmdbId),
        type: payload.type || 'movie',
        boxOffice: toNumber(payload.boxOffice),
        popularity: toNumber(payload.popularity),
        voteAverage: toNumber(payload.voteAverage),
        voteCount: toNumber(payload.voteCount)
    };

    if (!movieData.title) return res.status(400).json({ error: 'Movie title is required' });
    const movie = await upsertMovie(movieData);
    res.status(201).json(movie);
};

exports.getRecentMovies = async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();
        const [recent, previous] = await Promise.all([
            tmdbService.searchMoviesByYear(currentYear, 1),
            tmdbService.searchMoviesByYear(currentYear - 1, 1)
        ]);

        const combined = [...recent.items, ...previous.items]
            .filter(movie => movie.poster)
            .slice(0, 20);

        const savedMovies = [];
        for (const movie of combined) {
            savedMovies.push(await upsertMovie(movie));
        }

        const unique = Array.from(new Map(savedMovies.map(movie => [movie.tmdbId || movie.imdbID || movie._id.toString(), movie])).values());
        res.json(unique.slice(0, 20));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching recent movies' });
    }
};

exports.getMovies = async (req, res) => {
    const query = (req.query.q || '').trim();
    const genre = (req.query.genre || '').trim();
    const sort = (req.query.sort || 'year_desc').trim();
    const page = Math.max(1, toNumber(req.query.page) || 1);
    const limit = Math.min(40, Math.max(1, toNumber(req.query.limit) || 12));
    const year = toNumber(req.query.year);

    const sortMap = {
        year_desc: { year: -1, createdAt: -1 },
        year_asc: { year: 1, createdAt: -1 },
        title_asc: { title: 1 },
        title_desc: { title: -1 },
        rating_desc: { imdbRating: -1, year: -1 },
        rating_asc: { imdbRating: 1, year: -1 },
        popularity_desc: { popularity: -1, year: -1 },
        popularity_asc: { popularity: 1, year: -1 }
    };

    if (!query) {
        if (year) {
            try {
                const result = await tmdbService.searchMoviesByYear(year, page);
                const items = [];
                for (const movie of result.items) items.push(await upsertMovie(movie));

                const filtered = genre
                    ? items.filter(movie => movie.genres?.some(item => item.toLowerCase() === genre.toLowerCase()))
                    : items;

                return res.json({
                    items: filtered,
                    pagination: {
                        page,
                        limit: 20,
                        total: result.totalResults || filtered.length,
                        totalPages: Math.max(1, result.totalPages || 1),
                        hasNext: page < Math.max(1, result.totalPages || 1),
                        hasPrev: page > 1
                    }
                });
            } catch (error) {
                console.error(error);
            }
        }

        const dbFilter = {};
        if (genre) dbFilter.genres = { $regex: `^${genre}$`, $options: 'i' };
        if (year) dbFilter.year = year;

        const total = await Movie.countDocuments(dbFilter);
        const movies = await Movie.find(dbFilter)
            .sort(sortMap[sort] || sortMap.year_desc)
            .skip((page - 1) * limit)
            .limit(limit);

        return res.json({
            items: movies,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        });
    }

    const results = await tmdbService.searchMovies(query, { page, year });
    const savedMovies = [];

    for (const movie of results.items) {
        savedMovies.push(await upsertMovie(movie));
    }

    const filteredMovies = genre
        ? savedMovies.filter(movie => movie.genres?.some(item => item.toLowerCase() === genre.toLowerCase()))
        : savedMovies;

    filteredMovies.sort((a, b) => {
        switch (sort) {
            case 'year_asc': return (a.year || 0) - (b.year || 0);
            case 'title_asc': return String(a.title || '').localeCompare(String(b.title || ''));
            case 'title_desc': return String(b.title || '').localeCompare(String(a.title || ''));
            case 'rating_desc': return (b.imdbRating || 0) - (a.imdbRating || 0);
            case 'rating_asc': return (a.imdbRating || 0) - (b.imdbRating || 0);
            case 'popularity_desc': return (b.popularity || 0) - (a.popularity || 0);
            case 'popularity_asc': return (a.popularity || 0) - (b.popularity || 0);
            case 'year_desc':
            default: return (b.year || 0) - (a.year || 0);
        }
    });

    res.json({
        items: filteredMovies,
        pagination: {
            page,
            limit,
            total: results.totalResults || filteredMovies.length,
            totalPages: Math.max(1, results.totalPages || 1),
            hasNext: page < Math.max(1, results.totalPages || 1),
            hasPrev: page > 1
        }
    });
};

exports.getMovieYears = async (req, res) => {
    const years = await Movie.distinct('year', { year: { $ne: null } });
    res.json(years.filter(Boolean).sort((a, b) => b - a));
};

exports.searchMovies = async (req, res) => exports.getMovies(req, res);

exports.getMovieById = async (req, res) => {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: 'Movie not found' });
    res.json(movie);
};

exports.getMovieByTmdbId = async (req, res) => {
    const tmdbId = toNumber(req.params.tmdbId);
    if (!tmdbId) return res.status(400).json({ error: 'Invalid TMDb id' });

    let movie = await Movie.findOne({ tmdbId });

    if (!movie || !movie.plot || !movie.genres?.length || !movie.directors?.length) {
        const details = await tmdbService.getMovieByTmdbId(tmdbId);
        const payload = mapTmdbMovie(details);
        movie = await upsertMovie(payload);
        const out = movie.toObject ? movie.toObject() : movie;
        out.trailer = tmdbService.pickTrailer(details.videos);
        return res.json(out);
    }

    const details = await tmdbService.getMovieByTmdbId(tmdbId);
    const out = movie.toObject ? movie.toObject() : movie;
    out.trailer = tmdbService.pickTrailer(details.videos);
    res.json(out);
};

exports.getMovieByImdbId = async (req, res) => {
    const details = await tmdbService.getMovieByImdbId(req.params.imdbID);
    if (!details) return res.status(404).json({ error: 'Movie not found' });

    const movie = await upsertMovie(mapTmdbMovie(details));
    const payload = movie.toObject ? movie.toObject() : movie;
    payload.trailer = tmdbService.pickTrailer(details.videos);
    res.json(payload);
};
