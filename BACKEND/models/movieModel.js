const mongoose = require('mongoose');

const externalRatingSchema = new mongoose.Schema(
    {
        source: { type: String, trim: true },
        value: { type: String, trim: true }
    },
    { _id: false }
);

const movieSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true
        },
        year: {
            type: Number
        },
        rated: {
            type: String,
            trim: true
        },
        released: {
            type: Date
        },
        runtime: {
            type: Number
        },
        genres: [
            {
                type: String,
                trim: true
            }
        ],
        directors: [
            {
                type: String,
                trim: true
            }
        ],
        writers: [
            {
                type: String,
                trim: true
            }
        ],
        actors: [
            {
                type: String,
                trim: true
            }
        ],
        plot: {
            type: String,
            default: ''
        },
        languages: [
            {
                type: String,
                trim: true
            }
        ],
        countries: [
            {
                type: String,
                trim: true
            }
        ],
        awards: {
            type: String,
            default: ''
        },
        poster: {
            type: String,
            default: ''
        },
        ratings: [externalRatingSchema],
        metascore: {
            type: Number
        },
        imdbRating: {
            type: Number
        },
        imdbVotes: {
            type: Number
        },
        imdbID: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },
        tmdbId: {
            type: Number,
            unique: true,
            sparse: true
        },
        backdrop: {
            type: String,
            default: ''
        },
        popularity: {
            type: Number
        },
        voteAverage: {
            type: Number
        },
        voteCount: {
            type: Number
        },
        type: {
            type: String,
            default: 'movie'
        },
        boxOffice: {
            type: Number
        }
    },
    {
        timestamps: true
    }
);

movieSchema.index({ title: 1, year: 1 });

module.exports = mongoose.model('Movie', movieSchema);
