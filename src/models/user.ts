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
