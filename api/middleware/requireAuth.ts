import { clerkMiddleware, requireAuth } from '@clerk/express';

// Global middleware to parse token and attach to req.auth
export const clerkAuth = clerkMiddleware();

// Route-level middleware to enforce authentication
export const requireAuthMiddleware = requireAuth();
