import type { RequestHandler } from 'express';
import { getMssqlPool, sql } from '../db/mssql';
import { getSessionsTableName } from '../db/schema';

type SessionCacheEntry = {
  userId: string;
  tenantId: string;
  expiresAtMs: number;
  cachedAtMs: number;
};

const AUTH_CACHE_TTL_MS = 60_000;
const sessionCache = new Map<string, SessionCacheEntry>();

export const requireAuth: RequestHandler = async (request, response, next) => {
  const authorization = request.header('authorization') ?? '';
  const token = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';

  if (!token) {
    response.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const cached = sessionCache.get(token);
    if (cached) {
      const now = Date.now();
      const cacheExpiresAt = Math.min(cached.expiresAtMs, cached.cachedAtMs + AUTH_CACHE_TTL_MS);
      if (now < cacheExpiresAt) {
        response.locals.userId = cached.userId;
        response.locals.tenantId = cached.tenantId;
        next();
        return;
      }
      sessionCache.delete(token);
    }

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

    const userId = String(row.userId);
    const tenantId = String(row.tenantId);
    sessionCache.set(token, { userId, tenantId, expiresAtMs: expiresAt.getTime(), cachedAtMs: Date.now() });

    response.locals.userId = userId;
    response.locals.tenantId = tenantId;
    next();
  } catch {
    response.status(500).json({ message: 'Internal server error' });
  }
};
