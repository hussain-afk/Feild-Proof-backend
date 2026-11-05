import mongoose from "mongoose";

const rejectedTaskSchema = new mongoose.Schema({
    task: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
        required: true,
    },
    worker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    message: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
})

const RejectedTask = mongoose.model("RejectedTask", rejectedTaskSchema);
export default RejectedTask; 