import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import {getMyNotifications, deleteNotification} from '../controllers/notification.controller.js';

const router = express.Router();

router.get('/my-notifications', authMiddleware, getMyNotifications);
router.delete('/del-notification/:id', authMiddleware, deleteNotification);

export default router;