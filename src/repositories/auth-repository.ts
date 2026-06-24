import { randomUUID } from 'node:crypto';
import { IAuthRepository } from '../interfaces/auth-repository';
import { AuthUser, LoginRequest, LoginResponse, User } from '../models/user';

const mockUsers: User[] = [
  {
    id: 'u1',
    email: 'minh@chitieu.vn',
    password: '123456',
    fullName: 'Nguyễn Quang Minh',
    role: 'Owner',
    avatar: 'MN',
    spaces: 3,
  },
  {
    id: 'u2',
    email: 'lan@chitieu.vn',
    password: '123456',
    fullName: 'Trần Ngọc Lan',
    role: 'Editor',
    avatar: 'LA',
    spaces: 2,
  },
  {
    id: 'u3',
    email: 'nhi@chitieu.vn',
    password: '123456',
    fullName: 'Lê Gia Nhi',
    role: 'Viewer',
    avatar: 'NH',
    spaces: 1,
  },
];

function mapUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    avatar: user.avatar,
    spaces: user.spaces,
  };
}

export class AuthRepository implements IAuthRepository {
  login(payload: LoginRequest): LoginResponse | undefined {
    const matchedUser = mockUsers.find(
      (user) => user.email.toLowerCase() === payload.email.toLowerCase() && user.password === payload.password,
    );

    if (!matchedUser) {
      return undefined;
    }

    return {
      accessToken: `mock-token-${randomUUID()}`,
      user: mapUser(matchedUser),
    };
  }
}
