import { LoginRequest, LoginResponse, RegisterRequest } from '../models/user';

export interface IAuthRepository {
  login(payload: LoginRequest): Promise<LoginResponse | undefined>;
  register(payload: RegisterRequest): Promise<LoginResponse>;
}
