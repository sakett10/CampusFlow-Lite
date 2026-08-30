import { clerkMiddleware, requireAuth, getAuth } from '@clerk/express';
import type { Request, Response, NextFunction } from 'express';

// Global middleware to parse token and attach to req.auth
export const clerkAuth = clerkMiddleware();

// Route-level middleware to enforce authentication
export const requireAuthMiddleware = requireAuth();

export function isReviewer(req: Request): boolean {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) return false;

  // 1. Check Clerk sessionClaims metadata/role if present
  const authReq = req as unknown as { auth?: { sessionClaims?: Record<string, unknown> } };
  const claims = authReq.auth?.sessionClaims;
  if (claims) {
    const meta = claims.metadata as Record<string, unknown> | undefined;
    const publicMeta = claims.publicMetadata as Record<string, unknown> | undefined;
    const role = (meta?.role || publicMeta?.role || claims.role) as string | undefined;
    if (role === 'reviewer' || role === 'admin') {
      return true;
    }
  }

  // 2. Check environment allowlists
  const reviewerIds = (process.env.REVIEWER_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (reviewerIds.includes(userId) || adminIds.includes(userId)) {
    return true;
  }

  // 3. Check dev/test role header
  const devRole = req.headers['x-user-role'];
  if (devRole === 'reviewer' || devRole === 'admin') {
    return true;
  }

  return false;
}

// Route-level middleware to enforce reviewer/admin access
export const requireReviewerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const auth = getAuth(req);
  if (!auth || !auth.userId) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  if (!isReviewer(req)) {
    res.status(403).json({ error: 'Forbidden: Reviewer or Admin access required' });
    return;
  }

  next();
};

