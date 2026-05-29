import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../services/db';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_omnidetect_key_123!';

/**
 * Middleware to verify JSON Web Tokens (JWT) for dashboard direct user requests.
 */
export function requireJwtAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid authentication token.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; plan: string };
    (req as any).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized', message: 'Authentication token is invalid or has expired.' });
  }
}

/**
 * Middleware to authenticate requests from both RapidAPI proxy and direct SaaS clients.
 */
export async function requireRapidApiSecret(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const proxySecretHeader = req.headers['x-rapidapi-proxy-secret'];
  const expectedSecret = process.env.RAPIDAPI_PROXY_SECRET;

  // 1. RapidAPI Proxy flow
  if (proxySecretHeader) {
    if (expectedSecret && proxySecretHeader !== expectedSecret) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Access denied. Invalid RapidAPI proxy secret.',
      });
      return;
    }
    // Default to BASIC if subscription header is not present
    if (!req.headers['x-rapidapi-subscription']) {
      req.headers['x-rapidapi-subscription'] = 'BASIC';
    }
    return next();
  }

  // 2. Direct SaaS flow via X-API-Key
  const apiKeyHeader = req.headers['x-api-key'];
  const apiKey = (apiKeyHeader as string) || (req.query.apiKey as string);

  if (apiKey) {
    const startTime = Date.now();
    try {
      const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
      const keyRecord = await prisma.apiKey.findUnique({
        where: { keyHash: hash },
        include: { user: true },
      });

      if (!keyRecord || !keyRecord.active) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid, deactivated, or revoked API key.',
        });
        return;
      }

      // Map SaaS user plan to corresponding RapidAPI tier for downstream middleware
      const planMapping: Record<string, string> = {
        'FREE': 'BASIC',
        'STARTER': 'PRO',
        'GROWTH': 'ULTRA',
        'SCALE': 'MEGA',
      };
      
      const userPlan = (keyRecord.user.plan || 'FREE').toUpperCase();
      const mappedTier = planMapping[userPlan] || 'BASIC';
      
      // Inject subscription tier into headers so tierEnforcer middleware reads it
      req.headers['x-rapidapi-subscription'] = mappedTier;

      // Log request metrics asynchronously after response finishes
      res.on('finish', async () => {
        const responseTimeMs = Date.now() - startTime;
        try {
          await prisma.apiUsage.create({
            data: {
              apiKeyId: keyRecord.id,
              endpoint: req.baseUrl + req.path,
              statusCode: res.statusCode,
              responseTimeMs,
            },
          });
        } catch (dbErr) {
          console.error('[Usage Logger] Failed to record API usage stats:', dbErr);
        }
      });

      return next();
    } catch (err: any) {
      console.error('[Auth] Direct SaaS key auth error:', err);
      res.status(500).json({ error: 'Authentication Error', message: err.message });
      return;
    }
  }

  // 3. Local testing fallback (allow requests as BASIC if no environment secrets are set)
  if (!expectedSecret) {
    console.warn('[Warning] RAPIDAPI_PROXY_SECRET environment variable is not set. Requests are allowed as BASIC without credentials.');
    req.headers['x-rapidapi-subscription'] = 'BASIC';
    return next();
  }

  res.status(401).json({
    error: 'Unauthorized',
    message: 'Access denied. Please authenticate using the RapidAPI marketplace proxy or provide a valid X-API-Key header.',
  });
}
