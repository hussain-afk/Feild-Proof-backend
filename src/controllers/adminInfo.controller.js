import mongoose from "mongoose";

import AdminInfo from "../models/adminInfo.model.js";
import User from "../models/user.model.js";
import { toSafeUser } from "../services/safeUser.service.js";
import PLANS from "../config/Plans.config.js";
import Subscription from "../models/subscription.model.js";
import Plan from "../models/plan.model.js";

export const getAdminInfos = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "admin") {
      return res.status(403).json({
        message: "Access denied. Only admins can view admin info.",
      });
    }

    const adminInfos = await AdminInfo.find().sort({ createdAt: -1 });

    return res.status(200).json(adminInfos);
  } catch (error) {
    console.error("Admin info fetch error:", error);

    return res.status(500).json({
      message: "Error fetching admin info",
    });
  }
};

export const getAllManagerRequests = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Access denied. Only admins can view manager requests.",
      });
    }

    const managerRequests = await User.find({
      role: "pending_manager",
      isBanned: { $ne: true },
    }).sort({ createdAt: -1 });

    return res.status(200).json(managerRequests.map(toSafeUser));
  } catch (error) {
    console.error("Manager requests fetch error:", error);

    return res.status(500).json({
      message: "Error fetching manager requests",
    });
  }
};

export const updateManagerRequest = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Access denied. Only admins can update manager requests.",
      });
    }

    const { status } = req.body;
    const userId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be approved or rejected",
      });
    }

    const io = req.app.get("io");

    // ------------------------------------
    // REJECT MANAGER REQUEST
    // ------------------------------------
    if (status === "rejected") {
      const rejectedUser = await User.findOneAndUpdate(
        {
          _id: userId,
          role: "pending_manager",
          isBanned: { $ne: true },
        },
        {
          $set: { isBanned: true },
        },
        {
          new: true,
          runValidators: true,
        }
      );

      if (!rejectedUser) {
        const existingUser = await User.findById(userId);

        if (!existingUser) {
          return res.status(404).json({
            message: "User not found",
          });
        }

        return res.status(409).json({
          message: "This user does not have a pending manager request.",
        });
      }

      io?.to(String(userId)).emit("user_updated", {
        user: toSafeUser(rejectedUser),
      });

      io?.to("admins").emit("manager_requests_updated");

      return res.status(200).json({
        message: "Manager request rejected successfully.",
      });
    }

    // ------------------------------------
    // APPROVE MANAGER REQUEST
    // ------------------------------------
    let updatedUser;

    await mongoose.connection.transaction(async (session) => {
      // Only a non-banned pending manager can be approved.
      const pendingUser = await User.findOne({
        _id: userId,
        role: "pending_manager",
        isBanned: { $ne: true },
      }).session(session);

      if (!pendingUser) {
        const existingUser = await User.findById(userId).session(session);

        if (!existingUser) {
          const error = new Error("USER_NOT_FOUND");
          error.code = "USER_NOT_FOUND";
          throw error;
        }

        const error = new Error("NOT_PENDING_MANAGER");
        error.code = "NOT_PENDING_MANAGER";
        throw error;
      }

      const plan = await Plan.findOne({
        plan: String(PLANS.FREE.name).toLowerCase(),
        status: "active",
      }).session(session);

      if (!plan) {
        const error = new Error("FREE_PLAN_NOT_CONFIGURED");
        error.code = "FREE_PLAN_NOT_CONFIGURED";
        throw error;
      }

      // Check existing subscription inside the transaction.
      const existingSubscription = await Subscription.findOne({
        managerId: pendingUser._id,
      }).session(session);

      if (!existingSubscription) {
        const endsAt =
          plan.days && Number(plan.days) > 0
            ? new Date(
                Date.now() +
                  Number(plan.days) * 24 * 60 * 60 * 1000
              )
            : null;

        await Subscription.create(
          [
            {
              managerId: pendingUser._id,
              plan: plan.plan,
              planId: plan._id,
              workerLimit: plan.workerLimit,
              taskLimit: plan.taskLimit,
              status: "active",
              endsAt,
            },
          ],
          { session }
        );
      }

      // Conditional update prevents approving an already changed user.
      updatedUser = await User.findOneAndUpdate(
        {
          _id: userId,
          role: "pending_manager",
          isBanned: { $ne: true },
        },
        {
          $set: { role: "manager" },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!updatedUser) {
        const error = new Error("NOT_PENDING_MANAGER");
        error.code = "NOT_PENDING_MANAGER";
        throw error;
      }
    });

    // Emit only after successful transaction commit.
    io?.to(String(userId)).emit("user_updated", {
      user: toSafeUser(updatedUser),
    });

    io?.to("admins").emit("manager_requests_updated");

    return res.status(200).json(toSafeUser(updatedUser));
  } catch (error) {
    if (error.code === "USER_NOT_FOUND") {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (error.code === "NOT_PENDING_MANAGER") {
      return res.status(409).json({
        message: "This user does not have a pending manager request.",
      });
    }

    if (error.code === "FREE_PLAN_NOT_CONFIGURED") {
      return res.status(500).json({
        message: "Free plan is not configured or active in the database.",
      });
    }

    console.error("Manager request update error:", error);

    return res.status(500).json({
      message: "Error updating manager request",
    });
  }
};

export const addPlan = async (req, res) => {
  try {
    let {
      plan,
      features,
      days,
      price,
      workerLimit,
      taskLimit,
      status,
    } = req.body;

    console.log("Received plan data:", req.body);

    if (plan == null || plan === "") {
      return res.status(400).json({
        message: "Plan name/type is required",
      });
    }

    plan = String(plan).toLowerCase().trim();

    const allowed = ["free", "trial", "basic", "enterprise", "pro"];

    if (!allowed.includes(plan)) {
      return res.status(400).json({
        message: `plan must be one of: ${allowed.join(", ")}`,
      });
    }

    if (typeof features === "string") {
      features = features
        .split(",")
        .map((feature) => feature.trim())
        .filter(Boolean);
    }

    if (!Array.isArray(features)) {
      features = [];
    }

    days = Number(days);
    price = Number(price);
    workerLimit = Number(workerLimit);
    taskLimit = Number(taskLimit);

    if (plan === "free") {
      days = 0;
      price = 0;
    }

    if (
      !Number.isFinite(days) ||
      !Number.isFinite(price) ||
      !Number.isFinite(workerLimit) ||
      !Number.isFinite(taskLimit) ||
      days < 0 ||
      price < 0 ||
      workerLimit < 0 ||
      taskLimit < 0
    ) {
      return res.status(400).json({
        message: "days, price and limits must be valid non-negative numbers",
      });
    }

    status = status ? String(status).toLowerCase() : "inactive";

    if (!["active", "inactive", "expired"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status",
      });
    }

    const newPlan = await Plan.create({
      plan,
      features,
      days,
      price,
      workerLimit,
      taskLimit,
      status,
    });

    return res.status(201).json(newPlan);
  } catch (error) {
    console.error("Error creating plan:", error);

    return res.status(500).json({
      message: "Error creating plan",
    });
  }
};

export const getAllPlans = async (req, res) => {
  try {
    const plans = await Plan.find().sort({ createdAt: -1 });

    return res.status(200).json(plans);
  } catch (error) {
    console.error("Error fetching plans:", error);

    return res.status(500).json({
      message: "Error fetching plans",
    });
  }
};