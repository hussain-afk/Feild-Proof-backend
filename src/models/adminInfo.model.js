import mongoose from 'mongoose';

const adminInfoSchema = new mongoose.Schema({
    message: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
})

const AdminInfo = mongoose.model('AdminInfo', adminInfoSchema);

export default AdminInfo;