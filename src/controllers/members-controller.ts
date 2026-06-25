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

  private async getMember(pool: sql.ConnectionPool, tenantId: string, id: string): Promise<{ id: string; role: UserRole; isActive: boolean } | null> {
    const usersTable = getUsersTableName();
    const result = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('id', sql.NVarChar(64), id)
      .query(`
        SELECT TOP 1 [id], [role], [isActive]
        FROM ${usersTable}
        WHERE [tenantId] = @tenantId AND [id] = @id
      `);

    const row = result.recordset?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    const role = row.role === 'Owner' || row.role === 'Editor' || row.role === 'Viewer' ? (row.role as UserRole) : 'Viewer';
    const isActive = row.isActive === 1 || row.isActive === true;
    return { id: String(row.id), role, isActive };
  }

  private async countActiveOwners(pool: sql.ConnectionPool, tenantId: string): Promise<number> {
    const usersTable = getUsersTableName();
    const result = await pool.request().input('tenantId', sql.NVarChar(64), tenantId).query(`
      SELECT COUNT(1) AS [count]
      FROM ${usersTable}
      WHERE [tenantId] = @tenantId AND [role] = 'Owner' AND [isActive] = 1
    `);

    const count = Number((result.recordset?.[0] as Record<string, unknown> | undefined)?.count ?? 0);
    return Number.isFinite(count) ? count : 0;
  }

  getAll = async (_request: Request, response: Response): Promise<void> => {
    const tenantId = this.getTenantId(response);

    try {
      const pool = await getMssqlPool();
      const usersTable = getUsersTableName();

      const result = await pool.request().input('tenantId', sql.NVarChar(64), tenantId).query(`
        SELECT [id], [tenantId], [email], [fullName], [role], [avatar], [spaces]
        FROM ${usersTable}
        WHERE [tenantId] = @tenantId AND [isActive] = 1
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
        .input('isActive', sql.Bit, true)
        .input('passwordHash', sql.NVarChar(256), password.hash)
        .input('passwordSalt', sql.NVarChar(256), password.salt)
        .input('passwordIterations', sql.Int, password.iterations)
        .query(`
          INSERT INTO ${usersTable} (
            [id], [tenantId], [email], [fullName], [role], [avatar], [spaces], [isActive],
            [passwordHash], [passwordSalt], [passwordIterations]
          )
          VALUES (
            @id, @tenantId, @email, @fullName, @role, @avatar, @spaces, @isActive,
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

  updateRole = async (request: Request, response: Response): Promise<void> => {
    const tenantId = this.getTenantId(response);
    const userId = this.getUserId(response);
    const targetId = String(request.params.id ?? '').trim();
    const payload = request.body as { role?: string };
    const nextRole: UserRole | null = payload?.role === 'Owner' || payload?.role === 'Editor' || payload?.role === 'Viewer' ? payload.role : null;

    if (!targetId) {
      response.status(400).json({ message: 'id là bắt buộc' });
      return;
    }

    if (!nextRole) {
      response.status(400).json({ message: 'role không hợp lệ' });
      return;
    }

    if (targetId === userId) {
      response.status(400).json({ message: 'Không thể tự đổi quyền' });
      return;
    }

    try {
      const pool = await getMssqlPool();
      const usersTable = getUsersTableName();

      const currentRole = await this.getCurrentUserRole(pool, tenantId, userId);
      if (!currentRole || currentRole === 'Viewer') {
        response.status(403).json({ message: 'Bạn không có quyền cập nhật quyền thành viên' });
        return;
      }

      const target = await this.getMember(pool, tenantId, targetId);
      if (!target || !target.isActive) {
        response.status(404).json({ message: 'Không tìm thấy thành viên' });
        return;
      }

      if (target.role === 'Owner' && currentRole !== 'Owner') {
        response.status(403).json({ message: 'Chỉ Owner mới được cập nhật quyền của Owner' });
        return;
      }

      if (nextRole === 'Owner' && currentRole !== 'Owner') {
        response.status(403).json({ message: 'Chỉ Owner mới được cấp quyền Owner' });
        return;
      }

      if (target.role === 'Owner' && nextRole !== 'Owner') {
        const owners = await this.countActiveOwners(pool, tenantId);
        if (owners <= 1) {
          response.status(400).json({ message: 'Không thể hạ quyền Owner cuối cùng' });
          return;
        }
      }

      const result = await pool
        .request()
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('id', sql.NVarChar(64), targetId)
        .input('role', sql.NVarChar(16), nextRole)
        .query(`
          UPDATE ${usersTable}
          SET [role] = @role
          WHERE [tenantId] = @tenantId AND [id] = @id AND [isActive] = 1;

          SELECT @@ROWCOUNT AS [affected];
        `);

      const affected = Number((result.recordset?.[0] as Record<string, unknown> | undefined)?.affected ?? 0);
      if (affected <= 0) {
        response.status(404).json({ message: 'Không tìm thấy thành viên' });
        return;
      }

      response.json({ ok: true });
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  resetPassword = async (request: Request, response: Response): Promise<void> => {
    const tenantId = this.getTenantId(response);
    const userId = this.getUserId(response);
    const targetId = String(request.params.id ?? '').trim();
    const payload = request.body as { password?: string };
    const passwordRaw = payload?.password ?? '';

    if (!targetId) {
      response.status(400).json({ message: 'id là bắt buộc' });
      return;
    }

    if (!passwordRaw || String(passwordRaw).trim().length < 6) {
      response.status(400).json({ message: 'Mật khẩu phải tối thiểu 6 ký tự' });
      return;
    }

    if (targetId === userId) {
      response.status(400).json({ message: 'Không thể reset mật khẩu của chính mình tại đây' });
      return;
    }

    try {
      const pool = await getMssqlPool();
      const usersTable = getUsersTableName();

      const currentRole = await this.getCurrentUserRole(pool, tenantId, userId);
      if (!currentRole || currentRole === 'Viewer') {
        response.status(403).json({ message: 'Bạn không có quyền reset mật khẩu' });
        return;
      }

      const target = await this.getMember(pool, tenantId, targetId);
      if (!target || !target.isActive) {
        response.status(404).json({ message: 'Không tìm thấy thành viên' });
        return;
      }

      if (target.role === 'Owner' && currentRole !== 'Owner') {
        response.status(403).json({ message: 'Chỉ Owner mới được reset mật khẩu của Owner' });
        return;
      }

      const password = hashPassword(passwordRaw);
      const result = await pool
        .request()
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('id', sql.NVarChar(64), targetId)
        .input('passwordHash', sql.NVarChar(256), password.hash)
        .input('passwordSalt', sql.NVarChar(256), password.salt)
        .input('passwordIterations', sql.Int, password.iterations)
        .query(`
          UPDATE ${usersTable}
          SET [passwordHash] = @passwordHash,
              [passwordSalt] = @passwordSalt,
              [passwordIterations] = @passwordIterations
          WHERE [tenantId] = @tenantId AND [id] = @id AND [isActive] = 1;

          SELECT @@ROWCOUNT AS [affected];
        `);

      const affected = Number((result.recordset?.[0] as Record<string, unknown> | undefined)?.affected ?? 0);
      if (affected <= 0) {
        response.status(404).json({ message: 'Không tìm thấy thành viên' });
        return;
      }

      response.json({ ok: true });
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  deactivate = async (request: Request, response: Response): Promise<void> => {
    const tenantId = this.getTenantId(response);
    const userId = this.getUserId(response);
    const targetId = String(request.params.id ?? '').trim();

    if (!targetId) {
      response.status(400).json({ message: 'id là bắt buộc' });
      return;
    }

    if (targetId === userId) {
      response.status(400).json({ message: 'Không thể tự xoá' });
      return;
    }

    try {
      const pool = await getMssqlPool();
      const usersTable = getUsersTableName();

      const currentRole = await this.getCurrentUserRole(pool, tenantId, userId);
      if (currentRole !== 'Owner') {
        response.status(403).json({ message: 'Chỉ Owner mới được xoá thành viên' });
        return;
      }

      const target = await this.getMember(pool, tenantId, targetId);
      if (!target || !target.isActive) {
        response.status(404).json({ message: 'Không tìm thấy thành viên' });
        return;
      }

      if (target.role === 'Owner') {
        const owners = await this.countActiveOwners(pool, tenantId);
        if (owners <= 1) {
          response.status(400).json({ message: 'Không thể xoá Owner cuối cùng' });
          return;
        }
      }

      const result = await pool
        .request()
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('id', sql.NVarChar(64), targetId)
        .query(`
          UPDATE ${usersTable}
          SET [isActive] = 0
          WHERE [tenantId] = @tenantId AND [id] = @id AND [isActive] = 1;

          SELECT @@ROWCOUNT AS [affected];
        `);

      const affected = Number((result.recordset?.[0] as Record<string, unknown> | undefined)?.affected ?? 0);
      if (affected <= 0) {
        response.status(404).json({ message: 'Không tìm thấy thành viên' });
        return;
      }

      response.json({ ok: true });
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };
}
