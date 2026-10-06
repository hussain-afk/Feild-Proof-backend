import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie'; // npm i cookie
import envConfig from './src/config/env.config.js';
import connectDB from './src/config/database.js';
import cookieParser from 'cookie-parser';
import authRoutes from './src/router/auth.route.js';
import taskRoutes from './src/router/task.route.js';
import notificationRoutes from './src/router/notification.route.js';
import verificationRoutes from './src/router/verification.route.js';
import adminRoutes from './src/router/admin.route.js';
import User from './src/models/user.model.js'; // <-- apne User model ka sahi path likho
import cors from 'cors';

const app = express();

// Render par PORT dynamically assign hota hai, isliye fallback rakhein
const PORT = process.env.PORT || envConfig.port || 4000;
const FRONTEND_URL = envConfig.frontendUrl;

// Middlewares
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== FRONTEND_URL) {
    return res.status(403).json({ message: 'Origin not allowed' });
  }
  next();
});
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
  transports: ["polling", "websocket"]
});

// Controllers mein io access karne ke liye setup
app.set('io', io);

// ---------------------------------------------------------------
// SOCKET AUTH: user ki pehchan cookie ke token se hoti hai.
// Client se aayi userId par bharosa nahi karte, warna koi bhi
// dusre user ya admin ka room join karke uska data dekh sakta hai.
// ---------------------------------------------------------------
io.use(async (socket, next) => {
  try {
    const cookies = parseCookie(socket.handshake.headers.cookie || '');
    const token = cookies.token; // <-- jis naam se aap login par cookie set karte ho

    if (!token) return next(new Error('Not authenticated'));

    const decoded = jwt.verify(token, envConfig.jwtSecret);
    const userId = decoded.userId || decoded.id || decoded._id; // jo bhi aap jwt.sign me daalte ho

    const user = await User.findById(userId).select('role');
    if (!user) return next(new Error('User not found'));

    socket.data.userId = String(user._id);
    socket.data.role = user.role;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

// Socket.io Connection Logic
io.on('connection', (socket) => {
  const { userId, role } = socket.data;

  // Har connect (aur reconnect) par rooms server khud join karata hai
  socket.join(userId);                          // private room
  if (role === 'admin') socket.join('admins');  // admin dashboard ke liye
  console.log(`User connected: ${userId} (${role})`);

  // Purana frontend abhi bhi "join_room" emit karta hai, ignore kar do
  socket.on('join_room', () => {});

  socket.on('disconnect', () => {
    console.log('User disconnected:', userId);
  });
});

// Database Connection
connectDB();

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).send('Server is active and healthy');
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/verify', verificationRoutes);
app.use('/api/admin', adminRoutes);

app.use((error, _req, res, _next) => {
  if (error?.code === 'LIMIT_FILE_SIZE' || error?.message === 'Only image uploads are allowed') {
    return res.status(400).json({ message: error.message });
  }
  console.error('Unhandled server error:', error);
  return res.status(500).json({ message: 'Internal server error' });
});

// Server Listen
server.listen(PORT, () => {
  console.log(`Server & Socket.io running on port ${PORT}`);
});