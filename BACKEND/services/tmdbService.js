const axios = require('axios');

const API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const DEFAULT_LANGUAGE = process.env.TMDB_LANGUAGE || 'en-US';

const client = axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    params: {
        api_key: API_KEY,
        language: DEFAULT_LANGUAGE
    }
});

const ensureApiKey = () => {
    if (!API_KEY) {
        const error = new Error('TMDB_API_KEY is missing');
        error.statusCode = 500;
        throw error;
    }
};

const buildPosterUrl = (path, size = 'w500') => {
    if (!path) return null;
    return `${IMAGE_BASE_URL}/${size}${path}`;
};

const buildBackdropUrl = (path, size = 'w780') => {
    if (!path) return null;
    return `${IMAGE_BASE_URL}/${size}${path}`;
};

const formatMovieSummary = (movie) => ({
    tmdbId: movie.id,
    imdbID: movie.imdb_id || undefined,
    title: movie.title || movie.name || '',
    year: Number((movie.release_date || '').slice(0, 4)) || undefined,
    poster: buildPosterUrl(movie.poster_path),
    backdrop: buildBackdropUrl(movie.backdrop_path),
    type: 'movie',
    popularity: movie.popularity,
    voteAverage: movie.vote_average,
    voteCount: movie.vote_count
});

const fetchGenres = async () => {
    const res = await client.get('/genre/movie/list');
    return res.data.genres || [];
};

exports.getGenres = async () => {
    ensureApiKey();
    return fetchGenres();
};

exports.searchMoviesByYear = async (year, page = 1) => {
    ensureApiKey();
    const res = await client.get('/discover/movie', {
        params: {
            sort_by: 'popularity.desc',
            include_adult: false,
            include_video: false,
            primary_release_year: year,
            page
        }
    });

    return {
        items: (res.data.results || []).map(formatMovieSummary),
        totalResults: Number(res.data.total_results || 0),
        totalPages: Number(res.data.total_pages || 0)
    };
};

exports.searchMovies = async (query, options = {}) => {
    ensureApiKey();
    const res = await client.get('/search/movie', {
        params: {
            query,
            include_adult: false,
            page: options.page || 1,
            primary_release_year: options.year || undefined
        }
    });

    return {
        items: (res.data.results || []).map(formatMovieSummary),
        totalResults: Number(res.data.total_results || 0),
        totalPages: Number(res.data.total_pages || 0)
    };
};

exports.getMovieByTmdbId = async (tmdbId) => {
    ensureApiKey();
    const res = await client.get(`/movie/${tmdbId}`, {
        params: {
            append_to_response: 'credits,external_ids,release_dates,videos'
        }
    });

    const details = res.data;
    details.external_ids = details.external_ids || {};
    details.release_dates = details.release_dates?.results || [];
    details.videos = details.videos?.results || [];
    details.credits = details.credits || { cast: [], crew: [] };
    return details;
};

exports.getMovieByImdbId = async (imdbID) => {
    ensureApiKey();
    const findRes = await client.get('/find/' + encodeURIComponent(imdbID), {
        params: {
            external_source: 'imdb_id'
        }
    });

    const movie = findRes.data?.movie_results?.[0];
    if (!movie?.id) return null;
    return exports.getMovieByTmdbId(movie.id);
};

exports.pickTrailer = (videos = []) => {
    const youtubeVideos = videos.filter(video => video.site === 'YouTube');
    const trailer = youtubeVideos.find(video => video.type === 'Trailer' && video.official)
        || youtubeVideos.find(video => video.type === 'Trailer')
        || youtubeVideos.find(video => video.type === 'Teaser')
        || youtubeVideos[0];

    if (!trailer?.key) return null;

    return {
        title: trailer.name,
        url: `https://www.youtube-nocookie.com/embed/${trailer.key}`,
        site: trailer.site,
        type: trailer.type,
        official: Boolean(trailer.official)
    };
};
