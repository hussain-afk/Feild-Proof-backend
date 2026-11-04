import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
    managerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
    },
    plan: {
        type: String,
        enum: ["free", "trial", "basic", "enterprise", "pro"],
        required: true,
    },
    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Plan",
        default: null,
    },
    workerLimit: {
        type: Number,
        default: 0,
    },
    taskLimit: {
        type: Number,
        default: 0,
    },
    tasksUsed: {
        type: Number,
        default: 0,
        min: 0,
    },
    status: {
        type: String,
        enum: ["active", "expired", "canceled"],
        required: true,
    },
    endsAt: {
        type: Date,
        default: null,
    },
    stripeSessionId: {
        type: String,
        default: null,
    },
    stripePaymentIntentId: {
        type: String,
        default: null,
    },
}, {
    timestamps: true,
});

subscriptionSchema.index({ stripeSessionId: 1 }, { unique: true, sparse: true });

const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;