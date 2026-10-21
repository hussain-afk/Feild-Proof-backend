import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import isAdmin from "../middleware/adminCheck.middleware.js";
import { getAdminInfos, getAllManagerRequests, updateManagerRequest } from "../controllers/adminInfo.controller.js";
import { updateByAdmin, deleteUser, banUser } from '../controllers/auth.controller.js';

const router = express.Router();
// Admin routes
router.get("/admin-info", authMiddleware, isAdmin, getAdminInfos);

router.get("/manager-requests", authMiddleware, isAdmin, getAllManagerRequests);

router.put("/update-manager-request/:id", authMiddleware, isAdmin, updateManagerRequest);

router.put("/ban-user/:id", authMiddleware, isAdmin, banUser);

router.put("/update-user/:id", authMiddleware, isAdmin, updateByAdmin);

router.delete("/delete-user/:id", authMiddleware, isAdmin, deleteUser);

export default router;