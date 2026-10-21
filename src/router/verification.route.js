import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import isManager from '../middleware/managerCheck.middleware.js';
import checkUser from '../middleware/checkBannedUser.middleware.js';
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

router.post("/check-in", authMiddleware,  checkUser, upload.single('image'), checkIn);

router.post("/check-out", authMiddleware,  checkUser, upload.single('image'), checkOut);

router.post("/approve-verification/:id", authMiddleware, isManager, checkUser, onVerificationApproved);

router.post("/reject-verification/:id", authMiddleware, isManager, checkUser, onVerificationRejected)

router.get("/verifications", authMiddleware, checkUser, getAllVerifications); 

router.get("/approved-verifications", authMiddleware, checkUser, getMyApprovedTasks);

router.get("/rejected-verifications", authMiddleware, checkUser, getMyRejectedTasks);

router.delete("/del-verification/:id", authMiddleware, isManager, checkUser, deleteVerification);

export default router;