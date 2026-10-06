import AdminInfo from "../models/adminInfo.model.js";

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