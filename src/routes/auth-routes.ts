import { Router } from 'express';
import { AuthController } from '../controllers/auth-controller';
import { AuthRepository } from '../repositories/auth-repository';
import { MsSqlAuthRepository } from '../repositories/mssql-auth-repository';
import { isMssqlEnabled } from '../db/mssql';

const router = Router();
const authRepository = isMssqlEnabled() ? new MsSqlAuthRepository() : new AuthRepository();
const authController = new AuthController(authRepository);

router.post('/login', authController.login);

export default router;
