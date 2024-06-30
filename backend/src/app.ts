import express, { Application } from 'express';
import cors, { CorsOptions } from 'cors';

import githubRoutes from './routes/github.router';
import appConfig from './config/appConfig';

export function createApp(): Application {
  const app = express();
  app.disable('x-powered-by');

  const corsOptions: CorsOptions = {
    origin: (origin, callback) => callback(null, !origin || origin === appConfig.frontendOrigin),
    credentials: true,
  };

  app.get('/health', (_req, res) => {
    res.json({status: 'ok'});
  });
  app.use('/api/github', cors(corsOptions), githubRoutes);
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API request failed');
    res.status(500).json({message: 'Request failed'});
  });
  return app;
}
