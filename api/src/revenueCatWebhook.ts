import type { Application, Request, Response } from 'express';
import { handleRevenueCatWebhook } from './services/RevenueCatBilling';
import { revenueCatWebhookAuthorized } from './services/RevenueCatService';

export function registerRevenueCatWebhook(app: Application): void {
  app.post('/webhooks/revenuecat', async (req: Request, res: Response) => {
    if (!revenueCatWebhookAuthorized(req.header('authorization'))) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const result = await handleRevenueCatWebhook(req.body);
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[revenuecat] webhook failed', err);
      res.status(500).json({ error: 'Webhook failed' });
    }
  });
}
