import { app } from './app';
import { pool } from './config/db';
import { env } from './config/env';

const server = app.listen(env.port, () => {
  console.info(`OAU Lost & Found API listening on port ${env.port}`);
});

function shutdown(signal: string): void {
  console.info(`${signal} received; closing server`);
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
