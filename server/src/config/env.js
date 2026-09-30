import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const required = ['JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development'
};

if (!config.mongoUri) {
  throw new Error('Missing required environment variable: MONGO_URI');
}
