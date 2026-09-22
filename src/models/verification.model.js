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
            time: { type: Date, required: true },
            latitude: { type: Number, required: true },
            longitude: { type: Number, required: true },
            photoUrl: { type: [String], required: true }, // Live work photo URL
        },
        checkOut: {
            time: { type: Date },
            latitude: { type: Number },
            longitude: { type: Number },
            photoUrl: { type: [String], required: true }, // Live work photo URL
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

const Verification = mongoose.model('Verification', verificationSchema);
export default Verification;