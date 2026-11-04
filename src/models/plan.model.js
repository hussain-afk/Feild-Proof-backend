import mongoose from 'mongoose';
 const planSchema = new mongoose.Schema({
    plan: {
        type: String,
        enum: ["free","trial","basic","enterprise","pro"],
        required: true,
    },
    features: {
        type: [String],
        default: [],
    },
    days: {
        type: Number,
        default: 0,
    },
    price: {
        type: Number,
        default: 0,
    },
    workerLimit: {
        type: Number,
        default: 0,
    },
    taskLimit: {
        type: Number,
        default: 0,
    },
    status: {
        type: String,
        enum: ["active", "inactive", "expired"],
        default: "inactive",
    },
 })

 const Plan = mongoose.model("Plan", planSchema);
 export default Plan