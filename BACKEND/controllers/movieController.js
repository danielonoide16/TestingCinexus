const Movie = require('../models/movieModel');
const omdbService = require('../services/omdbService');


const toNumber = (value) => {
    if (!value || value === 'N/A') return undefined;
    const normalized = String(value).replace(/[^0-9.]/g, '');
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? undefined : parsed;
};

const splitList = (value) => {
    if (!value || value === 'N/A') return [];
    return String(value)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
};

const parseReleaseDate = (value) => {
    if (!value || value === 'N/A') return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

exports.createMovie = async (req, res) => {
    const payload = req.body;

    const movieData = {
        title: payload.title || payload.Title,
        year: toNumber(payload.year || payload.Year),
        rated: payload.rated || payload.Rated,
        released: parseReleaseDate(payload.released || payload.Released),
        runtime: toNumber(payload.runtime || payload.Runtime),
        genres: splitList(payload.genres || payload.Genre),
        directors: splitList(payload.directors || payload.Director),
        writers: splitList(payload.writers || payload.Writer),
        actors: splitList(payload.actors || payload.Actors),
        plot: payload.plot || payload.Plot,
        languages: splitList(payload.languages || payload.Language),
        countries: splitList(payload.countries || payload.Country),
        awards: payload.awards || payload.Awards,
        poster: payload.poster || payload.Poster,
        ratings: (payload.ratings || payload.Ratings || []).map(rating => ({
            source: rating.source || rating.Source,
            value: rating.value || rating.Value
        })),
        metascore: toNumber(payload.metascore || payload.Metascore),
        imdbRating: toNumber(payload.imdbRating),
        imdbVotes: toNumber(payload.imdbVotes),
        imdbID: payload.imdbID,
        type: payload.type || payload.Type || 'movie',
        boxOffice: toNumber(payload.boxOffice || payload.BoxOffice)
    };

    if (!movieData.title) {
        return res.status(400).json({ error: 'Movie title is required' });
    }

    const filter = movieData.imdbID
        ? { imdbID: movieData.imdbID }
        : { title: movieData.title, year: movieData.year };

    const movie = await Movie.findOneAndUpdate(
        filter,
        movieData,
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: true
        }
    );

    res.status(201).json(movie);
};


const isValidPoster = (url) => {
    return url &&
           url !== 'N/A' &&
           typeof url === 'string' &&
           url.startsWith('http') &&
           url.includes('.jpg');
};

const fixPoster = (url) => {
    if (!isValidPoster(url)) return null;

    // Mejora tamaño/calidad
    return url.replace('SX300', 'SX500');
};

exports.getRecentMovies = async (req, res) => {
    const currentYear = new Date().getFullYear();

    let allResults = [];

    try {
        // we get the first 3 pages of results (up to 30 movies) to increase chances of finding valid posters
        for (let page = 1; page <= 3; page++) {
            const results = await omdbService.searchMoviesByYear(currentYear, page);
            allResults = allResults.concat(results);
        }

        const savedMovies = [];

        const isSafePoster = (url) => {
            return url &&
                url !== 'N/A' &&
                url.startsWith('https://m.media-amazon.com/images/');
        };

        for (const m of allResults) {
            const year = Number(m.Year);

            const movie = await Movie.findOneAndUpdate(
                { imdbID: m.imdbID },
                {
                    title: m.Title,
                    year: Number.isNaN(year) ? undefined : year,
                    poster: isSafePoster(m.Poster) ? m.Poster : null,
                    type: m.Type,
                    imdbID: m.imdbID
                },
                {
                    new: true,
                    upsert: true,
                    setDefaultsOnInsert: true
                }
            );

            savedMovies.push(movie);
        }

        // remove duplicates (in case the same movie appears in multiple pages)
        const unique = Array.from(
            new Map(savedMovies.map(m => [m.imdbID, m])).values()
        );

        // filter out movies without valid posters
        const validMovies = unique.filter(m => m.poster);

        res.json(validMovies.slice(0, 20));

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching recent movies' });
    }
};


exports.getMovies = async (req, res) => {
    const query = (req.query.q || '').trim();
    const genre = (req.query.genre || '').trim();
    const fromYear = toNumber(req.query.fromYear);
    const toYear = toNumber(req.query.toYear);

    if (!query) {
        const dbFilter = {};

        if (genre) {
            dbFilter.genres = { $regex: `^${genre}$`, $options: 'i' };
        }

        if (fromYear || toYear) {
            dbFilter.year = {};
            if (fromYear) dbFilter.year.$gte = fromYear;
            if (toYear) dbFilter.year.$lte = toYear;
        }

        const movies = await Movie.find(dbFilter)
            .sort({ year: -1, createdAt: -1 })
            .limit(50);

        return res.json(movies);
    }

    const results = await omdbService.searchMovies(query);
    const savedMovies = [];

    for (const m of results) {
        const details = await omdbService.getMovieByImdb(m.imdbID);

        const movie = await Movie.findOneAndUpdate(
            { imdbID: m.imdbID },
            {
                title: details.Title || m.Title,
                year: toNumber(details.Year || m.Year),
                rated: details.Rated,
                released: parseReleaseDate(details.Released),
                runtime: toNumber(details.Runtime),
                genres: splitList(details.Genre),
                directors: splitList(details.Director),
                writers: splitList(details.Writer),
                actors: splitList(details.Actors),
                plot: details.Plot,
                languages: splitList(details.Language),
                countries: splitList(details.Country),
                awards: details.Awards,
                poster: fixPoster(details.Poster || m.Poster),
                ratings: (details.Ratings || []).map(rating => ({
                    source: rating.Source,
                    value: rating.Value
                })),
                metascore: toNumber(details.Metascore),
                imdbRating: toNumber(details.imdbRating),
                imdbVotes: toNumber(details.imdbVotes),
                type: details.Type || m.Type,
                imdbID: m.imdbID,
                boxOffice: toNumber(details.BoxOffice)
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        savedMovies.push(movie);
    }

    const filteredMovies = savedMovies.filter(movie => {
        const matchesGenre = !genre || movie.genres.some(g => g.toLowerCase() === genre.toLowerCase());
        const matchesFrom = !fromYear || (movie.year && movie.year >= fromYear);
        const matchesTo = !toYear || (movie.year && movie.year <= toYear);
        return matchesGenre && matchesFrom && matchesTo;
    });

    res.json(filteredMovies);
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

exports.getMovieByImdbId = async (req, res) => {
    let movie = await Movie.findOne({ imdbID: req.params.imdbID });

    if (!movie || !movie.plot || !movie.genres?.length) {
        const details = await omdbService.getMovieByImdb(req.params.imdbID);

        if (!details || details.Response === 'False') {
            return res.status(404).json({ error: 'Movie not found' });
        }

        movie = await Movie.findOneAndUpdate(
            { imdbID: req.params.imdbID },
            {
                title: details.Title,
                year: toNumber(details.Year),
                rated: details.Rated,
                released: parseReleaseDate(details.Released),
                runtime: toNumber(details.Runtime),
                genres: splitList(details.Genre),
                directors: splitList(details.Director),
                writers: splitList(details.Writer),
                actors: splitList(details.Actors),
                plot: details.Plot,
                languages: splitList(details.Language),
                countries: splitList(details.Country),
                awards: details.Awards,
                poster: fixPoster(details.Poster),
                ratings: (details.Ratings || []).map(rating => ({
                    source: rating.Source,
                    value: rating.Value
                })),
                metascore: toNumber(details.Metascore),
                imdbRating: toNumber(details.imdbRating),
                imdbVotes: toNumber(details.imdbVotes),
                imdbID: details.imdbID,
                type: details.Type || 'movie',
                boxOffice: toNumber(details.BoxOffice)
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
    }

    res.json(movie);
};
