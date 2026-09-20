import express from 'express';
import envConfig from './src/config/env.config.js';
import connectDB from './src/config/database.js';
import cookieParser from 'cookie-parser';
import authRoutes from './src/router/auth.route.js';
import taskRoutes from './src/router/task.route.js';
import verificationRoutes from './src/router/verification.route.js';
import cors from 'cors';
// middlewares
const app = express();
app.use(cors({
  origin: envConfig.frontendUrl,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// db connection
connectDB();
// routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/verify', verificationRoutes);

app.listen(envConfig.port, () => {
  console.log(`Server is running on port ${envConfig.port}`);
});