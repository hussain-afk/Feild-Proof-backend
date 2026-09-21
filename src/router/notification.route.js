import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import {getMyNotifications} from '../controllers/notification.controller.js';

const router = express.Router();

router.get('/my-notifications', authMiddleware, getMyNotifications);

export default router;