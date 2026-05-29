import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from './services/db';
import { requireJwtAuth, requireRapidApiSecret } from './middleware/auth';
import { enforceTierLimits } from './middleware/tierEnforcer';
import { analyzeText } from './services/detector';
import { humanize } from './services/humanizer';
import { checkPlagiarism } from './services/plagiarism';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001; // Runs on port 5001 to avoid conflicting with OmniGlass on 5000!

app.use(cors());
app.use(express.json());

// ==========================================================
// PUBLIC DEVELOPER ENDPOINTS
// ==========================================================

// 1. Health Status
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'OmniDetect API',
    identifier: 'omnidetect-api'
  });
});

// 2. Welcome Root Greeting
app.get('/v1', (req: Request, res: Response) => {
  res.json({
    service: 'OmniDetect API',
    version: '1.0.0',
    message: 'Welcome to the OmniDetect AI & Text Intelligence API. Query /v1/endpoints to see the full developer API catalog.'
  });
});

// 3. API Catalog Endpoint Directory
app.get('/v1/endpoints', (req: Request, res: Response) => {
  res.json({
    service: 'OmniDetect API Catalog',
    endpointsCount: 3,
    groups: [
      {
        name: 'AI Content Detection',
        description: 'Analyze content layout complexity and predictability to flag AI-generated text structures.',
        endpoints: [
          {
            path: '/v1/detect',
            method: 'POST',
            description: 'Computes AI content probability percentages, word/sentence lengths, perplexity, and sentence-by-sentence analysis.',
            parameters: {
              body: {
                text: { type: 'string', required: true, description: 'Direct text content to scan' }
              }
            }
          }
        ]
      },
      {
        name: 'AI Bypass & Humanizer',
        description: 'Rewrite predictability parameters and syntax rhythm to humanize AI text signatures.',
        endpoints: [
          {
            path: '/v1/humanize',
            method: 'POST',
            description: 'Transforms text vocabulary transitions and sentence burstiness structure to drop AI scores to < 10%.',
            parameters: {
              body: {
                text: { type: 'string', required: true, description: 'AI text to bypass' },
                mode: { type: 'string', required: false, enum: ['standard', 'creative'], default: 'standard' }
              }
            }
          }
        ]
      },
      {
        name: 'Plagiarism Checker',
        description: 'Scrapes web search indexes to detect duplicate copy and verify text originality.',
        endpoints: [
          {
            path: '/v1/check/plagiarism',
            method: 'POST',
            description: 'Compares text sentence snippets against live search engine results to calculate Levenshtein distance duplicate matches.',
            parameters: {
              body: {
                text: { type: 'string', required: true, description: 'Text to scan for plagiarism' }
              }
            }
          }
        ]
      }
    ]
  });
});

// 4. Endpoint: POST /v1/detect (AI Content Detection)
app.post('/v1/detect', requireRapidApiSecret, enforceTierLimits, (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) {
    res.status(400).json({ error: 'Bad Request', message: 'Parameter "text" is required in request body.' });
    return;
  }

  try {
    const result = analyzeText(text);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// 5. Endpoint: POST /v1/humanize (AI Bypass / Humanizer)
app.post('/v1/humanize', requireRapidApiSecret, enforceTierLimits, (req: Request, res: Response) => {
  const { text, mode } = req.body;
  if (!text) {
    res.status(400).json({ error: 'Bad Request', message: 'Parameter "text" is required in request body.' });
    return;
  }

  try {
    const result = humanize(text, mode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// 6. Endpoint: POST /v1/check/plagiarism (Web Plagiarism Scanner)
app.post('/v1/check/plagiarism', requireRapidApiSecret, enforceTierLimits, async (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) {
    res.status(400).json({ error: 'Bad Request', message: 'Parameter "text" is required in request body.' });
    return;
  }

  try {
    const result = await checkPlagiarism(text);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ==========================================================
// SAAS PORTAL DEVELOPER DASHBOARD ENDPOINTS
// ==========================================================

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_omnidetect_key_123!';

// 1. User Registration
app.post('/api/auth/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Bad Request', message: 'Email and password are required.' });
    return;
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: 'Bad Request', message: 'User with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, plan: 'FREE' }
    });

    const token = jwt.sign({ userId: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, plan: user.plan } });
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
});

// 2. User Login
app.post('/api/auth/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Bad Request', message: 'Email and password are required.' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
      return;
    }

    const token = jwt.sign({ userId: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, plan: user.plan } });
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
});

// 3. Get Developer API Keys
app.get('/api/keys', requireJwtAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  try {
    const keys = await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    // Return masked hashes to avoid exposing raw secret keys
    res.json(keys.map(k => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      active: k.active,
      createdAt: k.createdAt
    })));
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
});

// 4. Create Developer API Key (prefix "od_")
app.post('/api/keys', requireJwtAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: 'Bad Request', message: 'Key name is required.' });
    return;
  }

  try {
    // Generate secure random string prefixed with od_ (OmniDetect)
    const rawKey = 'od_' + crypto.randomBytes(24).toString('hex');
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

    await prisma.apiKey.create({
      data: {
        userId,
        name,
        keyHash: hash,
        keyPrefix: rawKey.substring(0, 5)
      }
    });

    res.status(201).json({ rawKey, message: 'API key generated. Store it carefully as it won\'t be shown again.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
});

// 5. Delete API Key
app.delete('/api/keys/:id', requireJwtAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.userId;
  const keyId = req.params.id;

  try {
    const key = await prisma.apiKey.findUnique({ where: { id: keyId } });
    if (!key || key.userId !== userId) {
      res.status(404).json({ error: 'Not Found', message: 'API key not found.' });
      return;
    }

    await prisma.apiKey.delete({ where: { id: keyId } });
    res.json({ message: 'API key successfully deleted.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
});

// 6. Get API Usage Analytics
app.get('/api/usage', requireJwtAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  try {
    const keys = await prisma.apiKey.findMany({ where: { userId } });
    const keyIds = keys.map(k => k.id);

    const usage = await prisma.apiUsage.findMany({
      where: { apiKeyId: { in: keyIds } },
      orderBy: { timestamp: 'desc' },
      take: 100
    });

    res.json(usage);
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
});

// 7. Get Subscription Info
app.get('/api/billing', requireJwtAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.userId;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'Not Found', message: 'User not found.' });
      return;
    }
    res.json({ plan: user.plan });
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
});

// 8. Upgrade Subscription Plan
app.post('/api/billing/upgrade', requireJwtAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.userId;
  const { plan } = req.body; // 'FREE' | 'STARTER' | 'GROWTH' | 'SCALE'
  
  if (!plan || !['FREE', 'STARTER', 'GROWTH', 'SCALE'].includes(plan.toUpperCase())) {
    res.status(400).json({ error: 'Bad Request', message: 'Invalid plan selection.' });
    return;
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { plan: plan.toUpperCase() }
    });
    res.json({ plan: updatedUser.plan, message: `Successfully upgraded to ${updatedUser.plan} plan.` });
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`OmniDetect API backend server is running on http://localhost:${PORT}`);
});
