import mongoose from "mongoose";
import Invitation from "../models/inviteWorker.model.js";
import User from "../models/user.model.js";

export const inviteWorker = async (req, res) => {
  try {
    const managerId = req.user._id || req.user.id;
    const { workerId } = req.body;

    if (!workerId || !mongoose.isValidObjectId(workerId)) {
      return res.status(400).json({ message: "Valid workerId is required" });
    }

    const worker = await User.findById(workerId);
    if (!worker || worker.role !== "worker") {
      return res.status(404).json({ message: "Worker not found" });
    }

    if (worker.managerId) {
      return res.status(400).json({
        message: "This worker already belongs to a manager",
      });
    }

    const existing = await Invitation.findOne({
      managerId,
      workerId,
      status: "pending",
    });

    if (existing) {
      return res.status(400).json({ message: "Invitation already sent" });
    }

    const invitation = await Invitation.create({
      managerId,
      workerId,
      status: "pending",
    });

    // ---- Realtime ----
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
      return res.status(400).json({ message: "Invitation already sent" });
    }

    console.error("Error inviting worker:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getInvitationsForWorker = async (req, res) => {
  try {
    const workerId = req.user._id || req.user.id;

    if (req.user.role && req.user.role !== "worker") {
      return res
        .status(403)
        .json({ message: "Only workers can view invites" });
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
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getInvitationsForManager = async (req, res) => {
  try {
    const managerId = req.user._id || req.user.id;

    if (req.user.role !== "manager") {
      return res
        .status(403)
        .json({ message: "Only managers can view invites" });
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
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const onInviteAccepted = async (req, res) => {
  try {
    const invitationId = req.body.invitationId;
    const loggedInUserId = req.user?._id || req.user?.id;

    if (!loggedInUserId) {
      return res.status(401).json({ message: "Login required" });
    }

    if (req.user.role !== "worker") {
      return res
        .status(403)
        .json({ message: "Only workers can accept invites" });
    }

    if (!invitationId || !mongoose.isValidObjectId(invitationId)) {
      return res
        .status(400)
        .json({ message: "Valid invitationId is required" });
    }

    const invitation = await Invitation.findById(invitationId);
    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    if (String(invitation.workerId) !== String(loggedInUserId)) {
      return res
        .status(403)
        .json({ message: "This invitation is not for you" });
    }

    if (invitation.status !== "pending") {
      return res.status(400).json({
        message: `Invitation already ${invitation.status}`,
      });
    }

    const worker = await User.findById(loggedInUserId);
    if (!worker) {
      return res.status(404).json({ message: "User not found" });
    }

    if (worker.managerId) {
      return res.status(400).json({
        message: "You already belong to a manager",
      });
    }

    const manager = await User.findOne({
      _id: invitation.managerId,
      role: "manager",
    });
    if (!manager) {
      return res
        .status(400)
        .json({ message: "Manager no longer available" });
    }

    worker.managerId = invitation.managerId;
    await worker.save();

    invitation.status = "accepted";
    await invitation.save();

    await Invitation.updateMany(
      {
        workerId: loggedInUserId,
        status: "pending",
        _id: { $ne: invitation._id },
      },
      { status: "rejected" }
    );

    // ---- Realtime ----
    const io = req.app.get("io");
    if (io) {
      const managerIdStr = String(invitation.managerId);
      const workerIdStr = String(loggedInUserId);

      io.to(workerIdStr).emit("invite_updated", {
        invitationId: invitation._id,
        status: "accepted",
      });

      io.to(managerIdStr).emit("invite_updated", {
        invitationId: invitation._id,
        status: "accepted",
      });

      io.to(managerIdStr).emit("manager_invites_updated", {});
      io.to(managerIdStr).emit("my_workers_updated", {});
      io.to(managerIdStr).emit("available_workers_updated", {});
    }

    return res.status(200).json({
      message: "Invitation accepted successfully",
      managerId: invitation.managerId,
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const onInviteRejected = async (req, res) => {
  try {
    const invitationId = req.body.invitationId || req.params.invitationId;
    const loggedInUserId = req.user?._id || req.user?.id;

    if (!loggedInUserId) {
      return res.status(401).json({ message: "Login required" });
    }

    if (req.user.role !== "worker") {
      return res
        .status(403)
        .json({ message: "Only workers can reject invites" });
    }

    if (!invitationId || !mongoose.isValidObjectId(invitationId)) {
      return res
        .status(400)
        .json({ message: "Valid invitationId is required" });
    }

    const invitation = await Invitation.findById(invitationId);
    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    if (String(invitation.workerId) !== String(loggedInUserId)) {
      return res
        .status(403)
        .json({ message: "This invitation is not for you" });
    }

    if (invitation.status !== "pending") {
      return res.status(400).json({
        message: `Invitation already ${invitation.status}`,
      });
    }

    invitation.status = "rejected";
    await invitation.save();

    // ---- Realtime ----
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
    return res.status(500).json({ message: "Internal server error" });
  }
};