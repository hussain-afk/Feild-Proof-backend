import express from 'express';
import {
    registerUser,
    loginUser,
    getCurrentUser,
    getAllUsers,
    logoutUser,
    updatePaymentStatus,
    updateUser,
    deleteUser,
    sendVerificationCode,
    verifyEmail,
    getMyWorkers
} from '../controllers/auth.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import checkUser from '../middleware/checkBannedUser.middleware.js';
import checkAdmin from '../middleware/adminCheck.middleware.js';
import checkManager from '../middleware/managerCheck.middleware.js';
import multer from 'multer';

const router = express.Router();
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
            return callback(new Error('Only image uploads are allowed'));
        }
        callback(null, true);
    },
});

router.post('/register', registerUser);

router.post('/login', loginUser);

router.get('/me', authMiddleware, checkUser, getCurrentUser);

router.get('/users', authMiddleware, checkAdmin, getAllUsers);

router.get('/my-workers', authMiddleware, checkManager, getMyWorkers);

router.post('/logout', authMiddleware, checkUser, logoutUser);

router.put('/update-payment/:id', authMiddleware, checkUser, updatePaymentStatus);

router.put('/update-user/:id', authMiddleware, checkUser, upload.single('avatar'), updateUser);

router.post('/send-verification-code', authMiddleware, checkUser, sendVerificationCode);

router.post('/verify-email', authMiddleware, checkUser, verifyEmail);

router.delete('/delete-user/:id', authMiddleware, checkAdmin, deleteUser);

export default router;