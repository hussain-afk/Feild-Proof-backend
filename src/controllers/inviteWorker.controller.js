import mongoose from "mongoose";
import Invitation from "../models/inviteWorker.model.js";
import User from "../models/user.model.js";
import { assertManagerCanAddWorker } from "../services/plan.service.js";

// INVITE WORKER

export const inviteWorker = async (req, res) => {
  try {
    const managerId = req.user?._id || req.user?.id;
    const { workerId } = req.body;

    if (!managerId) {
      return res.status(401).json({
        message: "Login required",
      });
    }

    if (req.user.role !== "manager") {
      return res.status(403).json({
        message: "Only managers can invite workers",
      });
    }

    if (!workerId || !mongoose.isValidObjectId(workerId)) {
      return res.status(400).json({
        message: "Valid workerId is required",
      });
    }

    // Check manager plan limit
    const check = await assertManagerCanAddWorker(managerId);

    if (!check.ok) {
      return res.status(check.statusCode).json({
        message: check.message,
      });
    }

    // Verify worker
    const worker = await User.findOne({
      _id: workerId,
      role: "worker",
    });

    if (!worker) {
      return res.status(404).json({
        message: "Worker not found",
      });
    }

    if (worker.managerId) {
      return res.status(400).json({
        message: "This worker already belongs to a manager",
      });
    }

    // Check existing pending invitation
    const existing = await Invitation.findOne({
      managerId,
      workerId,
      status: "pending",
    });

    if (existing) {
      return res.status(400).json({
        message: "Invitation already sent",
      });
    }

    // Create invitation
    const invitation = await Invitation.create({
      managerId,
      workerId,
      status: "pending",
    });

    // Realtime notifications
    const io = req.app.get("io");

    if (io) {
      const managerIdStr = String(managerId);
      const workerIdStr = String(workerId);

      io.to(workerIdStr).emit("invite_received", {
        invitation: {
          _id: invitation._id,
          status: "pending",
          managerId: {
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email,
          },
        },
      });

      io.to(managerIdStr).emit("manager_invites_updated", {});
    }

    return res.status(201).json({
      message: "Invitation sent successfully",
      invitation,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({
        message: "Invitation already sent",
      });
    }

    console.error("Error inviting worker:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// GET INVITATIONS FOR WORKER

export const getInvitationsForWorker = async (req, res) => {
  try {
    const workerId = req.user?._id || req.user?.id;

    if (!workerId) {
      return res.status(401).json({
        message: "Login required",
      });
    }

    if (req.user.role !== "worker") {
      return res.status(403).json({
        message: "Only workers can view invites",
      });
    }

    const invitations = await Invitation.find({
      workerId,
      status: "pending",
    })
      .select("managerId status createdAt")
      .populate("managerId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    const clean = invitations.filter((inv) => inv.managerId);

    return res.status(200).json(clean);
  } catch (error) {
    console.error("Error fetching invitations for worker:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// GET INVITATIONS FOR MANAGER

export const getInvitationsForManager = async (req, res) => {
  try {
    const managerId = req.user?._id || req.user?.id;

    if (!managerId) {
      return res.status(401).json({
        message: "Login required",
      });
    }

    if (req.user.role !== "manager") {
      return res.status(403).json({
        message: "Only managers can view invites",
      });
    }

    const invitations = await Invitation.find({
      managerId,
      status: "pending",
    })
      .select("workerId status createdAt")
      .populate("workerId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    const clean = invitations.filter((inv) => inv.workerId);

    return res.status(200).json(clean);
  } catch (error) {
    console.error("Error fetching invitations for manager:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// ACCEPT INVITATION

export const onInviteAccepted = async (req, res) => {
  let session;

  try {
    const invitationId = req.body?.invitationId;
    const loggedInUserId = req.user?._id || req.user?.id;

    if (!loggedInUserId) {
      return res.status(401).json({
        message: "Login required",
      });
    }

    if (req.user.role !== "worker") {
      return res.status(403).json({
        message: "Only workers can accept invites",
      });
    }

    if (!invitationId || !mongoose.isValidObjectId(invitationId)) {
      return res.status(400).json({
        message: "Valid invitationId is required",
      });
    }

    session = await mongoose.startSession();

    let acceptedManagerId = null;
    let acceptedInvitationId = null;

    await session.withTransaction(async () => {
      // 1. Find pending invitation belonging to this worker
      const invitation = await Invitation.findOne({
        _id: invitationId,
        workerId: loggedInUserId,
        status: "pending",
      }).session(session);

      if (!invitation) {
        const error = new Error(
          "Invitation not found or no longer pending"
        );
        error.statusCode = 404;
        throw error;
      }

      // 2. Verify manager
      const manager = await User.findOne({
        _id: invitation.managerId,
        role: "manager",
      }).session(session);

      if (!manager) {
        const error = new Error("Manager no longer available");
        error.statusCode = 400;
        throw error;
      }

      // 3. Assign worker to manager only if currently unassigned
      const worker = await User.findOneAndUpdate(
        {
          _id: loggedInUserId,
          role: "worker",
          managerId: null,
        },
        {
          $set: {
            managerId: invitation.managerId,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        }
      );

      if (!worker) {
        const error = new Error(
          "You already belong to a manager"
        );
        error.statusCode = 400;
        throw error;
      }

      // 4. Accept the selected invitation
      const acceptedInvitation = await Invitation.findOneAndUpdate(
        {
          _id: invitation._id,
          workerId: loggedInUserId,
          status: "pending",
        },
        {
          $set: {
            status: "accepted",
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        }
      );

      if (!acceptedInvitation) {
        const error = new Error(
          "Invitation is no longer pending"
        );
        error.statusCode = 400;
        throw error;
      }

      // 5. Reject all other pending invitations for this worker
      await Invitation.updateMany(
        {
          workerId: loggedInUserId,
          status: "pending",
          _id: { $ne: invitation._id },
        },
        {
          $set: {
            status: "rejected",
          },
        },
        {
          session,
        }
      );

      acceptedManagerId = String(invitation.managerId);
      acceptedInvitationId = String(invitation._id);
    });

    // Transaction successfully committed.
    // Now send realtime notifications.

    const io = req.app.get("io");

    if (io) {
      const managerIdStr = acceptedManagerId;
      const workerIdStr = String(loggedInUserId);

      io.to(workerIdStr).emit("invite_updated", {
        invitationId: acceptedInvitationId,
        status: "accepted",
      });

      io.to(managerIdStr).emit("invite_updated", {
        invitationId: acceptedInvitationId,
        status: "accepted",
      });

      io.to(managerIdStr).emit("manager_invites_updated", {});
      io.to(managerIdStr).emit("my_workers_updated", {});
      io.to(managerIdStr).emit("available_workers_updated", {});
    }

    return res.status(200).json({
      message: "Invitation accepted successfully",
      managerId: acceptedManagerId,
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);

    return res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : "Internal server error",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

// REJECT INVITATION

export const onInviteRejected = async (req, res) => {
  try {
    const invitationId =
      req.body?.invitationId || req.params?.invitationId;

    const loggedInUserId = req.user?._id || req.user?.id;

    if (!loggedInUserId) {
      return res.status(401).json({
        message: "Login required",
      });
    }

    if (req.user.role !== "worker") {
      return res.status(403).json({
        message: "Only workers can reject invites",
      });
    }

    if (!invitationId || !mongoose.isValidObjectId(invitationId)) {
      return res.status(400).json({
        message: "Valid invitationId is required",
      });
    }

    // Atomic rejection: only a pending invitation
    // belonging to this worker can be rejected.
    const invitation = await Invitation.findOneAndUpdate(
      {
        _id: invitationId,
        workerId: loggedInUserId,
        status: "pending",
      },
      {
        $set: {
          status: "rejected",
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!invitation) {
      return res.status(400).json({
        message: "Invitation not found or already processed",
      });
    }

    // Realtime notifications
    const io = req.app.get("io");

    if (io) {
      const managerIdStr = String(invitation.managerId);
      const workerIdStr = String(loggedInUserId);

      io.to(workerIdStr).emit("invite_updated", {
        invitationId: invitation._id,
        status: "rejected",
      });

      io.to(managerIdStr).emit("invite_updated", {
        invitationId: invitation._id,
        status: "rejected",
      });

      io.to(managerIdStr).emit("manager_invites_updated", {});
    }

    return res.status(200).json({
      message: "Invitation rejected successfully",
    });
  } catch (error) {
    console.error("Error rejecting invitation:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
