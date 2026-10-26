import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import isAdmin from "../middleware/adminCheck.middleware.js";
import { getStatus, setStatus } from "../controllers/maintenance.controller.js";
import {
  publicStatusLimiter, // optional
  adminLimiter,
} from "../middleware/rateLimiter.js";

const router = express.Router();

// Public — soft limit (ya sirf global apiLimiter)
router.get(
  "/maintenance/status",
  publicStatusLimiter, // optional
  getStatus
);

// Admin only
router.put(
  "/admin/maintenance",
  authMiddleware,
  isAdmin,
  adminLimiter,
  setStatus
);

export default router;