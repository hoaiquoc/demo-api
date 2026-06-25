import { randomUUID } from 'node:crypto';
import { IAuthRepository } from '../interfaces/auth-repository';
import { ChangePasswordRequest, ForgotPasswordRequest, ForgotPasswordResponse, LoginRequest, LoginResponse, RegisterRequest, ResetPasswordRequest } from '../models/user';
import { getMssqlPool, sql } from '../db/mssql';
import { getPasswordResetTokensTableName, getSessionsTableName, getTenantsTableName, getUsersTableName } from '../db/schema';
import { hashPassword, verifyPassword } from '../utils/password';

type UserRow = {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: 'Owner' | 'Editor' | 'Viewer';
  avatar: string;
  spaces: number;
  isActive?: unknown;
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
        [isActive],
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

    if (row.isActive === 0 || row.isActive === false) {
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

  async requestPasswordReset(payload: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    const email = payload.email.trim();

    if (!email) {
      return { ok: true };
    }

    const pool = await getMssqlPool();
    const usersTable = getUsersTableName();
    const tokensTable = getPasswordResetTokensTableName();

    const userResult = await pool.request().input('email', sql.NVarChar(256), email).query(`
      SELECT TOP 1 [id], [tenantId], [isActive]
      FROM ${usersTable}
      WHERE LOWER([email]) = LOWER(@email)
    `);

    const userRow = userResult.recordset?.[0] as Record<string, unknown> | undefined;
    if (!userRow) {
      return { ok: true };
    }

    if (userRow.isActive === 0 || userRow.isActive === false) {
      return { ok: true };
    }

    const token = `reset-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 15);

    await pool
      .request()
      .input('token', sql.NVarChar(128), token)
      .input('userId', sql.NVarChar(64), String(userRow.id))
      .input('tenantId', sql.NVarChar(64), String(userRow.tenantId))
      .input('expiresAt', sql.DateTime2, expiresAt)
      .query(`
        INSERT INTO ${tokensTable} ([token], [userId], [tenantId], [expiresAt])
        VALUES (@token, @userId, @tenantId, @expiresAt)
      `);

    return { ok: true, resetToken: token };
  }

  async resetPassword(payload: ResetPasswordRequest): Promise<{ ok: boolean }> {
    const token = payload.token.trim();
    const passwordRaw = payload.password;

    const pool = await getMssqlPool();
    const usersTable = getUsersTableName();
    const tokensTable = getPasswordResetTokensTableName();

    const tokenResult = await pool.request().input('token', sql.NVarChar(128), token).query(`
      SELECT TOP 1 [token], [userId], [tenantId], [expiresAt], [usedAt]
      FROM ${tokensTable}
      WHERE [token] = @token
    `);

    const tokenRow = tokenResult.recordset?.[0] as Record<string, unknown> | undefined;
    if (!tokenRow) {
      return { ok: false };
    }

    const usedAt = tokenRow.usedAt ? new Date(String(tokenRow.usedAt)) : null;
    if (usedAt) {
      return { ok: false };
    }

    const expiresAt = new Date(String(tokenRow.expiresAt));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return { ok: false };
    }

    const password = hashPassword(passwordRaw);
    const sqlTransaction = new sql.Transaction(pool);
    await sqlTransaction.begin();

    try {
      await new sql.Request(sqlTransaction)
        .input('userId', sql.NVarChar(64), String(tokenRow.userId))
        .input('tenantId', sql.NVarChar(64), String(tokenRow.tenantId))
        .input('passwordHash', sql.NVarChar(256), password.hash)
        .input('passwordSalt', sql.NVarChar(256), password.salt)
        .input('passwordIterations', sql.Int, password.iterations)
        .query(`
          UPDATE ${usersTable}
          SET [passwordHash] = @passwordHash,
              [passwordSalt] = @passwordSalt,
              [passwordIterations] = @passwordIterations
          WHERE [id] = @userId AND [tenantId] = @tenantId AND [isActive] = 1;
        `);

      await new sql.Request(sqlTransaction).input('token', sql.NVarChar(128), token).query(`
        UPDATE ${tokensTable}
        SET [usedAt] = SYSUTCDATETIME()
        WHERE [token] = @token;
      `);

      await sqlTransaction.commit();
      return { ok: true };
    } catch (error) {
      await sqlTransaction.rollback();
      throw error;
    }
  }

  async changePassword(tenantId: string, userId: string, payload: ChangePasswordRequest): Promise<{ ok: boolean }> {
    const pool = await getMssqlPool();
    const usersTable = getUsersTableName();

    const userResult = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('userId', sql.NVarChar(64), userId)
      .query(`
        SELECT TOP 1 [id], [tenantId], [passwordHash], [passwordSalt], [passwordIterations], [isActive]
        FROM ${usersTable}
        WHERE [tenantId] = @tenantId AND [id] = @userId
      `);

    const userRow = userResult.recordset?.[0] as Record<string, unknown> | undefined;
    if (!userRow) {
      return { ok: false };
    }

    if (userRow.isActive === 0 || userRow.isActive === false) {
      return { ok: false };
    }

    const ok = verifyPassword(payload.currentPassword, {
      hash: String(userRow.passwordHash),
      salt: String(userRow.passwordSalt),
      iterations: Number(userRow.passwordIterations),
    });

    if (!ok) {
      return { ok: false };
    }

    const password = hashPassword(payload.newPassword);
    await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('userId', sql.NVarChar(64), userId)
      .input('passwordHash', sql.NVarChar(256), password.hash)
      .input('passwordSalt', sql.NVarChar(256), password.salt)
      .input('passwordIterations', sql.Int, password.iterations)
      .query(`
        UPDATE ${usersTable}
        SET [passwordHash] = @passwordHash,
            [passwordSalt] = @passwordSalt,
            [passwordIterations] = @passwordIterations
        WHERE [tenantId] = @tenantId AND [id] = @userId AND [isActive] = 1;
      `);

    return { ok: true };
  }
}
