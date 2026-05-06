const axios = require('axios');

const API_KEY = process.env.YOUTUBE_API_KEY;
const BASE_URL = 'https://www.googleapis.com/youtube/v3/search';

exports.searchTrailer = async ({ title, year }) => {
    if (!API_KEY || !title) return null;

    const query = `${title} ${year || ''} official trailer`.trim();

    const res = await axios.get(BASE_URL, {
        params: {
            key: API_KEY,
            part: 'snippet',
            q: query,
            type: 'video',
            videoEmbeddable: 'true',
            maxResults: 5,
            safeSearch: 'moderate'
        }
    });

    const items = res.data.items || [];
    const best = items.find(item => item.id && item.id.videoId) || null;

    if (!best) return null;

    return {
        videoId: best.id.videoId,
        title: best.snippet?.title || '',
        url: `https://www.youtube-nocookie.com/embed/${best.id.videoId}`
    };
};
