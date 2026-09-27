import express from 'express';
import { registerUser, loginUser, getCurrentUser, getAllUsers, logoutUser, updatePaymentStatus } from '../controllers/auth.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/register',registerUser);
router.post('/login',loginUser);
router.get('/me', authMiddleware, getCurrentUser);
router.get('/users', authMiddleware, getAllUsers);
router.get('/logout', authMiddleware, logoutUser);
router.put('/update-payment/:id', authMiddleware, updatePaymentStatus);

export default router;