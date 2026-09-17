import express from 'express';
import { createTask, getAllTasks, getTaskById } from '../controllers/task.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();
router.get("/task/:id", authMiddleware, getTaskById);
router.post('/create', authMiddleware, createTask);
router.get("/task/:id", authMiddleware, getAllTasks);
router.get("/all", authMiddleware, getAllTasks);

export default router;