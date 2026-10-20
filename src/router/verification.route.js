import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { checkIn, checkOut, deleteVerification, getAllVerifications, onVerificationApproved, onVerificationRejected, getMyApprovedTasks, getMyRejectedTasks } from '../controllers/verification.controller.js';
import multer from 'multer';

const router = express.Router();
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      return callback(new Error('Only image uploads are allowed'));
    }
    callback(null, true);
  },
});

router.post("/check-in", authMiddleware,  upload.single('image'), checkIn);

router.post("/check-out", authMiddleware,  upload.single('image'), checkOut);

router.post("/approve-verification/:id", authMiddleware, onVerificationApproved);

router.post("/reject-verification/:id", authMiddleware, onVerificationRejected)

router.get("/verifications", authMiddleware ,getAllVerifications); 

router.get("/approved-verifications", authMiddleware, getMyApprovedTasks);

router.get("/rejected-verifications", authMiddleware, getMyRejectedTasks);

router.delete("/del-verification/:id", authMiddleware, deleteVerification);

export default router;