import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './routes/auth-routes';
import transactionsRoutes from './routes/transactions-routes';
import { swaggerDocument } from './swagger';

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

app.get('/', (_request, response) => {
  response.redirect('/swagger');
});

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionsRoutes);

export default app;
