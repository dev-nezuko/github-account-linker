import express, { Application } from 'express';

import githubRoutes from './routes/github.router';
import { requireFrontendOrigin } from './middleware/originGuard';

export function createApp(): Application {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    res.json({status: 'ok'});
  });
  app.use('/api/github', requireFrontendOrigin, githubRoutes);
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API request failed');
    res.status(500).json({message: 'Request failed'});
  });
  return app;
}
