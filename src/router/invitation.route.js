import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import checkUser from "../middleware/checkBannedUser.middleware.js";
import checkManager from "../middleware/managerCheck.middleware.js";
import {
  inviteWorker,
  getInvitationsForWorker,
  getInvitationsForManager,
  onInviteAccepted,
  onInviteRejected,
} from "../controllers/inviteWorker.controller.js";
import { inviteLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Writes — limit
router.post(
  "/invite",
  authMiddleware,
  checkUser,
  checkManager,
  inviteLimiter,
  inviteWorker
);

router.post(
  "/accept-invite",
  authMiddleware,
  checkUser,
  inviteLimiter,
  onInviteAccepted
);

router.post(
  "/reject-invite",
  authMiddleware,
  checkUser,
  inviteLimiter,
  onInviteRejected
);

// Reads — global apiLimiter enough
router.get(
  "/worker-invitations",
  authMiddleware,
  checkUser,
  getInvitationsForWorker
);

router.get(
  "/manager-invitations",
  authMiddleware,
  checkUser,
  checkManager,
  getInvitationsForManager
);

export default router;