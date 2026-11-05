import mongoose from 'mongoose';

const blackListTokensSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const BlackListTokens = mongoose.model('BlackListTokens', blackListTokensSchema);
export default BlackListTokens;