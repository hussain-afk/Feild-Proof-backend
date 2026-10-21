import User from '../models/user.model.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import generateToken from '../services/token.service.js';
import uploadImage from '../services/uploadImage.service.js';
import AdminInfo from '../models/adminInfo.model.js';
import { sendEmail } from '../services/email.service.js';
import generateVerificationCode from '../services/codeGenerate.service.js';
import BlackListTokens from '../models/blackListTokens.model.js';

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
    const { name, email, password, phone, role, managerId } = req.body;
 
    // 1. All three must be real text (this also stops tricks like email: { "$ne": null })
    const isText = (value) => typeof value === "string" && value.trim() !== "";
    if (!isText(name) || !isText(email) || !isText(password)) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
 
    // 2. Clean the values: the same email in capital letters must not count as a new user
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone ? String(phone).trim() : undefined;
 
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }
 
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
 
    // 3. The role comes from the user, so never trust it. Anything unknown becomes "worker".
    const userRole = ALLOWED_ROLES.includes(role) ? role : "worker";
 
    // 4. Is this email already used?
    const isUserExists = await User.findOne({ email: cleanEmail });
    if (isUserExists) {
      return res.status(409).json({ message: "User already exists" });
    }
 
    // 5. A worker can join a manager's team. The manager must really exist AND be a manager.
    let manager = null;
    if (userRole === "worker" && managerId) {
      const isValidId = typeof managerId === "string" && mongoose.isValidObjectId(managerId);
      if (!isValidId) {
        return res.status(400).json({ message: "Invalid manager ID" });
      }
 
      manager = await User.findOne({ _id: managerId, role: "manager" });
      if (!manager) {
        return res.status(400).json({ message: "Manager not found" });
      }
    }
 
    // 6. Create the user
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      role: userRole,
      managerId: manager ? manager._id : null,
      password: hashedPassword,
    });
 
    // 7. Log in right away
    const token = generateToken(newUser);
    res.cookie("token", token, cookieOptions);
 
    // 8. Write the admin activity log. If this fails, the registration is still OK.
    try {
      await AdminInfo.create({ message: `New user registered with email: ${cleanEmail}` });
    } catch (logError) {
      console.error("Could not save the admin log:", logError.message);
    }
 
    // 9. Send the user back, without the password
    const safeUser = newUser.toObject();
    delete safeUser.password;
 
    return res.status(201).json(safeUser);
  } catch (error) {
    // Two people registered with the same email at the same moment (the unique index stops the 2nd)
    if (error?.code === 11000) {
      return res.status(409).json({ message: "User already exists" });
    }
 
    console.error("Register user error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

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
    if (!user || user.role !== "admin") {
        return res.status(403).json({ message: 'Access denied' });
    }
    try {
        const users = await User.find().select('name email phone hourlyRate avatar role createdAt updatedAt isVerified isBanned');
        res.status(200).json(users);
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
        const workers = await User.find({ role:'worker', managerId: user.id }).select('name email phone hourlyRate avatar role createdAt updatedAt isVerified');
        res.status(200).json(workers);
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
        const blackListToken = await BlackListTokens.create({ token });
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
        if(existingUser.role !== 'admin' && role === 'admin') {
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
            returnDocument: 'after'
        });
        const message = `User updated by admin with email: ${updatedUser.email}`;
        const adminInfo = await AdminInfo.create({ message });
        res.status(200).json(updatedUser);
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
        const { email, code } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
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
        res.status(200).json({ message: 'User banned successfully' });
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
        const message = `User deleted By Admin: ${user.name} with email: ${deletedUser.email}`;
        const adminInfo = await AdminInfo.create({ message });
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}