import type { RequestHandler } from 'express';
import { getMssqlPool, sql } from '../db/mssql';
import { getSessionsTableName } from '../db/schema';

export const requireAuth: RequestHandler = async (request, response, next) => {
  const authorization = request.header('authorization') ?? '';
  const token = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';

  if (!token) {
    response.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const pool = await getMssqlPool();
    const table = getSessionsTableName();

    const result = await pool.request().input('token', sql.NVarChar(128), token).query(`
      SELECT TOP 1 [userId], [tenantId], [expiresAt]
      FROM ${table}
      WHERE [token] = @token
    `);

    const row = result.recordset?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      response.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const expiresAt = row.expiresAt instanceof Date ? row.expiresAt : new Date(String(row.expiresAt));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      response.status(401).json({ message: 'Unauthorized' });
      return;
    }

    response.locals.userId = String(row.userId);
    response.locals.tenantId = String(row.tenantId);
    next();
  } catch {
    response.status(500).json({ message: 'Internal server error' });
  }
};
