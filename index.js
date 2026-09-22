import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import envConfig from './src/config/env.config.js';
import connectDB from './src/config/database.js';
import cookieParser from 'cookie-parser';
import authRoutes from './src/router/auth.route.js';
import taskRoutes from './src/router/task.route.js';
import notificationRoutes from './src/router/notification.route.js';
import verificationRoutes from './src/router/verification.route.js';
import cors from 'cors';

const app = express();

// Render par PORT dynamically assign hota hai, isliye fallback (10000 / envConfig.port) rakhein
const PORT = process.env.PORT || envConfig.port || 4000;
const FRONTEND_URL = envConfig.frontendUrl;

// Middlewares
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// HTTP Server & Socket.io Setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST"]
  },
  transports: ["polling", "websocket"] // Polling to WebSocket upgrade support for cloud hosting
});

// Controllers mein io access karne ke liye setup
app.set('io', io);

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Private room join logic
  socket.on('join_room', (userId) => {
    if (userId) {
      socket.join(userId.toString());
      console.log(`👤 User ${userId} joined their private room`);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Database Connection
connectDB();

// Health Check Endpoint (Render keeping-alive / monitoring ke liye best practice)
app.get('/health', (req, res) => {
  res.status(200).send('Server is active and healthy');
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/verify', verificationRoutes);

// Server Listen
server.listen(PORT, () => {
  console.log(`Server & Socket.io running on port ${PORT}`);
});