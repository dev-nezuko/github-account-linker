import mongoose from 'mongoose';

import appConfig from './config/appConfig';
import { createApp } from './app';

mongoose
  .connect(appConfig.dbUrl)
  .then(() => {
    console.log('MongoDB connected');
    createApp().listen(appConfig.serverPort, appConfig.host, () => {
      console.log(`API listening on http://${appConfig.host}:${appConfig.serverPort}`);
    });
  })
  .catch(() => {
    console.error('MongoDB connection failed');
    process.exitCode = 1;
  });
