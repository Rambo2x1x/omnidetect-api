import { Request, Response, NextFunction } from 'express';

/**
 * Express middleware to enforce plan-specific limits for OmniDetect API.
 */
export function enforceTierLimits(req: Request, res: Response, next: NextFunction): void {
  const subscription = (req.header('X-RapidAPI-Subscription') || 'BASIC').toUpperCase();
  const path = req.path;

  console.log(`[TierEnforcer] Request path: ${path}, Subscription Tier: ${subscription}`);

  // Skip checks for administrative endpoints
  if (path.startsWith('/api/') || path === '/health' || path === '/v1/endpoints' || path === '/v1') {
    return next();
  }

  const bodyText = req.body?.text || '';
  const textLength = bodyText.length;

  // ==========================================================
  // TIER 1: BASIC (Free / FREE Plan)
  // ==========================================================
  if (subscription === 'BASIC' || subscription === 'FREE') {
    // 1. Block Plagiarism Checking
    if (path.startsWith('/v1/check/plagiarism')) {
      res.status(403).json({
        error: 'Feature Locked',
        message: 'Web plagiarism duplicate checking is a premium feature. Please upgrade to the ULTRA plan to scan text against web databases.'
      });
      return;
    }

    // 2. Block AI Humanizer
    if (path.startsWith('/v1/humanize')) {
      res.status(403).json({
        error: 'Feature Locked',
        message: 'AI Content Humanizer & Bypass rewriter is locked on the Free tier. Please upgrade to the PRO plan to bypass detectors.'
      });
      return;
    }

    // 3. Limit AI Detection Character length (max 500 chars)
    if (path.startsWith('/v1/detect')) {
      if (textLength > 500) {
        res.status(403).json({
          error: 'Limit Exceeded',
          message: `The Free tier limits AI detection inputs to 500 characters. Your text has ${textLength} characters. Please upgrade to the PRO plan to increase limit to 5,000 characters.`
        });
        return;
      }
    }
  }

  // ==========================================================
  // TIER 2: PRO
  // ==========================================================
  if (subscription === 'PRO') {
    // 1. Block Plagiarism Checking
    if (path.startsWith('/v1/check/plagiarism')) {
      res.status(403).json({
        error: 'Feature Locked',
        message: 'Web plagiarism duplicate checking is locked on the PRO plan. Please upgrade to the ULTRA plan to unlock web database scanning.'
      });
      return;
    }

    // 2. Limit AI Humanizer Character length (max 1,500 chars)
    if (path.startsWith('/v1/humanize')) {
      if (textLength > 1500) {
        res.status(403).json({
          error: 'Limit Exceeded',
          message: `The PRO plan limits the AI humanizer to 1,500 characters per request. Your input has ${textLength} characters. Please upgrade to the ULTRA plan to increase limit to 10,000 characters.`
        });
        return;
      }
    }

    // 3. Limit AI Detection Character length (max 5,000 chars)
    if (path.startsWith('/v1/detect')) {
      if (textLength > 5000) {
        res.status(403).json({
          error: 'Limit Exceeded',
          message: `The PRO plan limits AI detection to 5,000 characters per request. Your input has ${textLength} characters. Please upgrade to the ULTRA plan to increase limit to 50,000 characters.`
        });
        return;
      }
    }
  }

  // ==========================================================
  // TIER 3: ULTRA / MEGA (Full Access)
  // ==========================================================
  if (subscription === 'ULTRA' || subscription === 'MEGA') {
    // 1. Limit AI Detection Character length (max 50,000 chars)
    if (path.startsWith('/v1/detect')) {
      if (textLength > 50000) {
        res.status(403).json({
          error: 'Limit Exceeded',
          message: `The maximum limit for AI content detection is 50,000 characters per request. Your input has ${textLength} characters.`
        });
        return;
      }
    }

    // 2. Limit AI Humanizer Character length (max 10,000 chars)
    if (path.startsWith('/v1/humanize')) {
      if (textLength > 10000) {
        res.status(403).json({
          error: 'Limit Exceeded',
          message: `The maximum limit for the AI humanizer is 10,000 characters per request. Your input has ${textLength} characters.`
        });
        return;
      }
    }

    // 3. Limit Plagiarism Scanning Character length (max 10,000 chars)
    if (path.startsWith('/v1/check/plagiarism')) {
      if (textLength > 10000) {
        res.status(403).json({
          error: 'Limit Exceeded',
          message: `The maximum limit for plagiarism checks is 10,000 characters per request. Your input has ${textLength} characters.`
        });
        return;
      }
    }
  }

  next();
}
