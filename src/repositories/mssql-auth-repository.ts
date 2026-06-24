import { randomUUID } from 'node:crypto';
import { IAuthRepository } from '../interfaces/auth-repository';
import { LoginRequest, LoginResponse } from '../models/user';
import { getMssqlPool, sql } from '../db/mssql';
import { getUsersTableName } from '../db/schema';
import { verifyPassword } from '../utils/password';

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  role: 'Owner' | 'Editor' | 'Viewer';
  avatar: string;
  spaces: number;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
};

export class MsSqlAuthRepository implements IAuthRepository {
  async login(payload: LoginRequest): Promise<LoginResponse | undefined> {
    const pool = await getMssqlPool();
    const table = getUsersTableName();

    const result = await pool.request().input('email', sql.NVarChar(256), payload.email.trim()).query(`
      SELECT TOP 1
        [id],
        [email],
        [fullName],
        [role],
        [avatar],
        [spaces],
        [passwordHash],
        [passwordSalt],
        [passwordIterations]
      FROM ${table}
      WHERE LOWER([email]) = LOWER(@email)
    `);

    const row = result.recordset?.[0] as UserRow | undefined;
    if (!row) {
      return undefined;
    }

    const ok = verifyPassword(payload.password, {
      hash: String(row.passwordHash),
      salt: String(row.passwordSalt),
      iterations: Number(row.passwordIterations),
    });

    if (!ok) {
      return undefined;
    }

    return {
      accessToken: `token-${randomUUID()}`,
      user: {
        id: String(row.id),
        email: String(row.email),
        fullName: String(row.fullName),
        role: row.role === 'Owner' || row.role === 'Editor' || row.role === 'Viewer' ? row.role : 'Viewer',
        avatar: String(row.avatar),
        spaces: Number(row.spaces),
      },
    };
  }
}
