import Subscription from "../models/subscription.model.js";
import Plan from "../models/plan.model.js";
import PLANS from "../config/Plans.config.js";
import stripe, { STRIPE_CURRENCY } from "../config/stripe.js";
import envConfig from "../config/env.config.js";
import mongoose from "mongoose";

const requireStripe = (res) => {
  if (!stripe) {
    res.status(503).json({ message: "Payments are not configured on the server" });
    return false;
  }
  return true;
};

export const getAvailablePlans = async (_req, res) => {
  try {
    const plans = await Plan.find({ status: "active" }).sort({ price: 1 });
    return res.status(200).json(plans);
  } catch (error) {
    console.error("Error fetching available plans:", error);
    return res.status(500).json({ message: "Could not fetch plans" });
  }
};

export const getMySubscription = async (req, res) => {
    try {
        const loggedInUser = req.user;
        const userId = loggedInUser._id || loggedInUser.id; // Use _id if available, otherwise use id
        if (loggedInUser.role !== "manager") {
            return res.status(403).json({ message: "Access denied. Only managers can view subscription." });
        }
        const subscription = await Subscription.findOne({ managerId: userId });
        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found." });
        }
        return res.status(200).json(subscription);
    } catch (error) {
        console.error("Error fetching subscription:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

export const cancelMySubscription = async (req, res) => {
    try {
        const loggedInUser = req.user;
        const userId = loggedInUser._id || loggedInUser.id;

        if (loggedInUser.role !== "manager") {
            return res.status(403).json({
                message: "Access denied. Only managers can cancel subscription.",
            });
        }

        const subscription = await Subscription.findOne({ managerId: userId });
        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found." });
        }

        const currentPlanName = String(subscription.plan || "").toLowerCase();
        if (currentPlanName === "free") {
            return res.status(400).json({
                message: "Free plan cannot be canceled.",
            });
        }

        const freePlan = await Plan.findOne({
            plan: String(PLANS.FREE.name).toLowerCase(),
            status: "active",
        });
        if (!freePlan) {
            return res.status(500).json({
                message: "Free plan is not configured in the database",
            });
        }

        // Paid/trial → move back to free (still usable)
        subscription.plan = freePlan.plan;
        subscription.planId = freePlan._id; // if you have this field
        subscription.workerLimit = freePlan.workerLimit;
        subscription.taskLimit = freePlan.taskLimit;
        subscription.status = "active";
        subscription.endsAt = null;
        subscription.stripeSessionId = null;
        subscription.stripePaymentIntentId = null;
        // optional audit:
        // subscription.canceledAt = new Date();
        // subscription.previousPlan = currentPlanName;

        await subscription.save();

        return res.status(200).json({
            message: "Subscription canceled. You are now on the free plan.",
            data: subscription,
        });
    } catch (error) {
        console.error("Error canceling subscription:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


// controllers/billing.controller.js (example)

export const createCheckoutSession = async (req, res) => {
  console.log("\n========== STRIPE CHECKOUT START ==========");

  try {
    console.log("[1] Checkout controller called");
    console.log("[2] Stripe configured:", Boolean(stripe));
    console.log("[3] Logged-in user:", {
      id: req.user?._id || req.user?.id,
      role: req.user?.role,
      email: req.user?.email,
    });

    if (!requireStripe(res)) {
      console.error("[ERROR] Stripe is not configured");
      return;
    }

    if (req.user.role !== "manager") {
      console.error("[ERROR] User is not a manager");
      return res.status(403).json({
        message: "Only managers can buy a plan",
      });
    }

    const { planId } = req.body;

    console.log("[4] Received planId:", planId);

    if (!planId) {
      console.error("[ERROR] planId is missing");
      return res.status(400).json({ message: "planId is required" });
    }

    if (!mongoose.isValidObjectId(planId)) {
      console.error("[ERROR] Invalid planId:", planId);
      return res.status(400).json({ message: "Invalid planId" });
    }

    const plan = await Plan.findOne({
      _id: planId,
      status: "active",
    });

    console.log("[5] Plan found:", plan ? {
      id: plan._id,
      name: plan.plan,
      price: plan.price,
      workerLimit: plan.workerLimit,
      taskLimit: plan.taskLimit,
    } : null);

    if (!plan) {
      console.error("[ERROR] Active plan not found");
      return res.status(404).json({ message: "Active plan not found" });
    }

    const priceInPkr = Number(plan.price);

    console.log("[6] Price in PKR:", priceInPkr);

    if (!Number.isFinite(priceInPkr) || priceInPkr <= 0) {
      console.error("[ERROR] Invalid or free plan price:", priceInPkr);
      return res.status(400).json({ message: "This plan is free" });
    }

    const managerId = String(req.user._id || req.user.id);
    const amountInPaisa = Math.round(priceInPkr * 100);

    console.log("[7] Stripe payment details:", {
      managerId,
      currency: STRIPE_CURRENCY,
      amountInPaisa,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: req.user.email,
      line_items: [
        {
          price_data: {
            currency: STRIPE_CURRENCY,
            product_data: {
              name: `FieldProof — ${plan.plan}`,
              description: `Workers: ${plan.workerLimit}, Tasks: ${plan.taskLimit}`,
            },
            unit_amount: amountInPaisa,
          },
          quantity: 1,
        },
      ],
      metadata: {
        managerId,
        planId: String(plan._id),
        planName: String(plan.plan || ""),
      },
      success_url: `${envConfig.frontendUrl}/manager/plans?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${envConfig.frontendUrl}/manager/plans?canceled=1`,
    });

    console.log("[8] Stripe session created:", session.id);
    console.log("[9] Checkout URL generated:", Boolean(session.url));
    console.log("========== STRIPE CHECKOUT SUCCESS ==========\n");

    return res.status(200).json({ url: session.url });

  } catch (error) {
    console.error("\n========== STRIPE CHECKOUT FAILED ==========");
    console.error("Error message:", error.message);
    console.error("Error code:", error.code);
    console.error("Full error:", error);
    console.error("========== END ERROR ==========\n");

    if (error?.code === "amount_too_small") {
      return res.status(400).json({
        message: "This price is too low for Stripe. Increase the plan price.",
      });
    }

    return res.status(500).json({
      message: "Could not start checkout",
    });
  }
};

export const stripeWebhook = async (req, res) => {

  console.log("\n========== STRIPE WEBHOOK RECEIVED ==========");
  if (!stripe || !envConfig.stripeWebhookSecret) {
    return res.status(503).json({ message: "Payments are not configured on the server" });
  }

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      envConfig.stripeWebhookSecret
    );
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.payment_status !== "paid") {
        return res.json({ received: true });
      }

      const managerId = session.metadata?.managerId;
      const planId = session.metadata?.planId;

      if (!managerId || !planId || !mongoose.isValidObjectId(managerId) || !mongoose.isValidObjectId(planId)) {
        console.error("Stripe checkout session has invalid metadata:", session.id);
        return res.status(400).json({ message: "Invalid checkout metadata" });
      }

      const plan = await Plan.findById(planId);
      if (!plan) {
        console.error("Stripe checkout session references missing plan:", planId);
        return res.status(500).json({ message: "Plan no longer exists" });
      }

      const endsAt =
        plan.days && Number(plan.days) > 0
          ? new Date(Date.now() + Number(plan.days) * 24 * 60 * 60 * 1000)
          : null;

      await Subscription.findOneAndUpdate(
        { managerId },
        {
          plan: plan.plan,
          planId: plan._id,
          workerLimit: plan.workerLimit,
          taskLimit: plan.taskLimit,
          status: "active",
          endsAt,
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent || null,
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      console.log("Subscription updated for manager:", managerId);
    }
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);
    return res.status(500).json({ message: "Webhook processing failed" });
  }

  return res.json({ received: true });
};