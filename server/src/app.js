import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const app = express();

app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

app.get('/api/health', (request, response) => {
  response.json({ status: 'ok', service: 'account-dashboard-api' });
});
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;