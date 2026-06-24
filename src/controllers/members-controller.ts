import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { getMssqlPool, sql } from '../db/mssql';
import { getUsersTableName } from '../db/schema';
import { hashPassword } from '../utils/password';
import { UserRole } from '../models/user';

type MemberPublic = {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatar: string;
  spaces: number;
};

export class MembersController {
  private getTenantId(response: Response): string {
    return String((response.locals as Record<string, unknown>).tenantId ?? '');
  }

  private getUserId(response: Response): string {
    return String((response.locals as Record<string, unknown>).userId ?? '');
  }

  private async getCurrentUserRole(pool: sql.ConnectionPool, tenantId: string, userId: string): Promise<UserRole | null> {
    const usersTable = getUsersTableName();
    const result = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('userId', sql.NVarChar(64), userId)
      .query(`
        SELECT TOP 1 [role]
        FROM ${usersTable}
        WHERE [tenantId] = @tenantId AND [id] = @userId
      `);

    const role = (result.recordset?.[0] as Record<string, unknown> | undefined)?.role;
    if (role === 'Owner' || role === 'Editor' || role === 'Viewer') {
      return role;
    }

    return null;
  }

  getAll = async (_request: Request, response: Response): Promise<void> => {
    const tenantId = this.getTenantId(response);

    try {
      const pool = await getMssqlPool();
      const usersTable = getUsersTableName();

      const result = await pool.request().input('tenantId', sql.NVarChar(64), tenantId).query(`
        SELECT [id], [tenantId], [email], [fullName], [role], [avatar], [spaces]
        FROM ${usersTable}
        WHERE [tenantId] = @tenantId
        ORDER BY [fullName] ASC, [email] ASC
      `);

      const rows = result.recordset as Array<Record<string, unknown>>;
      const items: MemberPublic[] = rows.map((row) => ({
        id: String(row.id),
        tenantId: String(row.tenantId),
        email: String(row.email),
        fullName: String(row.fullName),
        role: row.role === 'Owner' || row.role === 'Editor' || row.role === 'Viewer' ? row.role : 'Viewer',
        avatar: String(row.avatar),
        spaces: Number(row.spaces ?? 1),
      }));

      response.json(items);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  create = async (request: Request, response: Response): Promise<void> => {
    const tenantId = this.getTenantId(response);
    const userId = this.getUserId(response);
    const payload = request.body as { email?: string; fullName?: string; password?: string; role?: string };

    const email = payload?.email?.trim() ?? '';
    const fullName = payload?.fullName?.trim() ?? '';
    const passwordRaw = payload?.password ?? '';
    const role: UserRole = payload?.role === 'Editor' || payload?.role === 'Viewer' ? payload.role : 'Viewer';

    if (!email || !fullName || !passwordRaw) {
      response.status(400).json({ message: 'email, fullName và password là bắt buộc' });
      return;
    }

    try {
      const pool = await getMssqlPool();
      const usersTable = getUsersTableName();

      const currentRole = await this.getCurrentUserRole(pool, tenantId, userId);
      if (currentRole === 'Viewer' || !currentRole) {
        response.status(403).json({ message: 'Bạn không có quyền tạo thành viên' });
        return;
      }

      const existing = await pool.request().input('email', sql.NVarChar(256), email).query(`
        SELECT TOP 1 [id]
        FROM ${usersTable}
        WHERE LOWER([email]) = LOWER(@email)
      `);

      if (existing.recordset?.[0]) {
        response.status(409).json({ message: 'Email đã tồn tại' });
        return;
      }

      const password = hashPassword(passwordRaw);
      const id = randomUUID();
      const avatarSource = fullName || email;
      const avatar = avatarSource.replace(/\s+/g, ' ').trim().slice(0, 2).toUpperCase() || 'MB';

      await pool
        .request()
        .input('id', sql.NVarChar(64), id)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('email', sql.NVarChar(256), email)
        .input('fullName', sql.NVarChar(128), fullName)
        .input('role', sql.NVarChar(16), role)
        .input('avatar', sql.NVarChar(8), avatar)
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

      const created: MemberPublic = {
        id,
        tenantId,
        email,
        fullName,
        role,
        avatar,
        spaces: 1,
      };

      response.status(201).json(created);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };
}
