import mongoose from 'mongoose';

const verificationSchema = new mongoose.Schema(
    {
        task: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task',
            required: true,
        },
        worker: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        checkIn: {
            time: { type: Date, required: false },
            latitude: { type: Number, required: false },
            longitude: { type: Number, required: false },
            photoUrl: { type: String, required: true },
        },
        checkOut: {
            time: { type: Date },
            latitude: { type: Number },
            longitude: { type: Number },
            photoUrl: { type: String },
        },
        totalHours: {
            type: Number,
            default: 0, // Automated billing ke liye calculate hoga
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

verificationSchema.index(
    { task: 1, worker: 1 },
    {
        unique: true,
        partialFilterExpression: { 'checkOut.time': { $exists: false } },
    }
);

const Verification = mongoose.model('Verification', verificationSchema);
export default Verification;