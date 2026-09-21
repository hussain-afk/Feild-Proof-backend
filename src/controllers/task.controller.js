import Task from '../models/task.model.js';
import Notification from '../models/notification.model.js';
import mongoose from 'mongoose';

export const createTask = async (req, res) => {
    const { title, description, assignedWorker, siteLocation, dueDate } = req.body;
    const user = req.user;

    try {
        if (user.role !== 'manager') {
            return res.status(403).json({ message: 'Only admin or manager can create a task' });
        }

        if (!title || !assignedWorker || !siteLocation || !dueDate) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // 1. Task Document Create Karein
        const newTask = await Task.create({
            title,
            description,
            assignedWorker,
            siteLocation,
            dueDate,
            createdBy: user.id,
        });

        // 2. Created document par populate run karein
        const populatedTask = await newTask.populate('assignedWorker');

        const newNotification = await Notification.create({
            recipient: assignedWorker,
            sender: user.id,
            title: 'New Task Assigned',
            message: `You have been assigned a new task: "${title}"`,
            task: newTask._id,
        });

        const populatedNotification = await newNotification.populate('sender', 'name email');
        const io = req.app.get('io');

        if (io && assignedWorker) {
            io.to(assignedWorker.toString()).emit('new_task_assigned', {
                message: `New task assigned: ${title}`,
                task: populatedTask,
                notification: populatedNotification // Database notification object sent
            });
        }

        res.status(201).json(populatedTask);

    } catch (error) {
        res.status(500).json({ message: 'Error creating task', error: error.message });
    }
};

export const getMyTasks = async (req, res) => {
    try {
        // Current logged-in user ki ID extract karein
        const userId = req.user._id || req.user.id;

        // String ID ko ObjectId mein cast karein
        const workerObjectId = new mongoose.Types.ObjectId(userId);

        // Filter query: Dono ObjectIds match karein
        const tasks = await Task.find({ assignedWorker: workerObjectId })
            .populate('assignedWorker', 'name email role')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });

        // console.log(`[getMyTasks] Found ${tasks.length} tasks for user: ${userId}`);
        // console.log(tasks);
        return res.status(200).json(tasks);

    } catch (error) {
        console.error("getMyTasks error:", error);
        return res.status(500).json({ message: "Error fetching worker tasks", error: error.message });
    }
};

export const getTaskById = async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    try {
        if (user.role !== 'manager' && user.role !== 'worker') {
            return res.status(403).json({ message: 'Access denied' });
        }
        const task = await Task.findById(id).populate('assignedWorker');
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.status(200).json(task);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching task', error: error.message });
    }
}

export const getAllTasks = async (req, res) => {
    const user = req.user;
    try {
        if (user.role !== 'manager' && user.role !== 'worker') {
            return res.status(403).json({ message: 'Access denied' });
        }
        const tasks = await Task.find({}).populate('assignedWorker');
        res.status(200).json(tasks);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching tasks', error: error.message });
    }
}

export const deleteTask = async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    try {
        if (user.role !== 'manager') {
            return res.status(403).json({ message: 'Only manager can delete a task' });
        }
        const deletedTask = await Task.findByIdAndDelete(id);
        if (!deletedTask) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.status(200).json({ message: 'Task deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting task', error: error.message });
    }
}