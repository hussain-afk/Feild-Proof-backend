import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            select: false, // Security ke liye default query mein password skip hoga
        },
        role: {
            type: String,
            enum: ['admin', 'worker'],
            default: 'worker',
        },
        phone: {
            type: String,
            trim: true,
            default: '',
        },
        hourlyRate: {
            type: Number,
            default: 0, // Invoicing calculation ke liye (Worker role ke liye)
        },
        avatar: {
            type: String,
            default: '', // Profile picture URL
        },
    },
    {
        timestamps: true, // CreatedAt aur UpdatedAt automatically add kar dega
    }
);

const User = mongoose.model('User', userSchema);

export default User;