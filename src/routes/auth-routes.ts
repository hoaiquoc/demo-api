import { Router } from 'express';
import { AuthController } from '../controllers/auth-controller';
import { MsSqlAuthRepository } from '../repositories/mssql-auth-repository';
import { isMssqlEnabled } from '../db/mssql';

const router = Router();
if (!isMssqlEnabled()) {
  router.use((_request, response) => {
    response.status(500).json({ message: 'MSSQL chưa được cấu hình' });
  });
} else {
  const authRepository = new MsSqlAuthRepository();
  const authController = new AuthController(authRepository);

  router.post('/login', authController.login);
}

export default router;
