import mongoose from "mongoose";

// Sirf EK document: site band hai ya nahi
const maintenanceSchema = new mongoose.Schema({
    key: {
    type: String,
    default: "main",
    unique: true,
  },
  enabled: {
    type: Boolean,
    default: false, // false = site khuli
  },
  message: {
    type: String,
    default: "",
    maxlength: 500, // max 500 characters
  },
  // kab khulegi (optional) — khali chhod sakte ho
  endsAt: {
    type: Date,
    default: null,
  },
});

export default mongoose.model("Maintenance", maintenanceSchema);