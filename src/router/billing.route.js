import express from 'express';
import authMiddleware from "../middleware/auth.middleware.js";
import checkUser from "../middleware/checkBannedUser.middleware.js";
import checkManager from "../middleware/managerCheck.middleware.js";
import { getAvailablePlans, getMySubscription, cancelMySubscription, createCheckoutSession } from '../controllers/billing.controller.js';


const router = express.Router();

router.get('/plans', authMiddleware, checkUser, getAvailablePlans);
router.get('/my-subscription', authMiddleware, checkUser, checkManager, getMySubscription);

router.put('/cancel-subscription', authMiddleware, checkUser, checkManager, cancelMySubscription);

router.post('/checkout', authMiddleware, checkUser, checkManager, createCheckoutSession);

export default router;