import rateLimit from "express-rate-limit";

// General API — har IP
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 15 min mein max 300 requests
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many requests. Please try again later.",
  },
});

// Login / register — stricter (brute force rokne ke liye)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 15 min mein 20 tries
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many login/register attempts. Try again in 15 minutes.",
  },
});

// Sensitive: verify email, send code
export const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many attempts. Please try again later.",
  },
});

// Admin panel — logged-in admin, medium limit
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 150, // panel use ke liye comfortable
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many admin requests. Please try again later.",
  },
});

// Invites / important writes
export const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40, // 15 min mein 40 invite/accept/reject
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many invitation actions. Please try again later.",
  },
});

export const publicStatusLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many status checks. Please try again shortly.",
  },
});

export const taskWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // 15 min mein create/delete
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many task changes. Please try again later.",
  },
});

// Worker check-in / check-out (image + GPS)
export const checkInOutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 15 min mein 30 check-in/out
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many check-in/out attempts. Please try again later.",
  },
});

// Manager approve / reject / delete
export const verificationWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many verification actions. Please try again later.",
  },
});