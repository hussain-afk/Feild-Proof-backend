import mongoose from "mongoose";

const inviteWorkerSchema = new mongoose.Schema(
    {
        managerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        workerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "rejected"],
            default: "pending",
        },
    },
    {
        timestamps: true,
    }
);

inviteWorkerSchema.index(
    { managerId: 1, workerId: 1 },
    { unique: true, partialFilterExpression: { status: "pending" } }
);
inviteWorkerSchema.index({ workerId: 1, status: 1, createdAt: -1 });

const InviteWorker = mongoose.model("InviteWorker", inviteWorkerSchema);
export default InviteWorker;