import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import isAdmin from "../middleware/adminCheck.middleware.js";
import { getStatus, setStatus } from "../controllers/maintenance.controller.js";

const router = express.Router();

router.get("/maintenance/status", getStatus); // public route
router.put("/admin/maintenance", authMiddleware, isAdmin, setStatus); // admin route

export default router