import { Request, Response } from 'express';
import { IAuthRepository } from '../interfaces/auth-repository';
import { LoginRequest, RegisterRequest } from '../models/user';

export class AuthController {
  constructor(private readonly authRepository: IAuthRepository) {}

  login = async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as LoginRequest;

    if (!payload?.email || !payload?.password) {
      response.status(400).json({ message: 'Email và mật khẩu là bắt buộc' });
      return;
    }

    try {
      const loginResult = await this.authRepository.login(payload);

      if (!loginResult) {
        response.status(401).json({ message: 'Thông tin đăng nhập không đúng' });
        return;
      }

      response.json(loginResult);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  register = async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as RegisterRequest;

    if (!payload?.email || !payload?.password || !payload?.fullName || !payload?.tenantName) {
      response.status(400).json({ message: 'tenantName, fullName, email và password là bắt buộc' });
      return;
    }

    try {
      const result = await this.authRepository.register(payload);
      response.status(201).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'EMAIL_EXISTS') {
        response.status(409).json({ message: 'Email đã tồn tại' });
        return;
      }

      response.status(500).json({ message: 'Internal server error' });
    }
  };
}
