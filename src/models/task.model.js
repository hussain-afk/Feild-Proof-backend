import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Task title is required'],
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        assignedWorker: {
            type: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }],
            validate: {
                validator: function (v) {
                    return Array.isArray(v) && v.length > 0;
                },
                message: 'At least one assigned worker is required'
            }
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        siteLocation: {
            type: {
                name: { type: String, required: true },
                latitude: { type: Number, required: true, min: -90, max: 90 },
                longitude: { type: Number, required: true, min: -180, max: 180 },
                radiusInMeters: { type: Number, default: 100, min: 10, max: 10000 },
            },
            required: false,
        },
        status: {
            type: String,
            enum: ['pending', 'in-progress', 'completed', 'cancelled'],
            default: 'pending',
        },
        dueDate: {
            type: Date,
            required: true,
            validate: { validator: (value) => !Number.isNaN(value.getTime()), message: 'Invalid due date' },
        },
    },
    { timestamps: true }
);

const Task = mongoose.model('Task', taskSchema);
export default Task;