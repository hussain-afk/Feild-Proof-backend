import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { checkIn, checkOut } from '../controllers/verification.controller.js';

const router = express.Router();

router.post("/check-in", authMiddleware, checkIn);
router.post("/check-out", authMiddleware, checkOut);

export default router;