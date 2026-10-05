import Task from '../models/task.model.js';
import Notification from '../models/notification.model.js';
import mongoose from 'mongoose';
import AdminInfo from '../models/adminInfo.model.js';

// ---------------------------------------------------------------
// Small helper: ek event ko kai rooms me bhejta hai.
// Room name = user ki id (frontend "join_room" me wahi join karta hai)
// ---------------------------------------------------------------
const emitToRooms = (io, rooms, event, payload) => {
    if (!io) return;
    const unique = [...new Set(rooms.filter(Boolean).map(String))];
    unique.forEach((room) => io.to(room).emit(event, payload));
};

// Admin dashboard ko batao ke AdminInfo me nayi row aayi hai
const notifyAdmins = (io) => {
    if (io) io.to('admins').emit('admin_info_updated');
};

export const createTask = async (req, res) => {
    const { title, description, assignedWorker, siteLocation, dueDate } = req.body;
    const user = req.user;

    try {
        if (user.role !== 'manager' && user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admin or manager can create a task' });
        }

        // 1. Ensure assignedWorker is an Array
        const workersArray = Array.isArray(assignedWorker)
            ? assignedWorker
            : assignedWorker ? [assignedWorker] : [];

        if (!title || workersArray.length === 0 || !siteLocation || !dueDate) {
            return res.status(400).json({ message: 'Missing required fields or workers selection' });
        }

        // 2. Task create
        const creatorId = user.id || user._id;
        const newTask = await Task.create({
            title,
            description,
            assignedWorker: workersArray,
            siteLocation,
            dueDate,
            createdBy: creatorId,
        });

        await AdminInfo.create({
            message: `Task "${title}" created by ${user.name} (${user.role}) and assigned to ${workersArray.length} worker(s).`,
        });

        // 3. Populate
        const populatedTask = await newTask.populate('assignedWorker', 'name email avatar role');

        const io = req.app.get('io');

        // 4. Har worker ke liye notification + socket emit
        const notificationPromises = workersArray.map(async (workerId) => {
            const newNotification = await Notification.create({
                recipient: workerId,
                sender: creatorId,
                title: 'New Task Assigned',
                message: `You have been assigned a new task: "${title}"`,
                task: newTask._id,
            });

            const populatedNotification = await newNotification.populate('sender', 'name email');

            emitToRooms(io, [workerId], 'new_task_assigned', {
                message: `New task assigned: ${title}`,
                task: populatedTask,
                notification: populatedNotification,
            });

            return newNotification;
        });

        await Promise.all(notificationPromises);

        // 5. Task banane wale (manager) ki list foran update ho
        //    (getAllTasks sirf createdBy ke tasks deta hai, isliye sirf creator ko bhejte hain)
        emitToRooms(io, [creatorId], 'task_created', { task: populatedTask });

        // 6. Admin dashboard refresh
        notifyAdmins(io);

        res.status(201).json(populatedTask);

    } catch (error) {
        console.error("Task Creation Controller Error:", error);
        res.status(500).json({ message: 'Error creating task', error: error.message });
    }
};

export const getMyTasks = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const workerObjectId = new mongoose.Types.ObjectId(userId);

        const tasks = await Task.find({ assignedWorker: workerObjectId })
            .populate('assignedWorker', 'name email role')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });

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
};

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
};

export const deleteTask = async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    try {
        if (user.role !== 'manager' && user.role !== 'admin') {
            return res.status(403).json({ message: 'Only manager & admin can delete a task' });
        }

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Security: manager sirf apna banaya hua task delete kar sakta hai
        const userId = String(user.id || user._id);
        if (user.role === 'manager' && String(task.createdBy) !== userId) {
            return res.status(403).json({ message: 'You can only delete tasks you created' });
        }

        await task.deleteOne();

        await AdminInfo.create({
            message: `Task "${task.title}" deleted by ${user.name} (${user.role})`,
        });

        // Real-time: creator, assigned workers aur admins ko batao
        const io = req.app.get('io');
        const payload = { taskId: String(task._id) };

        emitToRooms(
            io,
            [task.createdBy, ...(task.assignedWorker || [])],
            'task_deleted',
            payload
        );
        notifyAdmins(io);

        res.status(200).json({ message: 'Task deleted successfully', taskId: payload.taskId });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting task', error: error.message });
    }
};