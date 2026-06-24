import { Request, Response } from 'express';
import { IAuthRepository } from '../interfaces/auth-repository';
import { LoginRequest } from '../models/user';

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
}
