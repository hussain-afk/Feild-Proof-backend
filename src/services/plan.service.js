
import mongoose from "mongoose";
import User from "../models/user.model.js";
import Invitation from "../models/inviteWorker.model.js";
import Subscription from "../models/subscription.model.js";
import Task from "../models/task.model.js";

export function isSubActive(sub) {
    if (!sub || sub.status !== "active") return false;

    if (sub.plan === "free") return true;

    if (sub.endsAt && new Date(sub.endsAt) < new Date()) {
        return false;
    }

    return true;
}

export async function assertManagerCanAddWorker(managerId) {
    const manager = await User.findById(managerId);

    if (!manager || manager.role !== "manager") {
        return {
            ok: false,
            statusCode: 403,
            message: "Only managers can add workers",
        };
    }

    const sub = await Subscription.findOne({ managerId: manager._id });

    if (!isSubActive(sub)) {
        return {
            ok: false,
            statusCode: 403,
            message: "Your plan has expired. Please upgrade.",
        };
    }

    const limit = sub.workerLimit ?? 0;

    const linkedCount = await User.countDocuments({
        role: "worker",
        managerId: manager._id,
    });

    const pendingInviteCount = await Invitation.countDocuments({
        managerId: manager._id,
        status: "pending",
    });

    const used = linkedCount + pendingInviteCount;

    if (used >= limit) {
        return {
            ok: false,
            statusCode: 403,
            message: `Worker limit reached (${limit}). Upgrade your plan.`,
        };
    }

    return {
        ok: true,
        manager,
        subscription: sub,
    };
}

// Synchronize old subscriptions with existing task counts.
export async function syncManagerTaskUsage(managerId) {
    if (!mongoose.isValidObjectId(managerId)) {
        throw new Error("Invalid manager ID");
    }

    const used = await Task.countDocuments({
        createdBy: managerId,
    });

    await Subscription.updateOne(
        {
            managerId,
            $or: [
                { tasksUsed: { $exists: false } },
                { tasksUsed: null },
            ],
        },
        {
            $set: { tasksUsed: used },
        }
    );

    return used;
}

// Atomically reserve one task slot.
export async function reserveManagerTaskSlot(managerId) {
    const manager = await User.findById(managerId);

    if (!manager || manager.role !== "manager") {
        return {
            ok: false,
            statusCode: 403,
            message: "Only managers can add tasks",
        };
    }

    const sub = await Subscription.findOne({ managerId });

    if (!isSubActive(sub)) {
        return {
            ok: false,
            statusCode: 403,
            message: "Your plan has expired. Please upgrade.",
        };
    }

    await syncManagerTaskUsage(managerId);

    const updatedSubscription = await Subscription.findOneAndUpdate(
        {
            managerId,
            status: "active",
            taskLimit: { $gt: 0 },
            $expr: {
                $lt: [
                    { $ifNull: ["$tasksUsed", 0] },
                    "$taskLimit",
                ],
            },
            $or: [
                { plan: "free" },
                { endsAt: null },
                { endsAt: { $gt: new Date() } },
            ],
        },
        {
            $inc: { tasksUsed: 1 },
        },
        {
            new: true,
        }
    );

    if (!updatedSubscription) {
        return {
            ok: false,
            statusCode: 403,
            message: `Task limit reached (${sub.taskLimit ?? 0}). Upgrade your plan.`,
        };
    }

    return {
        ok: true,
        manager,
        subscription: updatedSubscription,
    };
}

export async function releaseManagerTaskSlot(managerId) {
    await Subscription.updateOne(
        {
            managerId,
            tasksUsed: { $gt: 0 },
        },
        {
            $inc: { tasksUsed: -1 },
        }
    );
}
