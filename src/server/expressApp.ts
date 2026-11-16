import express, { Request, Response, NextFunction } from 'express';
import { apiRouter } from './api.ts';

export const createExpressApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  // Global error handler to prevent crashing dev server
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Express API error caught in middleware:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  });

  return app;
};

export const expressApp = createExpressApp();

