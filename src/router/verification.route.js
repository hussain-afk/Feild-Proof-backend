import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import isManager from "../middleware/managerCheck.middleware.js";
import checkUser from "../middleware/checkBannedUser.middleware.js";
import {
  checkIn,
  checkOut,
  deleteVerification,
  getAllVerifications,
  onVerificationApproved,
  onVerificationRejected,
  getMyApprovedTasks,
  getMyRejectedTasks,
} from "../controllers/verification.controller.js";
import multer from "multer";
import {
  checkInOutLimiter,
  verificationWriteLimiter,
} from "../middleware/rateLimiter.js";

const router = express.Router();
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      return callback(new Error("Only image uploads are allowed"));
    }
    callback(null, true);
  },
});

// Worker — GPS + photo
router.post(
  "/check-in",
  authMiddleware,
  checkUser,
  checkInOutLimiter,
  upload.single("image"),
  checkIn
);

router.post(
  "/check-out",
  authMiddleware,
  checkUser,
  checkInOutLimiter,
  upload.single("image"),
  checkOut
);

// Manager review
router.post(
  "/approve-verification/:id",
  authMiddleware,
  isManager,
  checkUser,
  verificationWriteLimiter,
  onVerificationApproved
);

router.post(
  "/reject-verification/:id",
  authMiddleware,
  isManager,
  checkUser,
  verificationWriteLimiter,
  onVerificationRejected
);

router.delete(
  "/del-verification/:id",
  authMiddleware,
  isManager,
  checkUser,
  verificationWriteLimiter,
  deleteVerification
);

// Reads — global apiLimiter enough
router.get("/verifications", authMiddleware, checkUser, getAllVerifications);
router.get(
  "/approved-verifications",
  authMiddleware,
  checkUser,
  getMyApprovedTasks
);
router.get(
  "/rejected-verifications",
  authMiddleware,
  checkUser,
  getMyRejectedTasks
);

export default router;