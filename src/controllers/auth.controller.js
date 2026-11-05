import User from '../models/user.model.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import generateToken from '../services/token.service.js';
import uploadImage from '../services/uploadImage.service.js';
import AdminInfo from '../models/adminInfo.model.js';
import { sendEmail } from '../services/email.service.js';
import generateVerificationCode from '../services/codeGenerate.service.js';
import BlackListTokens from '../models/blackListTokens.model.js';
import { toSafeUser } from '../services/safeUser.service.js';
import Invitation from '../models/inviteWorker.model.js';
import Verification from "../models/verification.model.js";
import Notification from "../models/notification.model.js";
import Task from "../models/task.model.js";
import Subscription from "../models/subscription.model.js";
import ApprovedTask from "../models/approvedTasks.model.js";
import RejectedTask from "../models/rejectedTasks.model.js";

const cookieOptions = {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
};

const ALLOWED_ROLES = ["worker", "pending_manager"];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

export const registerUser = async (req, res) => {
    try {
        const { name, email, password, phone, role } = req.body;

        // 1. All three must be real text
        const isText = (value) => typeof value === "string" && value.trim() !== "";
        if (!isText(name) || !isText(email) || !isText(password)) {
            return res
                .status(400)
                .json({ message: "Name, email, and password are required" });
        }

        // 2. Clean values
        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();
        const cleanPhone = phone ? String(phone).trim() : undefined;

        if (!EMAIL_REGEX.test(cleanEmail)) {
            return res
                .status(400)
                .json({ message: "Please enter a valid email address" });
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({
                message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
            });
        }

        // 3. Never trust role from client. Unknown → "worker"
        const userRole = ALLOWED_ROLES.includes(role) ? role : "worker";

        // 4. Email already used?
        const isUserExists = await User.findOne({ email: cleanEmail });
        if (isUserExists) {
            return res.status(409).json({ message: "User already exists" });
        }

        // 5. Create user — no managerId from client (worker joins team later via invite)
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            name: cleanName,
            email: cleanEmail,
            phone: cleanPhone,
            role: userRole,
            managerId: null,
            password: hashedPassword,
        });

        // 6. Log in right away
        const token = generateToken(newUser);
        res.cookie("token", token, cookieOptions);

        // 7. Admin activity log (optional)
        try {
            await AdminInfo.create({
                message: `New user registered with email: ${cleanEmail}`,
            });
        } catch (logError) {
            console.error("Could not save the admin log:", logError.message);
        }

        // 8. Response without password
        return res.status(201).json(toSafeUser(newUser));
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ message: "User already exists" });
        }

        console.error("Register user error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }
        const cleanEmail = email.trim().toLowerCase();
        if (!EMAIL_REGEX.test(cleanEmail)) {
            return res.status(400).json({ message: 'Please enter a valid email address' });
        }
        const isUserValid = await User.findOne({ email: cleanEmail }).select('+password');
        if (!isUserValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const isPasswordValid = await bcrypt.compare(password, isUserValid.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        if (isUserValid.isBanned) {
            return res.status(403).json({ message: 'Access denied. User is banned.' });
        }
        const token = generateToken(isUserValid);
        res.cookie('token', token, cookieOptions);
        await AdminInfo.create({ message: `User logged in with email: ${cleanEmail}` });
        return res.status(200).json(toSafeUser(isUserValid));
    } catch (error) {
        console.error('Login user error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export const getCurrentUser = async (req, res) => {
    const user = req.user;
    try {
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const currentUser = await User.findById(user._id);
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        return res.status(200).json(toSafeUser(currentUser));
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const getAllUsers = async (req, res) => {
    const user = req.user;
    if (!user || user.role !== "admin") {
        return res.status(403).json({ message: 'Access denied' });
    }
    try {
        const users = await User.find().select('name email phone hourlyRate avatar role createdAt updatedAt isVerified isBanned');
        res.status(200).json(users.map(toSafeUser));
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const getMyWorkers = async (req, res) => {
    try {
        const user = req.user;
        if (!user || user.role !== 'manager') {
            return res.status(403).json({ message: 'Access denied' });
        }
        const workers = await User.find({ role: 'worker', managerId: user.id }).select('name email phone hourlyRate avatar role createdAt updatedAt isVerified');
        res.status(200).json(workers.map(toSafeUser));
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const logoutUser = async (req, res) => {
    try {
        const user = req.user;
        const token = req.cookies.token;
        if (!user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        if (!token) {
            return res.status(401).json({ message: 'Access denied. No token provided.' });
        }
        await BlackListTokens.create({ token, user: user._id });
        res.clearCookie("token", cookieOptions);
        const message = `User logged out with email: ${user.email}`;
        await AdminInfo.create({ message });
        return res.status(200).json({ message: 'Logout successful' });
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
        res.status(200).json({
            ...toSafeUser(user),
            paymentMethod: user.paymentMethod,
        });
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
        if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
            return res.status(400).json({ message: 'Name must not be empty' });
        }
        if (email !== undefined && (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim().toLowerCase()))) {
            return res.status(400).json({ message: 'Please enter a valid email address' });
        }
        if (password !== undefined && (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH)) {
            return res.status(400).json({
                message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
            });
        }
        const existingUser = await User.findById(userId).select('+password');
        if (!existingUser) return res.status(404).json({ message: 'User not found' });
        const uploadedImageUrl = avatar ? await uploadImage(avatar) : existingUser.avatar;
        const hashedPassword = password ? await bcrypt.hash(password, 10) : existingUser.password;
        const updatedUser = await User.findByIdAndUpdate(userId, {
            name: name === undefined ? existingUser.name : name.trim(),
            email: email === undefined ? existingUser.email : email.trim().toLowerCase(),
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
        return res.status(200).json(toSafeUser(updatedUser));
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
        if (existingUser.role === 'admin' && role !== 'admin') {
            return res.status(403).json({ message: 'Cannot change role of an admin user' });
        }
        if (existingUser.role !== 'admin' && role === 'admin') {
            return res.status(403).json({ message: 'Cannot promote a non-admin user to admin' });
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
            returnDocument: 'after',
            runValidators: true,
        });
        const message = `User updated by admin with email: ${updatedUser.email}`;
        const adminInfo = await AdminInfo.create({ message });
        return res.status(200).json(toSafeUser(updatedUser));
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const sendVerificationCode = async (req, res) => {
    try {
        // Logged-in user
        const loggedInUser = req.user;

        if (!loggedInUser) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        // Check role
        if (
            loggedInUser.role !== "admin" &&
            loggedInUser.role !== "manager" &&
            loggedInUser.role !== "worker"
        ) {
            return res.status(403).json({
                message: "Access denied",
            });
        }

        // Email required
        if (!loggedInUser.email) {
            return res.status(400).json({
                message: "Email is required",
            });
        }

        // Find user by email
        const isUserExists = await User.findOne({
            email: loggedInUser.email.trim().toLowerCase(),
        });

        if (!isUserExists) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        // Already verified?
        if (isUserExists.isVerified) {
            return res.status(400).json({
                message: "Email is already verified",
            });
        }

        // Generate 6-digit code
        const verificationCode = generateVerificationCode();

        // Save code to the FOUND USER
        isUserExists.emailVerificationCode = verificationCode;

        // Code expires after 10 minutes
        isUserExists.emailVerificationExpires =
            new Date(Date.now() + 10 * 60 * 1000);

        await isUserExists.save();

        // Send email
        await sendEmail(
            isUserExists.email,
            verificationCode
        );

        return res.status(200).json({
            message: "Verification code sent successfully",
        });

    } catch (error) {
        console.error("Send verification code error:", error);

        return res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

export const verifyEmail = async (req, res) => {
    try {
        const { code } = req.body;
        if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
            return res.status(400).json({ message: 'Verification code must be 6 digits' });
        }
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (!user.emailVerificationExpires || user.emailVerificationExpires <= new Date()) {
            return res.status(400).json({ message: 'Verification code has expired' });
        }
        if (user.emailVerificationCode !== code) {
            return res.status(400).json({ message: 'Invalid verification code' });
        }
        user.isVerified = true;
        user.emailVerificationCode = null;
        user.emailVerificationExpires = null;
        await user.save();
        res.status(200).json({ message: 'Email verified successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const banUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = req.user;
        if (!user || user.role !== 'admin') {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const bannedUser = await User.findByIdAndUpdate(userId, { isBanned: true }, { returnDocument: 'after' });
        if (!bannedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        const message = `User banned By Admin: ${user.name} with email: ${bannedUser.email}`;
        const adminInfo = await AdminInfo.create({ message });
        req.app.get('disconnectUserSockets')?.(bannedUser._id);
        res.status(200).json({ message: 'User banned successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const deleteUser = async (req, res) => {
    let session;

    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid user ID",
            });
        }

        session = await mongoose.startSession();

        let deletedUserRole = null;

        await session.withTransaction(async () => {
            const user = await User.findById(id).session(session);

            if (!user) {
                const error = new Error("USER_NOT_FOUND");
                error.code = "USER_NOT_FOUND";
                throw error;
            }

            deletedUserRole = user.role;

            // Protect the last admin.
            if (user.role === "admin") {
                const adminCount = await User.countDocuments({
                    role: "admin",
                    _id: { $ne: user._id },
                }).session(session);

                if (adminCount === 0) {
                    const error = new Error("LAST_ADMIN");
                    error.code = "LAST_ADMIN";
                    throw error;
                }
            }

            // 1. Worker cleanup.
            if (user.role === "worker") {
                // Remove this worker from task assignments.
                await Task.updateMany(
                    { assignedWorker: user._id },
                    {
                        $pull: {
                            assignedWorker: user._id,
                        },
                    },
                    { session }
                );

                // Remove active verification requests.
                await Verification.deleteMany(
                    { worker: user._id },
                    { session }
                );
            }

            // 2. Manager cleanup.
            if (user.role === "manager") {
                // Detach workers from this manager.
                await User.updateMany(
                    { managerId: user._id },
                    {
                        $set: {
                            managerId: null,
                        },
                    },
                    { session }
                );

                // Cancel and preserve manager-created tasks.
                await Task.updateMany(
                    { createdBy: user._id },
                    {
                        $set: {
                            status: "cancelled",
                        },
                    },
                    { session }
                );

                // Remove manager invitations.
                await Invitation.deleteMany(
                    { managerId: user._id },
                    { session }
                );

                // Remove manager subscription.
                await Subscription.deleteMany(
                    { managerId: user._id },
                    { session }
                );
            }

            // 3. Remove notifications where user is sender or recipient.
            await Notification.deleteMany(
                {
                    $or: [
                        { recipient: user._id },
                        { sender: user._id },
                    ],
                },
                { session }
            );

            // 4. Preserve history, but detach deleted user's references.
            await ApprovedTask.updateMany(
                {
                    $or: [
                        { worker: user._id },
                        { approvedBy: user._id },
                    ],
                },
                {
                    $set: {
                        ...(String(user.role) === "worker"
                            ? { worker: null }
                            : {}),
                        ...(String(user.role) === "admin" ||
                            String(user.role) === "manager"
                            ? { approvedBy: null }
                            : {}),
                    },
                },
                { session }
            );

            await RejectedTask.updateMany(
                {
                    $or: [
                        { worker: user._id },
                        { rejectedBy: user._id },
                    ],
                },
                {
                    $set: {
                        ...(String(user.role) === "worker"
                            ? { worker: null }
                            : {}),
                        ...(String(user.role) === "admin" ||
                            String(user.role) === "manager"
                            ? { rejectedBy: null }
                            : {}),
                    },
                },
                { session }
            );

            // 5. Remove blacklisted tokens associated with this user.
            // This assumes the blacklist schema has a user field.
            await BlackListTokens.deleteMany(
                { user: user._id },
                { session }
            );

            // 6. Delete user last.
            await User.deleteOne(
                { _id: user._id },
                { session }
            );
        });

        // Disconnect deleted user's sockets after commit.
        req.app.get("disconnectUserSockets")?.(id);

        return res.status(200).json({
            message: "User and related data deleted successfully",
        });

    } catch (error) {
        if (error.code === "USER_NOT_FOUND") {
            return res.status(404).json({
                message: "User not found",
            });
        }

        if (error.code === "LAST_ADMIN") {
            return res.status(400).json({
                message: "Cannot delete the last admin",
            });
        }

        console.error("Delete user error:", error);

        return res.status(500).json({
            message: "Failed to delete user",
        });

    } finally {
        if (session) {
            await session.endSession();
        }
    }
};

export const getAvalaibleWorkers = async (req, res) => {
    try {
        const loggedInUser = req.user;
        if (!loggedInUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const isManager = loggedInUser.role === "manager";
        if (!isManager) {
            return res.status(403).json({ message: "Access denied" });
        }
        const workers = await User.find({ role: "worker", managerId: null, isBanned: false }).select("name email phone hourlyRate avatar role createdAt updatedAt isVerified");
        res.status(200).json({ workers });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}