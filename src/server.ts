import { app } from './app';
import { pool } from './config/db';

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

const server = app.listen(port, host, () => {
  console.info(`OAU Lost & Found API listening on http://${host}:${port}`);
});

function shutdown(signal: string): void {
  console.info(`${signal} received; closing server`);
  server.close(() => {
    pool.end().then(() => process.exit(0)).catch((error: unknown) => {
      console.error('Unable to close PostgreSQL connections:', error);
      process.exit(1);
    });
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
