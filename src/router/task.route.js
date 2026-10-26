import express from "express";
import {
  createTask,
  deleteTask,
  getAllTasks,
  getTaskById,
  getMyTasks,
} from "../controllers/task.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import checkUser from "../middleware/checkBannedUser.middleware.js";
import isManager from "../middleware/managerCheck.middleware.js";
import { taskWriteLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.get("/task/:id", authMiddleware, checkUser, getTaskById);
router.get("/my-tasks", authMiddleware, checkUser, getMyTasks);
router.get("/all", authMiddleware, checkUser, getAllTasks);

router.post(
  "/create",
  authMiddleware,
  checkUser,
  taskWriteLimiter,
  createTask
);

router.delete(
  "/del-task/:id",
  authMiddleware,
  isManager,
  checkUser,
  taskWriteLimiter,
  deleteTask
);

export default router;