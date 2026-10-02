import app from './app.js';
import { config } from './config/env.js';
import { disconnectDatabase, prisma } from './config/prisma.js';

try {
  await prisma.$connect();
  const server = app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(`Unable to start API: ${error.message}`);
  process.exit(1);
}