import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import checkUser from '../middleware/checkBannedUser.middleware.js';
import {getMyNotifications, deleteNotification} from '../controllers/notification.controller.js';

const router = express.Router();

router.get('/my-notifications', authMiddleware, checkUser, getMyNotifications);

router.delete('/del-notification/:id', authMiddleware, checkUser, deleteNotification);

export default router;