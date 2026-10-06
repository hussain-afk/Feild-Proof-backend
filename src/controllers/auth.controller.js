import User from '../models/user.model.js';
import bcrypt from 'bcryptjs';
import generateToken from '../services/token.service.js';
import uploadImage from '../services/uploadImage.service.js';
import AdminInfo from '../models/adminInfo.model.js';

const cookieOptions = {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
};

export const registerUser = async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required' });
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
            role: 'worker',
            password: hashedPassword,
        })
        const message = `New user registered with email: ${email}`;
        const token = generateToken(newUser);
        res.cookie('token', token, cookieOptions);
        const adminInfo = await AdminInfo.create({ message });
        const safeUser = newUser.toObject();
        delete safeUser.password;
        res.status(201).json(safeUser);
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
    const message = `User logged in with email: ${email}`;
    res.cookie('token', token, cookieOptions);
    await AdminInfo.create({ message });
    const safeUser = isUserValid.toObject();
    delete safeUser.password;
    res.status(200).json(safeUser);
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
    if (!user || user.role !== 'manager' && user.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied' });
    }
    try {
        const users = await User.find().select('name email phone hourlyRate avatar role createdAt updatedAt');
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
        res.clearCookie("token", cookieOptions);
        const message = `User logged out with email: ${user.email}`;
        const adminInfo = await AdminInfo.create({ message });
        res.status(200).json({ message: 'Logout successful' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const updatePaymentStatus = async (req, res) => {
    try {
        const userId = req.params.id;
        const actorId = String(req.user.id || req.user._id);
        if (actorId !== String(userId) && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'You can only update your own payment method' });
        }
        const { bankName, accountNumber, accountHolderName, jazzcashOrEasypaisa } = req.body;
        const user = await User.findByIdAndUpdate(userId, {
            paymentMethod: {
                bankName: bankName || '',
                accountNumber: accountNumber || '',
                accountHolderName: accountHolderName || '',
                jazzcashOrEasypaisa: jazzcashOrEasypaisa || ''
            }
        }, { returnDocument: 'after' });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const updateUser = async (req, res) => {
    try {
        const user = req.user;
        const userId = req.params.id;
        const avatar = req.file
        const { name, email, phone, hourlyRate, password } = req.body;
        if (!user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        if (String(user.id || user._id) !== String(userId)) {
            return res.status(403).json({ message: 'You can only update your own profile' });
        }
        const existingUser = await User.findById(userId).select('+password');
        if (!existingUser) return res.status(404).json({ message: 'User not found' });
        const uploadedImageUrl = avatar ? await uploadImage(avatar) : existingUser.avatar;
        const hashedPassword = password ? await bcrypt.hash(password, 10) : existingUser.password;
        const updatedUser = await User.findByIdAndUpdate(userId, {
            name,
            email,
            phone,
            hourlyRate,
            avatar: uploadedImageUrl,
            password: hashedPassword
        }, {
            returnDocument: 'after',
            runValidators: true,
            select: '-password',
        });
        if (!updatedUser) return res.status(404).json({ message: 'User not found' });
        const message = `User updated with email: ${updatedUser.email}`;
        const adminInfo = await AdminInfo.create({ message });
        res.status(200).json(updatedUser);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const updateByAdmin = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = req.user;
        const { name, email, phone, hourlyRate, role } = req.body;
        if (!user || user.role !== 'admin') {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const existingUser = await User.findById(userId);
        if (!existingUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        if(existingUser.role === 'admin' && role !== 'admin') {
            return res.status(403).json({ message: 'Cannot change role of an admin user' });
        }
        const existingName = existingUser.name;
        const existingEmail = existingUser.email;
        const existingPhone = existingUser.phone;
        const existingHourlyRate = existingUser.hourlyRate;
        const existingRole = existingUser.role;
        const updatedName = name || existingName;
        const updatedEmail = email || existingEmail;
        const updatedPhone = phone || existingPhone;
        const updatedHourlyRate = hourlyRate === undefined || hourlyRate === '' ? existingHourlyRate : hourlyRate;
        const updatedRole = role || existingRole;
        const updatedUser = await User.findByIdAndUpdate(userId, {
            name: updatedName,
            email: updatedEmail,
            phone: updatedPhone,
            hourlyRate: updatedHourlyRate,
            role: updatedRole
        }, {
            returnDocument: 'after'
        });
        const message = `User updated by admin with email: ${updatedUser.email}`;
        const adminInfo = await AdminInfo.create({ message });
        res.status(200).json(updatedUser);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const deleteUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = req.user;
        if (!user || user.role !== 'admin') {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const deletedUser = await User.findByIdAndDelete(userId);
        if (!deletedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        const message = `User deleted with email: ${deletedUser.email}`;
        const adminInfo = await AdminInfo.create({ message });
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}