import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { checkIn, checkOut } from '../controllers/verification.controller.js';
import multer from 'multer';

const router = express.Router();
const storage = multer.memoryStorage();

const upload = multer({ storage: storage });

router.post("/check-in", authMiddleware,  upload.single('image'), checkIn);
router.post("/check-out", authMiddleware,  upload.single('image'), checkOut);

export default router;