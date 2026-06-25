export type UserRole = 'Owner' | 'Editor' | 'Viewer';

export interface User {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  avatar: string;
  spaces: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatar: string;
  spaces: number;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RegisterRequest {
  tenantName: string;
  fullName: string;
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  ok: boolean;
  resetToken?: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
