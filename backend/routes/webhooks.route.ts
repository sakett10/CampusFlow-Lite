import { Router } from 'express';
import { Webhook } from 'standardwebhooks';
import { userLifecycleService } from '../services/userLifecycle.service.js';
import { clerkWebhookLimiter } from '../middleware/rateLimiter.js';

const router = Router();

/**
 * Clerk Webhook Handler
 * POST /api/webhooks/clerk
 *
 * Requirements:
 * 1. Authenticated solely by cryptographic Svix/standardwebhooks HMAC-SHA256 signature verification.
 * 2. Uses CLERK_WEBHOOK_SECRET. Rejects missing headers, invalid signatures, and stale/replayed timestamps.
 * 3. Processes 'user.deleted' event type by triggering userLifecycleService.deleteUserData(userId).
 * 4. All other event types (e.g. user.created, user.updated, session.created) are safely acknowledged with HTTP 200 without side effects.
 * 5. Sanitized responses: never leak internal stack traces, database errors, or token data.
 */
router.post('/clerk', clerkWebhookLimiter, async (req, res) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CLERK_WEBHOOK_SECRET is not configured on the server.');
    return res.status(500).json({ error: 'Webhook configuration error' });
  }

  const svixId = (req.headers['svix-id'] || req.headers['webhook-id']) as string | undefined;
  const svixTimestamp = (req.headers['svix-timestamp'] || req.headers['webhook-timestamp']) as string | undefined;
  const svixSignature = (req.headers['svix-signature'] || req.headers['webhook-signature']) as string | undefined;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ error: 'Missing required webhook verification headers' });
  }

  let rawBody: string;
  if (Buffer.isBuffer(req.body)) {
    rawBody = req.body.toString('utf8');
  } else if (typeof req.body === 'string') {
    rawBody = req.body;
  } else if (req.body && typeof req.body === 'object') {
    rawBody = JSON.stringify(req.body);
  } else {
    return res.status(400).json({ error: 'Missing or malformed webhook payload' });
  }

  let event: { type?: string; data?: { id?: string; deleted?: boolean; [key: string]: unknown } };

  try {
    const wh = new Webhook(secret);
    event = wh.verify(rawBody, {
      'webhook-id': svixId,
      'webhook-timestamp': svixTimestamp,
      'webhook-signature': svixSignature,
    }) as typeof event;
  } catch (verifyError) {
    console.warn(
      'Clerk webhook signature verification failed:',
      verifyError instanceof Error ? verifyError.message : 'Invalid signature',
    );
    return res.status(400).json({ error: 'Invalid webhook signature or expired timestamp' });
  }

  if (!event || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid webhook payload structure' });
  }

  if (event.type === 'user.deleted') {
    const userId = event.data?.id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'Malformed user.deleted event: missing user ID' });
    }

    try {
      const result = await userLifecycleService.deleteUserData(userId);
      return res.status(200).json({
        success: true,
        message: 'User data purged successfully',
        userId: result.userId,
      });
    } catch (err) {
      console.error('Failed to process Clerk user.deleted webhook:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to purge user data' });
    }
  }

  // Non-deletion events are safely acknowledged without taking destructive actions
  return res.status(200).json({
    received: true,
    ignored: true,
    type: event.type || 'unknown',
  });
});

export default router;
