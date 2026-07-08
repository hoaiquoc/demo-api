import { randomUUID } from 'node:crypto';
import { ISpendingAlertRepository } from '../interfaces/spending-alert-repository';
import { getMssqlPool, sql } from '../db/mssql';
import { getSpendingAlertsTableName } from '../db/schema';
import { SpendingAlert } from '../models/spending-alert';

export class MsSqlSpendingAlertRepository implements ISpendingAlertRepository {
  private async ensureCategoryColumn(pool: sql.ConnectionPool, table: string): Promise<void> {
    await pool.request().query(`
      IF COL_LENGTH('${table}', 'categoryId') IS NULL
      BEGIN
        ALTER TABLE ${table} ADD [categoryId] NVARCHAR(64) NULL
      END
    `);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'IX_SpendingAlerts_Tenant_Category'
          AND object_id = OBJECT_ID(N'${table}')
      )
      BEGIN
        CREATE INDEX IX_SpendingAlerts_Tenant_Category ON ${table} ([tenantId], [categoryId])
      END
    `);
  }

  async getAll(tenantId: string): Promise<SpendingAlert[]> {
    const pool = await getMssqlPool();
    const table = getSpendingAlertsTableName();
    await this.ensureCategoryColumn(pool, table);

    const result = await pool.request().input('tenantId', sql.NVarChar(64), tenantId).query(`
      SELECT [id], [tenantId], [period], [categoryId], [thresholdAmount]
      FROM ${table}
      WHERE [tenantId] = @tenantId
      ORDER BY [categoryId] ASC, [period] ASC
    `);

    const rows = result.recordset as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenantId),
      period: 'month',
      categoryId: row.categoryId ? String(row.categoryId) : null,
      thresholdAmount: Number(row.thresholdAmount),
    }));
  }

  async upsert(tenantId: string, categoryId: string | null, thresholdAmount: number, period: 'month' = 'month'): Promise<SpendingAlert> {
    const pool = await getMssqlPool();
    const table = getSpendingAlertsTableName();
    const id = randomUUID();
    const normalizedCategoryId = categoryId?.trim() ? categoryId.trim() : null;
    const normalizedPeriod: 'month' = period === 'month' ? 'month' : 'month';
    await this.ensureCategoryColumn(pool, table);

    await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('period', sql.NVarChar(16), normalizedPeriod)
      .input('categoryId', sql.NVarChar(64), normalizedCategoryId)
      .input('thresholdAmount', sql.BigInt, Math.max(0, Math.round(thresholdAmount)))
      .input('id', sql.NVarChar(64), id)
      .query(`
        MERGE ${table} AS target
        USING (SELECT @tenantId AS tenantId, @period AS period, @categoryId AS categoryId) AS source
        ON target.tenantId = source.tenantId
           AND target.period = source.period
           AND (
             (target.categoryId IS NULL AND source.categoryId IS NULL)
             OR target.categoryId = source.categoryId
           )
        WHEN MATCHED THEN
          UPDATE SET [thresholdAmount] = @thresholdAmount, [updatedAt] = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT ([id], [tenantId], [period], [categoryId], [thresholdAmount])
          VALUES (@id, @tenantId, @period, @categoryId, @thresholdAmount);
      `);

    const lookup = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('period', sql.NVarChar(16), normalizedPeriod)
      .input('categoryId', sql.NVarChar(64), normalizedCategoryId)
      .query(`
        SELECT TOP 1 [id], [tenantId], [period], [categoryId], [thresholdAmount]
        FROM ${table}
        WHERE [tenantId] = @tenantId
          AND [period] = @period
          AND (
            (@categoryId IS NULL AND [categoryId] IS NULL)
            OR [categoryId] = @categoryId
          )
      `);

    const row = lookup.recordset?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      return { id, tenantId, period: 'month', categoryId: normalizedCategoryId, thresholdAmount: Math.max(0, Math.round(thresholdAmount)) };
    }

    return {
      id: String(row.id),
      tenantId: String(row.tenantId),
      period: 'month',
      categoryId: row.categoryId ? String(row.categoryId) : null,
      thresholdAmount: Number(row.thresholdAmount),
    };
  }
}

