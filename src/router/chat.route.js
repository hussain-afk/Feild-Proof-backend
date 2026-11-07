import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import checkUser from "../middleware/checkBannedUser.middleware.js";
import { getMessages, sendMessage } from "../controllers/chat.controller.js";

const router = express.Router();

router.get("/:otherUserId", authMiddleware, checkUser, getMessages);
router.post("/send", authMiddleware, checkUser, sendMessage);

export default router;