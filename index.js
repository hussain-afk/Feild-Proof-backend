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

// Middlewares
app.use(cors({
  origin: envConfig.frontendUrl,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// HTTP Server & Socket.io Setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: envConfig.frontendUrl,
    credentials: true
  }
});

// IMPORTANT: Controllers mein io use karne ke liye app setting set karein
app.set('io', io);

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Private room join logic
  socket.on('join_room', (userId) => {
    if (userId) {
      socket.join(userId.toString());
      console.log(`User ${userId} joined their private room`);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Database Connection
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/verify', verificationRoutes);

// FIXED: app.listen ki jagah server.listen use karein
server.listen(envConfig.port, () => {
  console.log(`Server & Socket.io running on port ${envConfig.port}`);
});