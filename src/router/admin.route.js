import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import { getAdminInfos } from "../controllers/adminInfo.controller.js";
import { updateByAdmin, deleteUser } from '../controllers/auth.controller.js';

const router = express.Router();

router.get("/admin-info", authMiddleware, getAdminInfos);
router.put("/update-user/:id", authMiddleware, updateByAdmin);
router.delete("/delete-user/:id", authMiddleware, deleteUser);

export default router;