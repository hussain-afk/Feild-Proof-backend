import jwt from 'jsonwebtoken';
import envConfig from '../config/env.config.js';

const generateToken = (user) => {
    // console.log("Generating token for user:", user); // Debugging line
    const payload = {
        id: user._id,
        name: user.name,
        role: user.role,
        email: user.email,
        isBanned: user.isBanned,
    };
    const token = jwt.sign(payload, envConfig.jwtSecret, { expiresIn: '2h' });
    return token;
}

export default generateToken;