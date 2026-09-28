import express from 'express';
import { registerUser, loginUser, getCurrentUser, getAllUsers, logoutUser, updatePaymentStatus,updateUser } from '../controllers/auth.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import multer from 'multer';

const router = express.Router();
const storage = multer.memoryStorage();

const upload = multer({ storage: storage });

router.post('/register',registerUser);
router.post('/login',loginUser);
router.get('/me', authMiddleware, getCurrentUser);
router.get('/users', authMiddleware, getAllUsers);
router.get('/logout', authMiddleware, logoutUser);
router.put('/update-payment/:id', authMiddleware, updatePaymentStatus);
router.put('/update-user/:id', authMiddleware, upload.single('avatar'), updateUser);

export default router;