import mongoose from "mongoose";
import User from "../models/user.model.js";

export const canChat = async (userAId, userBId) => {
    if (!userAId || !userBId) return false;
    if (String(userAId) === String(userBId)) return false;
    if (!mongoose.isValidObjectId(userAId) || !mongoose.isValidObjectId(userBId)) return false;

    const [userA, userB] = await Promise.all([
        User.findById(userAId).select("isBanned role managerId"),
        User.findById(userBId).select("isBanned role managerId"),
    ])
    if (!userA || !userB) return false;
    if (userA.isBanned || userB.isBanned) return false;
    // Manager → apna worker
    if (userA.role === "manager" && userB.role === "worker") {
        return String(userB.managerId) === String(userA._id);
    }
    // Worker → apna manager
    if (userA.role === "worker" && userB.role === "manager") {
        return String(userA.managerId) === String(userB._id);
    }
    return true;
}