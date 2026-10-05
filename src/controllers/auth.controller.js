import User from '../models/user.model.js';
import bcrypt from 'bcryptjs';
import generateToken from '../services/token.service.js';
import uploadImage from '../services/uploadImage.service.js';
import AdminInfo from '../models/adminInfo.model.js';

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
        })
        const message = `New user registered with email: ${email}`;
        const token = generateToken(newUser);
        res.cookie('token', token,
            {
                httpOnly: true,
                sameSite: 'none',
                secure: true
            }
        )
        const adminInfo = await AdminInfo.create({ message });
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
    const message = `User logged in with email: ${email}`;
    res.cookie('token', token,
        {
            httpOnly: true,
            sameSite: 'none',
            secure: true
        }
    )
    const adminInfo = await AdminInfo.create({ message });
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
    if (!user || user.role !== 'manager' && user.role !== 'admin') {
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
        res.clearCookie("token",
            {
                httpOnly: true,
                secure: true,
                sameSite: "none",
            }
        );
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
        const { bankName, accountNumber, accountHolderName, jazzcashOrEasypaisa } = req.body;
        console.log(bankName, accountNumber, accountHolderName, jazzcashOrEasypaisa)
        console.log(userId)
        const user = await User.findByIdAndUpdate(userId, {
            paymentMethod: {
                bankName: bankName || '',
                accountNumber: accountNumber || '',
                accountHolderName: accountHolderName || '',
                jazzcashOrEasypaisa: jazzcashOrEasypaisa || ''
            }
        }, { returnDocument: 'after' });
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const updateUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = req.user;
        const avatar = req.file
        const { name, email, phone, hourlyRate, password } = req.body;
        if (!user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const uploadedImageUrl = avatar ? await uploadImage(avatar) : user.avatar;
        const hashedPassword = password ? await bcrypt.hash(password, 10) : user.password;
        const updatedUser = await User.findByIdAndUpdate(userId, {
            name,
            email,
            phone,
            hourlyRate,
            avatar: uploadedImageUrl,
            password: hashedPassword
        }, {
            returnDocument: 'after'
        });
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
        const updatedHourlyRate = hourlyRate || existingHourlyRate;
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