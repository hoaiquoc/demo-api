import { randomUUID } from 'node:crypto';
import { IAuthRepository } from '../interfaces/auth-repository';
import { LoginRequest, LoginResponse, RegisterRequest } from '../models/user';
import { getMssqlPool, sql } from '../db/mssql';
import { getSessionsTableName, getTenantsTableName, getUsersTableName } from '../db/schema';
import { hashPassword, verifyPassword } from '../utils/password';

type UserRow = {
  id: string;
  tenantId: string;
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
    const sessionsTable = getSessionsTableName();

    const result = await pool.request().input('email', sql.NVarChar(256), payload.email.trim()).query(`
      SELECT TOP 1
        [id],
        [tenantId],
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

    const token = `token-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    await pool
      .request()
      .input('token', sql.NVarChar(128), token)
      .input('userId', sql.NVarChar(64), String(row.id))
      .input('tenantId', sql.NVarChar(64), String(row.tenantId))
      .input('expiresAt', sql.DateTime2, expiresAt)
      .query(`
        INSERT INTO ${sessionsTable} ([token], [userId], [tenantId], [expiresAt])
        VALUES (@token, @userId, @tenantId, @expiresAt)
      `);

    return {
      accessToken: token,
      user: {
        id: String(row.id),
        tenantId: String(row.tenantId),
        email: String(row.email),
        fullName: String(row.fullName),
        role: row.role === 'Owner' || row.role === 'Editor' || row.role === 'Viewer' ? row.role : 'Viewer',
        avatar: String(row.avatar),
        spaces: Number(row.spaces),
      },
    };
  }

  async register(payload: RegisterRequest): Promise<LoginResponse> {
    const pool = await getMssqlPool();
    const tenantsTable = getTenantsTableName();
    const usersTable = getUsersTableName();
    const sessionsTable = getSessionsTableName();

    const email = payload.email.trim();
    const tenantName = payload.tenantName.trim();
    const fullName = payload.fullName.trim();

    const existing = await pool.request().input('email', sql.NVarChar(256), email).query(`
      SELECT TOP 1 [id]
      FROM ${usersTable}
      WHERE LOWER([email]) = LOWER(@email)
    `);

    if (existing.recordset?.[0]) {
      throw new Error('EMAIL_EXISTS');
    }

    const tenantId = randomUUID();
    const userId = randomUUID();
    const password = hashPassword(payload.password);
    const token = `token-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    const sqlTransaction = new sql.Transaction(pool);
    await sqlTransaction.begin();

    try {
      await new sql.Request(sqlTransaction)
        .input('id', sql.NVarChar(64), tenantId)
        .input('name', sql.NVarChar(128), tenantName || 'Sổ chi tiêu')
        .input('ownerEmail', sql.NVarChar(256), email)
        .query(`
          INSERT INTO ${tenantsTable} ([id], [name], [ownerEmail])
          VALUES (@id, @name, @ownerEmail)
        `);

      await new sql.Request(sqlTransaction)
        .input('id', sql.NVarChar(64), userId)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('email', sql.NVarChar(256), email)
        .input('fullName', sql.NVarChar(128), fullName || email)
        .input('role', sql.NVarChar(16), 'Owner')
        .input('avatar', sql.NVarChar(8), (fullName || 'ME').slice(0, 2).toUpperCase())
        .input('spaces', sql.Int, 1)
        .input('passwordHash', sql.NVarChar(256), password.hash)
        .input('passwordSalt', sql.NVarChar(256), password.salt)
        .input('passwordIterations', sql.Int, password.iterations)
        .query(`
          INSERT INTO ${usersTable} (
            [id], [tenantId], [email], [fullName], [role], [avatar], [spaces],
            [passwordHash], [passwordSalt], [passwordIterations]
          )
          VALUES (
            @id, @tenantId, @email, @fullName, @role, @avatar, @spaces,
            @passwordHash, @passwordSalt, @passwordIterations
          )
        `);

      await new sql.Request(sqlTransaction)
        .input('token', sql.NVarChar(128), token)
        .input('userId', sql.NVarChar(64), userId)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('expiresAt', sql.DateTime2, expiresAt)
        .query(`
          INSERT INTO ${sessionsTable} ([token], [userId], [tenantId], [expiresAt])
          VALUES (@token, @userId, @tenantId, @expiresAt)
        `);

      await sqlTransaction.commit();

      return {
        accessToken: token,
        user: {
          id: userId,
          tenantId,
          email,
          fullName: fullName || email,
          role: 'Owner',
          avatar: (fullName || 'ME').slice(0, 2).toUpperCase(),
          spaces: 1,
        },
      };
    } catch (error) {
      await sqlTransaction.rollback();
      throw error;
    }
  }
}
