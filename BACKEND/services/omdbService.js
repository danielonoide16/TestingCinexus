const axios = require('axios');

const API_KEY = process.env.OMDB_API_KEY;
const BASE_URL = 'http://www.omdbapi.com/';


exports.searchMoviesByYear = async (year, page = 1) => {
    const res = await axios.get(BASE_URL, {
        params: {
            apikey: API_KEY,
            s: 'movie',
            type: 'movie',
            y: year,
            page
        }
    });

    if (res.data.Response === 'False') {
        return {
            items: [],
            totalResults: 0
        };
    }

    return {
        items: res.data.Search || [],
        totalResults: Number(res.data.totalResults || 0)
    };
};


exports.searchMovies = async (query) => {
    const res = await axios.get(BASE_URL, {
        params: {
            apikey: API_KEY,
            s: query
        }
    });

    if (res.data.Response === 'False') return [];
    return res.data.Search;
};

exports.getMovieByImdb = async (imdbID) => {
    const res = await axios.get(BASE_URL, {
        params: {
            apikey: API_KEY,
            i: imdbID,
            plot: 'full'
        }
    });

    return res.data;
};