import jwt from 'jsonwebtoken';
import envConfig from '../config/env.config.js';
import BlackListTokens from '../models/blackListTokens.model.js';
import User from '../models/user.model.js';
import { maintenanceBlocks } from "../controllers/maintenance.controller.js";

const verifyToken = async (req, res, next) => {
    const token = req.cookies.token
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    const isBlacklisted = await BlackListTokens.findOne({ token });
    if (isBlacklisted) {
        return res.status(401).json({ message: 'Access denied. Token is blacklisted.' });
    }
    try {
        const decoded = await jwt.verify(token, envConfig.jwtSecret);
        const userId = decoded.userId || decoded.id || decoded._id;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({ message: 'User not found.' });
        }
        if (user.isBanned) {
            return res.status(403).json({ message: 'Access denied. User is banned.' });
        }
        req.user = user;
        const blockStatus = await maintenanceBlocks(req.user);
        if (blockStatus) {
             res.set("Retry-After", "600");
           return res.status(503).json({ code: "MAINTENANCE", message: blockStatus.message, endsAt: blockStatus.endsAt });
        }
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid token.' });
    }
}

export default verifyToken;