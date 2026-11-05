import express from "express";
import { Server } from "socket.io";
import http from "http";
import jwt from "jsonwebtoken";
import { parse as parseCookie } from "cookie";
import envConfig from "./src/config/env.config.js";
import connectDB from "./src/config/database.js";
import cookieParser from "cookie-parser";
import authRoutes from "./src/router/auth.route.js";
import taskRoutes from "./src/router/task.route.js";
import notificationRoutes from "./src/router/notification.route.js";
import verificationRoutes from "./src/router/verification.route.js";
import adminRoutes from "./src/router/admin.route.js";
import User from "./src/models/user.model.js";
import BlackListTokens from "./src/models/blackListTokens.model.js";
import cors from "cors";
import maintenanceRoutes from "./src/router/maintenance.route.js";
import invitationRoutes from "./src/router/invitation.route.js";
import { apiLimiter } from "./src/middleware/rateLimiter.js";
import billingRoutes from "./src/router/billing.route.js";
import { stripeWebhook } from "./src/controllers/billing.controller.js";

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || envConfig.port || 4000;
const FRONTEND_URL = envConfig.frontendUrl;

// Middlewares
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use((req, res, next) => {
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== FRONTEND_URL
  ) {
    return res.status(403).json({ message: "Origin not allowed" });
  }
  next();
});

// Stripe webhook — raw body, json se PEHLE
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use("/api", apiLimiter);

// HTTP Server & Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST"],
  },
  transports: ["polling", "websocket"],
});

app.set("io", io);

// ---------------------------------------------------------------
// SOCKET AUTH (HTTP verifyToken jaisa)
// 1) cookie token
// 2) blacklist
// 3) jwt verify
// 4) user + ban
// ---------------------------------------------------------------
io.use(async (socket, next) => {
  try {
    const cookies = parseCookie(socket.handshake.headers.cookie || "");
    const token = cookies.token;

    if (!token) {
      return next(new Error("Not authenticated"));
    }

    // logout ke baad naya socket mat chalne do
    const isBlacklisted = await BlackListTokens.findOne({ token });
    if (isBlacklisted) {
      return next(new Error("Access denied. Token is blacklisted."));
    }

    const decoded = jwt.verify(token, envConfig.jwtSecret);
    const userId = decoded.userId || decoded.id || decoded._id;

    if (!userId) {
      return next(new Error("Invalid token"));
    }

    const user = await User.findById(userId).select("_id role isBanned");
    if (!user) {
      return next(new Error("User not found"));
    }
    if (user.isBanned) {
      return next(new Error("User is banned"));
    }

    socket.data.userId = String(user._id);
    socket.data.role = user.role;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

// Ban: open sockets turant band
app.set("disconnectUserSockets", (userId) => {
  io.in(String(userId)).disconnectSockets(true);
});

io.on("connection", (socket) => {
  const { userId, role } = socket.data;

  socket.join(userId);
  if (role === "admin") socket.join("admins");

  console.log(`User connected: ${userId} (${role})`);

  socket.on("join_room", () => {});

  socket.on("disconnect", () => {
    console.log("User disconnected:", userId);
  });
});

// Database
connectDB();

app.get("/health", (req, res) => {
  res.status(200).send("Server is active and healthy");
});

// Routes
app.use("/api/system", maintenanceRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/verify", verificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/invitations", invitationRoutes);

app.use((error, _req, res, _next) => {
  if (
    error?.code === "LIMIT_FILE_SIZE" ||
    error?.message === "Only image uploads are allowed"
  ) {
    return res.status(400).json({ message: error.message });
  }
  console.error("Unhandled server error:", error);
  return res.status(500).json({ message: "Internal server error" });
});

server.listen(PORT, () => {
  console.log(`Server & Socket.io running on port ${PORT}`);
});