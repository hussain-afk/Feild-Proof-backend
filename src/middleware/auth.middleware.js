import jwt from 'jsonwebtoken';
import envConfig from '../config/env.config.js';

const verifyToken = async (req, res, next) => {
    const token = req.cookies.token
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    try {
        const decoded = await jwt.verify(token, envConfig.jwtSecret);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid token.' });
    }
}

export default verifyToken;