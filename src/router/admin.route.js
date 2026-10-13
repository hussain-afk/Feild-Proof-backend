import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import { getAdminInfos, getAllManagerRequests, updateManagerRequest } from "../controllers/adminInfo.controller.js";
import { updateByAdmin, deleteUser } from '../controllers/auth.controller.js';

const router = express.Router();

router.get("/admin-info", authMiddleware, getAdminInfos);
router.get("/manager-requests", authMiddleware, getAllManagerRequests);
router.put("/update-manager-request/:id", authMiddleware, updateManagerRequest);
router.put("/update-user/:id", authMiddleware, updateByAdmin);
router.delete("/delete-user/:id", authMiddleware, deleteUser);

export default router;