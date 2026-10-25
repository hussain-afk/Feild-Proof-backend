import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import checkUser from '../middleware/checkBannedUser.middleware.js';
import checkManager from '../middleware/managerCheck.middleware.js';
import { inviteWorker, getInvitationsForWorker, getInvitationsForManager, onInviteAccepted, onInviteRejected } from '../controllers/inviteWorker.controller.js';

const router = express.Router();

router.post('/invite', authMiddleware, checkUser, checkManager, inviteWorker);

router.get('/worker-invitations', authMiddleware, checkUser, getInvitationsForWorker);

router.post('/accept-invite', authMiddleware, checkUser, onInviteAccepted);

router.post('/reject-invite', authMiddleware, checkUser, onInviteRejected);

router.get('/manager-invitations', authMiddleware, checkUser, checkManager, getInvitationsForManager);

export default router;