import Task from '../models/task.model.js';
import Notification from '../models/notification.model.js';
import mongoose from 'mongoose';

export const createTask = async (req, res) => {
    const { title, description, assignedWorker, siteLocation, dueDate } = req.body;
    // console.log("Assigned Workers Received:", assignedWorker);
    const user = req.user;

    try {
        if (user.role !== 'manager' && user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admin or manager can create a task' });
        }

        // 1. Ensure assignedWorker is an Array (Normalizes single or multiple worker IDs)
        const workersArray = Array.isArray(assignedWorker) 
            ? assignedWorker 
            : assignedWorker ? [assignedWorker] : [];

        if (!title || workersArray.length === 0 || !siteLocation || !dueDate) {
            return res.status(400).json({ message: 'Missing required fields or workers selection' });
        }

        // 2. Task Document Create Karein (Array pass karein)
        const newTask = await Task.create({
            title,
            description,
            assignedWorker: workersArray,
            siteLocation,
            dueDate,
            createdBy: user.id || user._id,
        });

        // 3. Populate Array of Assigned Workers
        const populatedTask = await newTask.populate('assignedWorker', 'name email avatar role');

        const io = req.app.get('io');

        // 4. Har Worker ke liye alag Notification banayein aur Socket Emit karein
        const notificationPromises = workersArray.map(async (workerId) => {
            // Notification Record in DB
            const newNotification = await Notification.create({
                recipient: workerId,
                sender: user.id || user._id,
                title: 'New Task Assigned',
                message: `You have been assigned a new task: "${title}"`,
                task: newTask._id,
            });

            const populatedNotification = await newNotification.populate('sender', 'name email');

            // Individual Socket Room Emit
            if (io) {
                io.to(workerId.toString()).emit('new_task_assigned', {
                    message: `New task assigned: ${title}`,
                    task: populatedTask,
                    notification: populatedNotification
                });
            }

            return newNotification;
        });

        await Promise.all(notificationPromises);

        // 5. Response Return
        res.status(201).json(populatedTask);

    } catch (error) {
        console.error("Task Creation Controller Error:", error);
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
        const tasks = await Task.find({
            createdBy: user.id
        }).populate('assignedWorker');
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