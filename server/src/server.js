import app from './app.js';
import { config } from './config/env.js';
import { connectDatabase } from './config/db.js';

try {
  await connectDatabase();
  const server = app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(`Unable to start API: ${error.message}`);
  process.exit(1);
}