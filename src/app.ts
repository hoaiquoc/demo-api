import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './routes/auth-routes';
import accountsRoutes from './routes/accounts-routes';
import categoriesRoutes from './routes/categories-routes';
import transactionsRoutes from './routes/transactions-routes';
import transfersRoutes from './routes/transfers-routes';
import spendingAlertsRoutes from './routes/spending-alerts-routes';
import membersRoutes from './routes/members-routes';
import budgetsRoutes from './routes/budgets-routes';
import marketPricesRoutes from './routes/market-prices-routes';
import { swaggerDocument } from './swagger';
import { getMssqlPool, isMssqlEnabled } from './db/mssql';
import { requireAuth } from './middleware/auth';

const app = express();
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS;

const corsOptions = (() => {
  if (!allowedOrigins?.trim()) {
    return {
      origin: true,
      credentials: true,
    };
  }

  return {
    origin: allowedOrigins.split(',').map((origin) => origin.trim()),
    credentials: true,
  };
})();

app.use(cors(corsOptions));
app.use(express.json());
app.set('etag', false);

app.use((request, response, next) => {
  if (request.path.startsWith('/api')) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
  }

  next();
});

app.get('/', (_request, response) => {
  response.redirect('/swagger');
});

app.get('/health', (_request, response) => {
  response.json({ status: 'ok', mssql: isMssqlEnabled() ? 'enabled' : 'disabled' });
});

app.get('/health/db', async (_request, response) => {
  if (!isMssqlEnabled()) {
    response.status(400).json({ status: 'disabled' });
    return;
  }

  try {
    const pool = await getMssqlPool();
    const result = await pool.request().query('SELECT 1 AS ok');
    response.json({ status: 'ok', ok: result.recordset?.[0]?.ok === 1 });
  } catch {
    response.status(500).json({ status: 'error' });
  }
});

app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth);
app.use('/api/accounts', accountsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/spending-alerts', spendingAlertsRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/budgets', budgetsRoutes);
app.use('/api/market-prices', marketPricesRoutes);

export default app;
