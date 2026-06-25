import { Request, Response } from 'express';
import { IAuthRepository } from '../interfaces/auth-repository';
import { ChangePasswordRequest, ForgotPasswordRequest, RegisterRequest, ResetPasswordRequest, LoginRequest } from '../models/user';

export class AuthController {
  constructor(private readonly authRepository: IAuthRepository) {}

  private getTenantId(response: Response): string {
    return String((response.locals as Record<string, unknown>).tenantId ?? '');
  }

  private getUserId(response: Response): string {
    return String((response.locals as Record<string, unknown>).userId ?? '');
  }

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

  forgotPassword = async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as ForgotPasswordRequest;

    if (!payload?.email) {
      response.status(400).json({ message: 'Email là bắt buộc' });
      return;
    }

    try {
      const result = await this.authRepository.requestPasswordReset(payload);
      response.json(result);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  resetPassword = async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as ResetPasswordRequest;

    if (!payload?.token || !payload?.password) {
      response.status(400).json({ message: 'token và password là bắt buộc' });
      return;
    }

    if (String(payload.password).trim().length < 6) {
      response.status(400).json({ message: 'Mật khẩu phải tối thiểu 6 ký tự' });
      return;
    }

    try {
      const result = await this.authRepository.resetPassword(payload);
      if (!result.ok) {
        response.status(400).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
        return;
      }
      response.json(result);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  changePassword = async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as ChangePasswordRequest;

    if (!payload?.currentPassword || !payload?.newPassword) {
      response.status(400).json({ message: 'currentPassword và newPassword là bắt buộc' });
      return;
    }

    if (String(payload.newPassword).trim().length < 6) {
      response.status(400).json({ message: 'Mật khẩu mới phải tối thiểu 6 ký tự' });
      return;
    }

    try {
      const result = await this.authRepository.changePassword(this.getTenantId(response), this.getUserId(response), payload);
      if (!result.ok) {
        response.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
        return;
      }
      response.json(result);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };
}
