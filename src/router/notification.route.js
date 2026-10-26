import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import checkUser from '../middleware/checkBannedUser.middleware.js';
import {getMyNotifications, deleteNotification} from '../controllers/notification.controller.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.use(apiLimiter); // Apply rate limiting to all routes in this router

router.get('/my-notifications', authMiddleware, checkUser, getMyNotifications);

router.delete('/del-notification/:id', authMiddleware, checkUser, deleteNotification);

export default router;