
import Task from "../models/task.model.js";
import Notification from "../models/notification.model.js";
import mongoose from "mongoose";
import AdminInfo from "../models/adminInfo.model.js";
import User from "../models/user.model.js";
import Verification from "../models/verification.model.js";

import {
    reserveManagerTaskSlot,
    releaseManagerTaskSlot,
} from "../services/plan.service.js";

// ---------------------------------------------------------------
// Socket helpers
// ---------------------------------------------------------------

const emitToRooms = (io, rooms, event, payload) => {
    if (!io) return;

    const unique = [
        ...new Set(rooms.filter(Boolean).map(String)),
    ];

    unique.forEach((room) => {
        io.to(room).emit(event, payload);
    });
};

const notifyAdmins = (io) => {
    if (io) {
        io.to("admins").emit("admin_info_updated");
    }
};

const getPagination = (query) => {
    if (
        query.page === undefined &&
        query.limit === undefined
    ) {
        return null;
    }

    const page = Math.max(
        Number.parseInt(query.page, 10) || 1,
        1
    );

    const limit = Math.min(
        Math.max(
            Number.parseInt(query.limit, 10) || 20,
            1
        ),
        50
    );

    return {
        page,
        limit,
        skip: (page - 1) * limit,
    };
};

// ---------------------------------------------------------------
// CREATE TASK
// ---------------------------------------------------------------

export const createTask = async (req, res) => {
    const {
        title,
        description,
        assignedWorker,
        siteLocation,
        dueDate,
    } = req.body;

    const user = req.user;
    const creatorId = user.id || user._id;

    let slotReserved = false;
    let taskCreated = false;

    try {
        // 1. Permission check
        if (user.role !== "manager") {
            return res.status(403).json({
                message: "Only manager can create a task",
            });
        }

        if (!mongoose.isValidObjectId(creatorId)) {
            return res.status(400).json({
                message: "Invalid manager ID",
            });
        }

        // 2. Validate title
        if (
            typeof title !== "string" ||
            !title.trim()
        ) {
            return res.status(400).json({
                message: "Title is required",
            });
        }

        // 3. Validate due date
        if (
            !dueDate ||
            Number.isNaN(new Date(dueDate).getTime())
        ) {
            return res.status(400).json({
                message: "A valid due date is required",
            });
        }

        // 4. Normalize workers array
        const workersArray = Array.isArray(assignedWorker)
            ? assignedWorker
            : assignedWorker
                ? [assignedWorker]
                : [];

        const uniqueWorkers = [
            ...new Set(workersArray.map(String)),
        ];

        if (uniqueWorkers.length === 0) {
            return res.status(400).json({
                message: "Select at least one worker",
            });
        }

        // 5. Validate worker IDs
        if (
            !uniqueWorkers.every((id) =>
                mongoose.isValidObjectId(id)
            )
        ) {
            return res.status(400).json({
                message: "One or more worker ids are invalid",
            });
        }

        // 6. Confirm workers belong to this manager
        const workers = await User.find({
            _id: { $in: uniqueWorkers },
            role: "worker",
            managerId: creatorId,
        }).select("_id");

        if (workers.length !== uniqueWorkers.length) {
            return res.status(400).json({
                message: "All assigned users must be valid workers",
            });
        }

        // 7. Validate optional location
        let validatedLocation = null;

        const hasLatitude =
            String(siteLocation?.latitude ?? "").trim() !== "";

        const hasLongitude =
            String(siteLocation?.longitude ?? "").trim() !== "";

        if (hasLatitude || hasLongitude) {
            if (!hasLatitude || !hasLongitude) {
                return res.status(400).json({
                    message: "Both latitude and longitude are required",
                });
            }

            const latitude = Number(siteLocation.latitude);
            const longitude = Number(siteLocation.longitude);

            const radius =
                siteLocation.radiusInMeters === undefined ||
                siteLocation.radiusInMeters === null ||
                siteLocation.radiusInMeters === ""
                    ? 100
                    : Number(siteLocation.radiusInMeters);

            if (
                !Number.isFinite(latitude) ||
                latitude < -90 ||
                latitude > 90
            ) {
                return res.status(400).json({
                    message: "Invalid latitude",
                });
            }

            if (
                !Number.isFinite(longitude) ||
                longitude < -180 ||
                longitude > 180
            ) {
                return res.status(400).json({
                    message: "Invalid longitude",
                });
            }

            if (
                !Number.isFinite(radius) ||
                radius < 50 ||
                radius > 10000
            ) {
                return res.status(400).json({
                    message: "Radius must be between 50 and 10000 meters",
                });
            }

            validatedLocation = {
                name:
                    String(siteLocation.name || "").trim() ||
                    "Task location",
                latitude,
                longitude,
                radiusInMeters: radius,
            };
        }

        // 8. Atomically reserve subscription task slot
        const reservation = await reserveManagerTaskSlot(
            creatorId
        );

        if (!reservation.ok) {
            return res.status(reservation.statusCode).json({
                message: reservation.message,
            });
        }

        slotReserved = true;

        // 9. Create task
        const taskData = {
            title: title.trim(),
            description,
            assignedWorker: uniqueWorkers,
            dueDate,
            createdBy: creatorId,
        };

        if (validatedLocation) {
            taskData.siteLocation = validatedLocation;
        }

        const newTask = await Task.create(taskData);
        taskCreated = true;

        const populatedTask = await newTask.populate(
            "assignedWorker",
            "name email avatar role"
        );

        // 10. Admin log, notifications and sockets
        // These are post-creation side effects.
        // Their failure must not cause task slot rollback.
        try {
            const io = req.app.get("io");

            await AdminInfo.create({
                message: `Task "${newTask.title}" created by ${user.name} (${user.role}) and assigned to ${uniqueWorkers.length} worker(s).`,
            });

            const notifications = await Notification.insertMany(
                uniqueWorkers.map((workerId) => ({
                    recipient: workerId,
                    sender: creatorId,
                    title: "New Task Assigned",
                    message: `You have been assigned a new task: "${newTask.title}"`,
                    task: newTask._id,
                }))
            );

            notifications.forEach((notification) => {
                emitToRooms(
                    io,
                    [notification.recipient],
                    "new_task_assigned",
                    {
                        message: `New task assigned: ${newTask.title}`,
                        task: populatedTask,
                        notification: {
                            ...notification.toObject(),
                            sender: {
                                _id: creatorId,
                                name: user.name,
                                email: user.email,
                            },
                        },
                    }
                );
            });

            emitToRooms(
                io,
                [creatorId],
                "task_created",
                {
                    task: populatedTask,
                }
            );

            notifyAdmins(io);
        } catch (notifyError) {
            console.error(
                "Task was created, but notifications failed:",
                notifyError
            );
        }

        return res.status(201).json(populatedTask);

    } catch (error) {
        console.error(
            "Task Creation Controller Error:",
            error
        );

        // Roll back only when task was NOT created.
        if (slotReserved && !taskCreated) {
            try {
                await releaseManagerTaskSlot(creatorId);
            } catch (rollbackError) {
                console.error(
                    "Task slot rollback failed:",
                    rollbackError
                );
            }
        }

        return res.status(500).json({
            message: "Error creating task",
        });
    }
};

// ---------------------------------------------------------------
// GET MY TASKS
// ---------------------------------------------------------------

export const getMyTasks = async (req, res) => {
    try {
        const workerId = req.user._id || req.user.id;

        const pagination = getPagination(req.query);

        let taskQuery = Task.find({
            assignedWorker: workerId,
        })
            .populate("assignedWorker", "name email role")
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 });

        if (pagination) {
            taskQuery = taskQuery
                .skip(pagination.skip)
                .limit(pagination.limit);
        }

        const tasks = await taskQuery;

        const records = await Verification.find({
            worker: workerId,
            task: {
                $in: tasks.map((task) => task._id),
            },
        }).select("task checkOut.time");

        const progressByTask = new Map(
            records.map((record) => [
                String(record.task),
                record.checkOut?.time
                    ? "checked_out"
                    : "checked_in",
            ])
        );

        const result = tasks.map((task) => ({
            ...task.toObject(),
            myProgress:
                progressByTask.get(String(task._id)) ||
                "not_started",
        }));

        return res.status(200).json(result);

    } catch (error) {
        console.error("getMyTasks error:", error);

        return res.status(500).json({
            message: "Error fetching worker tasks",
        });
    }
};

// ---------------------------------------------------------------
// GET TASK BY ID
// ---------------------------------------------------------------

export const getTaskById = async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    try {
        if (
            user.role !== "manager" &&
            user.role !== "worker"
        ) {
            return res.status(403).json({
                message: "Access denied",
            });
        }

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                message: "Invalid task ID",
            });
        }

        const userId = user.id || user._id;

        const accessFilter =
            user.role === "manager"
                ? {
                    _id: id,
                    createdBy: userId,
                }
                : {
                    _id: id,
                    assignedWorker: userId,
                };

        const task = await Task.findOne(accessFilter)
            .populate(
                "assignedWorker",
                "name email avatar role"
            );

        if (!task) {
            return res.status(404).json({
                message: "Task not found",
            });
        }

        return res.status(200).json(task);

    } catch (error) {
        console.error("getTaskById error:", error);

        return res.status(500).json({
            message: "Error fetching task",
        });
    }
};

// ---------------------------------------------------------------
// GET ALL TASKS
// ---------------------------------------------------------------

export const getAllTasks = async (req, res) => {
    const user = req.user;

    try {
        if (
            user.role !== "manager" &&
            user.role !== "admin"
        ) {
            return res.status(403).json({
                message: "Access denied",
            });
        }

        const pagination = getPagination(req.query);

        let taskQuery = Task.find({
            ...(user.role === "manager"
                ? {
                    createdBy: user.id || user._id,
                }
                : {}),
        })
            .populate(
                "assignedWorker",
                "name email avatar role"
            )
            .sort({ createdAt: -1 });

        if (pagination) {
            taskQuery = taskQuery
                .skip(pagination.skip)
                .limit(pagination.limit);
        }

        const tasks = await taskQuery;

        return res.status(200).json(tasks);

    } catch (error) {
        console.error("getAllTasks error:", error);

        return res.status(500).json({
            message: "Error fetching tasks",
        });
    }
};

// ---------------------------------------------------------------
// DELETE TASK
// ---------------------------------------------------------------

export const deleteTask = async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    try {
        if (
            user.role !== "manager" &&
            user.role !== "admin"
        ) {
            return res.status(403).json({
                message: "Only manager & admin can delete a task",
            });
        }

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                message: "Invalid task ID",
            });
        }

        const task = await Task.findById(id);

        if (!task) {
            return res.status(404).json({
                message: "Task not found",
            });
        }

        const userId = String(user.id || user._id);

        if (
            user.role === "manager" &&
            String(task.createdBy) !== userId
        ) {
            return res.status(403).json({
                message: "You can only delete tasks you created",
            });
        }

        // Delete task and its related records.
        await task.deleteOne();

        await Verification.deleteMany({
            task: task._id,
        });

        await Notification.deleteMany({
            task: task._id,
        });

        // Keep task counter synchronized for manager deletion.
        if (task.createdBy) {
            await releaseManagerTaskSlot(task.createdBy);
        }

        await AdminInfo.create({
            message: `Task "${task.title}" deleted by ${user.name} (${user.role})`,
        });

        const io = req.app.get("io");

        const payload = {
            taskId: String(task._id),
        };

        emitToRooms(
            io,
            [
                task.createdBy,
                ...(task.assignedWorker || []),
            ],
            "task_deleted",
            payload
        );

        notifyAdmins(io);

        return res.status(200).json({
            message: "Task deleted successfully",
            taskId: payload.taskId,
        });

    } catch (error) {
        console.error("deleteTask error:", error);

        return res.status(500).json({
            message: "Error deleting task",
        });
    }
};
