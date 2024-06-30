import express, { Application } from 'express';
import cors, { CorsOptions } from 'cors';
import mongoose from 'mongoose';

import githubRoutes from './routes/github.router';
import appConfig from './config/appConfig';

const app: Application = express();
const port = appConfig.serverPort || 3000;

const whitelist: string[] = ['http://localhost:4200'];

const corsOptions: CorsOptions = {
  origin: function (origin, callback) {
    if (!origin || whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(express.json());

app.get('/', (req, res) => res.send('Server is running'));
app.use('/api/github', cors(corsOptions), githubRoutes);
app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('API request failed');
  res.status(500).json({message: 'Request failed'});
});

mongoose
  .connect(appConfig.dbUrl!)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(port, '127.0.0.1', () => {
      console.log(`Server running http://localhost:${port}`);
    });
  })
  .catch(() => console.error('MongoDB connection failed'));
