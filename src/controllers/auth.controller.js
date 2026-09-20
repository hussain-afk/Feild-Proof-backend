import User from '../models/user.model.js';
import bcrypt from 'bcryptjs';
import generateToken from '../services/token.service.js';

export const registerUser = async (req, res) => {
    try {
        const { name, email, password, phone, role, hourlyRate, avatar } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, password, phone, role, and hourlyRate are required' });
        }
        const isUserExists = await User.findOne({ email });
        if (isUserExists) {
            return res.status(400).json({ message: 'User already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            name,
            email,
            phone,
            role,
            hourlyRate,
            avatar,
            password: hashedPassword,
        });
        const token = generateToken(newUser);
        res.cookie('token', token,
            // {
            //     httpOnly: true,
            //     sameSite: 'none',
            //     secure: true
            // }
        )
        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const loginUser = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }
    const isUserValid = await User.findOne({ email }).select('+password');
    if (!isUserValid) {
        return res.status(401).json({ message: 'Not a valid user with this email' });
    }
    const isPasswordValid = await bcrypt.compare(password, isUserValid.password);
    if (!isPasswordValid) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = generateToken(isUserValid);
    res.cookie('token', token,
        // {
        //     httpOnly: true,
        //     sameSite: 'none',
        //     secure: true
        // }
    )
    res.status(200).json(isUserValid);
}

export const getCurrentUser = async (req, res) => {
    const user = req.user;
    try {
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const currentUser = await User.findById(user.id).select('-password');
        res.status(200).json(currentUser);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const getAllUsers = async (req, res) => {
    const user = req.user;
    if (!user || user.role !== 'manager') {
        return res.status(403).json({ message: 'Access denied' });
    }
    try {
        const users = await User.find().select('-password');
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const logoutUser = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        res.clearCookie('token');
        res.status(200).json({ message: 'Logout successful' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}