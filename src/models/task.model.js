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
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Assigned worker is required'],
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        siteLocation: {
            name: { type: String, required: true },
            latitude: { type: Number, required: true },
            longitude: { type: Number, required: true },
            radiusInMeters: { type: Number, default: 100 }, // Geo-fencing radius
        },
        status: {
            type: String,
            enum: ['pending', 'in-progress', 'completed', 'cancelled'],
            default: 'pending',
        },
        dueDate: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

const Task = mongoose.model('Task', taskSchema);
export default Task;