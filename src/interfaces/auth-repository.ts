import { LoginRequest, LoginResponse } from '../models/user';

export interface IAuthRepository {
  login(payload: LoginRequest): Promise<LoginResponse | undefined>;
}
