import 'dotenv/config';
import app from './app';
import { closeMssqlPool, getMssqlPool, isMssqlEnabled } from './db/mssql';
const port = Number(process.env.PORT ?? 10000);

app.listen(port, () => {
  console.log(`WebAPI is running on port ${port}`);
});

process.on('SIGINT', () => {
  void closeMssqlPool().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void closeMssqlPool().finally(() => process.exit(0));
});

if (isMssqlEnabled()) {
  void getMssqlPool().catch(() => {
    console.error('Failed to connect to MSSQL. Check MSSQL_* environment variables.');
  });
}
