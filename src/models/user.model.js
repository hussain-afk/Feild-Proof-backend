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
            select: false,
        },
        role: {
            type: String,
            enum: ['admin', 'manager', 'worker'],
            default: 'worker',
        },
        phone: {
            type: String,
            trim: true,
            default: '',
        },
        hourlyRate: {
            type: Number,
            default: 0,
        },
        avatar: {
            type: String,
            default: '',
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        emailVerificationCode: {
            type: String,
            default: null,
        },

        emailVerificationExpires: {
            type: Date,
            default: null,
        },
        isBlocked: {
            type: Boolean,
            default: false,
        },
        paymentMethod: {
            type: {
                bankName: {
                    type: String,
                    default: '',
                    trim: true,
                },
                accountNumber: {
                    type: String,
                    default: '',
                    trim: true,
                },
                accountHolderName: {
                    type: String,
                    default: '',
                    trim: true,
                },
                jazzcashOrEasypaisa: {
                    type: String,
                    default: '',
                    trim: true,
                },
            },
            default: null, // Initial save par value null jayegi
        },
    },
    {
        timestamps: true,
    }
);

const User = mongoose.model('User', userSchema);

export default User;