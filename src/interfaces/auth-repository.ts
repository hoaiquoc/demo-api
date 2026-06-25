import {
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  ResetPasswordRequest,
} from '../models/user';

export interface IAuthRepository {
  login(payload: LoginRequest): Promise<LoginResponse | undefined>;
  register(payload: RegisterRequest): Promise<LoginResponse>;
  requestPasswordReset(payload: ForgotPasswordRequest): Promise<ForgotPasswordResponse>;
  resetPassword(payload: ResetPasswordRequest): Promise<{ ok: boolean }>;
  changePassword(tenantId: string, userId: string, payload: ChangePasswordRequest): Promise<{ ok: boolean }>;
}
