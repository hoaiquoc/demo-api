import { randomUUID } from 'node:crypto';
import { IBudgetRepository } from '../interfaces/budget-repository';
import { getMssqlPool, sql } from '../db/mssql';
import { getBudgetsTableName } from '../db/schema';
import { Budget, BudgetScopeType } from '../models/budget';

export class MsSqlBudgetRepository implements IBudgetRepository {
  async getByMonth(tenantId: string, month: string): Promise<Budget[]> {
    const pool = await getMssqlPool();
    const table = getBudgetsTableName();

    const result = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('month', sql.NVarChar(7), month)
      .query(`
        SELECT [id], [tenantId], [month], [scopeType], [scopeId], [amount]
        FROM ${table}
        WHERE [tenantId] = @tenantId AND [month] = @month
        ORDER BY [scopeType] ASC, [scopeId] ASC
      `);

    const rows = result.recordset as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenantId),
      month: String(row.month),
      scopeType: row.scopeType === 'category' ? 'category' : ('account' as BudgetScopeType),
      scopeId: String(row.scopeId),
      amount: Number(row.amount),
    }));
  }

  async upsert(tenantId: string, month: string, scopeType: BudgetScopeType, scopeId: string, amount: number): Promise<Budget | null> {
    const pool = await getMssqlPool();
    const table = getBudgetsTableName();

    const normalizedAmount = Math.max(0, Math.round(amount));
    const normalizedScopeId = scopeId.trim() || 'all';

    if (normalizedAmount <= 0) {
      await pool
        .request()
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('month', sql.NVarChar(7), month)
        .input('scopeType', sql.NVarChar(16), scopeType)
        .input('scopeId', sql.NVarChar(64), normalizedScopeId)
        .query(`
          DELETE FROM ${table}
          WHERE [tenantId] = @tenantId AND [month] = @month AND [scopeType] = @scopeType AND [scopeId] = @scopeId
        `);
      return null;
    }

    const id = randomUUID();
    await pool
      .request()
      .input('id', sql.NVarChar(64), id)
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('month', sql.NVarChar(7), month)
      .input('scopeType', sql.NVarChar(16), scopeType)
      .input('scopeId', sql.NVarChar(64), normalizedScopeId)
      .input('amount', sql.BigInt, normalizedAmount)
      .query(`
        MERGE ${table} AS target
        USING (SELECT @tenantId AS tenantId, @month AS month, @scopeType AS scopeType, @scopeId AS scopeId) AS source
        ON target.tenantId = source.tenantId
           AND target.month = source.month
           AND target.scopeType = source.scopeType
           AND target.scopeId = source.scopeId
        WHEN MATCHED THEN
          UPDATE SET [amount] = @amount, [updatedAt] = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT ([id], [tenantId], [month], [scopeType], [scopeId], [amount])
          VALUES (@id, @tenantId, @month, @scopeType, @scopeId, @amount);
      `);

    const lookup = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('month', sql.NVarChar(7), month)
      .input('scopeType', sql.NVarChar(16), scopeType)
      .input('scopeId', sql.NVarChar(64), normalizedScopeId)
      .query(`
        SELECT TOP 1 [id], [tenantId], [month], [scopeType], [scopeId], [amount]
        FROM ${table}
        WHERE [tenantId] = @tenantId AND [month] = @month AND [scopeType] = @scopeType AND [scopeId] = @scopeId
      `);

    const row = lookup.recordset?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      return { id, tenantId, month, scopeType, scopeId: normalizedScopeId, amount: normalizedAmount };
    }

    return {
      id: String(row.id),
      tenantId: String(row.tenantId),
      month: String(row.month),
      scopeType: row.scopeType === 'category' ? 'category' : ('account' as BudgetScopeType),
      scopeId: String(row.scopeId),
      amount: Number(row.amount),
    };
  }
}

