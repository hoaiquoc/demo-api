import { randomUUID } from 'node:crypto';
import { ISpendingAlertRepository } from '../interfaces/spending-alert-repository';
import { getMssqlPool, sql } from '../db/mssql';
import { getSpendingAlertsTableName } from '../db/schema';
import { SpendingAlert, SpendingAlertPeriod } from '../models/spending-alert';

export class MsSqlSpendingAlertRepository implements ISpendingAlertRepository {
  async getAll(tenantId: string): Promise<SpendingAlert[]> {
    const pool = await getMssqlPool();
    const table = getSpendingAlertsTableName();

    const result = await pool.request().input('tenantId', sql.NVarChar(64), tenantId).query(`
      SELECT [id], [tenantId], [period], [thresholdAmount]
      FROM ${table}
      WHERE [tenantId] = @tenantId
      ORDER BY [period] ASC
    `);

    const rows = result.recordset as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenantId),
      period: row.period === 'day' || row.period === 'week' || row.period === 'month' ? (row.period as SpendingAlertPeriod) : 'month',
      thresholdAmount: Number(row.thresholdAmount),
    }));
  }

  async upsert(tenantId: string, period: SpendingAlertPeriod, thresholdAmount: number): Promise<SpendingAlert> {
    const pool = await getMssqlPool();
    const table = getSpendingAlertsTableName();
    const id = randomUUID();

    await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('period', sql.NVarChar(16), period)
      .input('thresholdAmount', sql.BigInt, Math.max(0, Math.round(thresholdAmount)))
      .input('id', sql.NVarChar(64), id)
      .query(`
        MERGE ${table} AS target
        USING (SELECT @tenantId AS tenantId, @period AS period) AS source
        ON target.tenantId = source.tenantId AND target.period = source.period
        WHEN MATCHED THEN
          UPDATE SET [thresholdAmount] = @thresholdAmount, [updatedAt] = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT ([id], [tenantId], [period], [thresholdAmount])
          VALUES (@id, @tenantId, @period, @thresholdAmount);
      `);

    const lookup = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('period', sql.NVarChar(16), period)
      .query(`
        SELECT TOP 1 [id], [tenantId], [period], [thresholdAmount]
        FROM ${table}
        WHERE [tenantId] = @tenantId AND [period] = @period
      `);

    const row = lookup.recordset?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      return { id, tenantId, period, thresholdAmount: Math.max(0, Math.round(thresholdAmount)) };
    }

    return {
      id: String(row.id),
      tenantId: String(row.tenantId),
      period: row.period === 'day' || row.period === 'week' || row.period === 'month' ? (row.period as SpendingAlertPeriod) : 'month',
      thresholdAmount: Number(row.thresholdAmount),
    };
  }
}

