import Task from '../models/task.model.js';
import Notification from '../models/notification.model.js';
import mongoose from 'mongoose';
import AdminInfo from '../models/adminInfo.model.js';
import User from '../models/user.model.js';

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

// Is file me pehle se jo imports hain wo rehne do, bas ye ek line add karo:
// import mongoose from "mongoose";
//
// emitToRooms aur notifyAdmins aapki file me pehle se hain.

export const createTask = async (req, res) => {
    const { title, description, assignedWorker, siteLocation, dueDate } = req.body;
    const user = req.user;
    const creatorId = user.id || user._id;

    try {
        // 1. Permission check
        if (user.role !== "manager" && user.role !== "admin") {
            return res.status(403).json({ message: "Only admin or manager can create a task" });
        }

        // 2. Title aur due date check
        if (typeof title !== "string" || !title.trim()) {
            return res.status(400).json({ message: "Title is required" });
        }

        if (!dueDate || Number.isNaN(new Date(dueDate).getTime())) {
            return res.status(400).json({ message: "A valid due date is required" });
        }

        // 3. Workers: array banao aur duplicate hatao
        const workersArray = Array.isArray(assignedWorker)
            ? assignedWorker
            : assignedWorker
                ? [assignedWorker]
                : [];

        const uniqueWorkers = [...new Set(workersArray.map(String))];

        if (uniqueWorkers.length === 0) {
            return res.status(400).json({ message: "Select at least one worker" });
        }

        if (!uniqueWorkers.every((id) => mongoose.isValidObjectId(id))) {
            return res.status(400).json({ message: "One or more worker ids are invalid" });
        }

        // Sab users waqai "worker" hone chahiye
        const workers = await User.find({
            _id: { $in: uniqueWorkers },
            role: "worker",
        }).select("_id");

        if (workers.length !== uniqueWorkers.length) {
            return res.status(400).json({ message: "All assigned users must be valid workers" });
        }

        // 4. Location (optional)
        // Frontend khali form me latitude/longitude "" bhejta hai. Number("") 0 ban jata hai,
        // isliye pehle check karte hain ke value sach me di gayi hai ya nahi.
        let validatedLocation = null;

        const hasLatitude = String(siteLocation?.latitude ?? "").trim() !== "";
        const hasLongitude = String(siteLocation?.longitude ?? "").trim() !== "";

        if (hasLatitude || hasLongitude) {
            if (!hasLatitude || !hasLongitude) {
                return res.status(400).json({ message: "Both latitude and longitude are required" });
            }

            const latitude = Number(siteLocation.latitude);
            const longitude = Number(siteLocation.longitude);
            const radius = Number(siteLocation.radiusInMeters) || 100; // na aaye to 100m

            if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
                return res.status(400).json({ message: "Invalid latitude" });
            }

            if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
                return res.status(400).json({ message: "Invalid longitude" });
            }

            // GPS me 20-50m ki galti aam hai, isliye 50m se chhota radius nahi
            if (radius < 50 || radius > 10000) {
                return res.status(400).json({ message: "Radius must be between 50 and 10000 meters" });
            }

            validatedLocation = {
                name: String(siteLocation.name || "").trim() || "Task location",
                latitude,
                longitude,
                radiusInMeters: radius,
            };
        }

        // 5. Task banao
        const taskData = {
            title: title.trim(),
            description,
            assignedWorker: uniqueWorkers,
            dueDate,
            createdBy: creatorId,
        };

        // Location sirf tab jab di gayi ho
        if (validatedLocation) {
            taskData.siteLocation = validatedLocation;
        }

        const newTask = await Task.create(taskData);

        const populatedTask = await newTask.populate("assignedWorker", "name email avatar role");

        // 6. Admin log, notifications aur socket
        // Alag try/catch me hai: task ban chuka hai, to yahan masla aaye tab bhi
        // user ko error nahi dikhana (warna wo dobara task bana dega).
        try {
            const io = req.app.get("io");

            await AdminInfo.create({
                message: `Task "${newTask.title}" created by ${user.name} (${user.role}) and assigned to ${uniqueWorkers.length} worker(s).`,
            });

            // Sab workers ki notifications ek hi baar me save
            const notifications = await Notification.insertMany(
                uniqueWorkers.map((workerId) => ({
                    recipient: workerId,
                    sender: creatorId,
                    title: "New Task Assigned",
                    message: `You have been assigned a new task: "${newTask.title}"`,
                    task: newTask._id,
                }))
            );

            // Har worker ko uski notification socket se bhejo
            notifications.forEach((notification) => {
                emitToRooms(io, [notification.recipient], "new_task_assigned", {
                    message: `New task assigned: ${newTask.title}`,
                    task: populatedTask,
                    notification: {
                        ...notification.toObject(),
                        sender: { _id: creatorId, name: user.name, email: user.email },
                    },
                });
            });

            // Task banane wale ki list aur admin dashboard update
            emitToRooms(io, [creatorId], "task_created", { task: populatedTask });
            notifyAdmins(io);
        } catch (notifyError) {
            console.error("Task was created, but notifications failed:", notifyError);
        }

        // 7. Jawab
        return res.status(201).json(populatedTask);

    } catch (error) {
        console.error("Task Creation Controller Error:", error);
        return res.status(500).json({ message: "Error creating task" });
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
        return res.status(500).json({ message: "Error fetching worker tasks" });
    }
};

export const getTaskById = async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    try {
        if (user.role !== 'manager' && user.role !== 'worker') {
            return res.status(403).json({ message: 'Access denied' });
        }
        const accessFilter = user.role === 'manager'
            ? { _id: id, createdBy: user.id || user._id }
            : { _id: id, assignedWorker: user.id || user._id };
        const task = await Task.findOne(accessFilter).populate('assignedWorker');
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.status(200).json(task);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching task' });
    }
};

export const getAllTasks = async (req, res) => {
    const user = req.user;
    try {
        if (user.role !== 'manager' && user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }
        const tasks = await Task.find({
            ...(user.role === 'manager' ? { createdBy: user.id || user._id } : {})
        }).populate('assignedWorker');
        res.status(200).json(tasks);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching tasks' });
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
        res.status(500).json({ message: 'Error deleting task' });
    }
};