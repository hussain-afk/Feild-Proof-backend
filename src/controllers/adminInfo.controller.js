import AdminInfo from "../models/adminInfo.model.js";
import User from "../models/user.model.js";

export const getAdminInfos = async (req, res) => {
    try {
        const user = req.user;
        if (user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Only admins can view admin info.' });
        }
        const adminInfos = await AdminInfo.find().sort({ createdAt: -1 });
        return res.status(200).json(adminInfos);
    } catch (error) {
        console.error('Admin info fetch error:', error);
        return res.status(500).json({ message: 'Error fetching admin info' });
    }
}

export const getAllManagerRequests = async (req, res) => {
    try {
        const user = req.user;
        if (user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Only admins can view manager requests.' });
        }
        const managerRequests = await User.find({ role: 'pending_manager' }).sort({ createdAt: -1 });
        req.app.get("io")?.to("admins").emit("manager_requests_updated");
        return res.status(200).json(managerRequests);
    } catch (error) {
        console.error('Manager requests fetch error:', error);
        return res.status(500).json({ message: 'Error fetching manager requests' });
    }
}
export const updateManagerRequest = async (req, res) => {
    try {
        const user = req.user;
        if (user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Only admins can update manager requests.' });
        }
        const { status } = req.body;
        const userId = req.params.id;
        
        if (!userId || !status) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        let updatedStatus = null;
        if (status === 'approved') {
            updatedStatus = 'manager';
        } else if (status === 'rejected') {
            const bannedUser = await User.findByIdAndUpdate(userId, { isBanned: true }, { returnDocument: 'after' });
            if(!bannedUser){
                return res.status(404).json({ message: 'User not found' });
            }
            return res.status(200).json({ message: 'Manager request rejected and user banned'});
        }
        const updatedUser = await User.findByIdAndUpdate(userId, { role: updatedStatus }, { returnDocument: 'after' });
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        req.app.get("io")?.to("admins").emit("manager_requests_updated");
        return res.status(200).json(updatedUser);
    } catch (error) {
        console.error('Manager request update error:', error);
        return res.status(500).json({ message: 'Error updating manager request' });
    }
}