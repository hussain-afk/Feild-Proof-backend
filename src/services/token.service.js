import jwt from 'jsonwebtoken';
import envConfig from '../config/env.config.js';

const generateToken = (user) => {
    const payload = {
        id: user._id,
        role: user.role,
        email: user.email,
    };
    const token = jwt.sign(payload, envConfig.jwtSecret, { expiresIn: '2h' });
    return token;
}

export default generateToken;