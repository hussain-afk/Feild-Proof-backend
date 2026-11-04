import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import checkUser from '../middleware/checkBannedUser.middleware.js'
import isAdmin from "../middleware/adminCheck.middleware.js";
import { getAdminInfos, getAllManagerRequests, updateManagerRequest, addPlan, getAllPlans } from "../controllers/adminInfo.controller.js";
import { updateByAdmin, deleteUser, banUser } from '../controllers/auth.controller.js';
import { adminLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.use(adminLimiter);
// Admin routes
router.get("/admin-info", authMiddleware, isAdmin, getAdminInfos);

router.post("/add-plan", authMiddleware, isAdmin, addPlan);

router.get("/manager-requests", authMiddleware, isAdmin, getAllManagerRequests);

router.get("/all-plans", authMiddleware, checkUser, getAllPlans);

router.put("/update-manager-request/:id", authMiddleware, isAdmin, updateManagerRequest);

router.put("/ban-user/:id", authMiddleware, isAdmin, banUser);

router.put("/update-user/:id", authMiddleware, isAdmin, updateByAdmin);

router.delete("/delete-user/:id", authMiddleware, isAdmin, deleteUser);

export default router;