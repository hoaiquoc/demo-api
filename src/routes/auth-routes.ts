import { Router } from 'express';
import { AuthController } from '../controllers/auth-controller';
import { AuthRepository } from '../repositories/auth-repository';

const router = Router();
const authRepository = new AuthRepository();
const authController = new AuthController(authRepository);

router.post('/login', authController.login);

export default router;
