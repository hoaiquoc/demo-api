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

    await pool.request().query(`
      IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'UX_SpendingAlerts_Tenant_Period'
          AND object_id = OBJECT_ID(N'${table}')
      )
      BEGIN
        DROP INDEX UX_SpendingAlerts_Tenant_Period ON ${table}
      END
    `);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'UX_SpendingAlerts_Tenant_Period_Category'
          AND object_id = OBJECT_ID(N'${table}')
      )
      BEGIN
        CREATE UNIQUE INDEX UX_SpendingAlerts_Tenant_Period_Category ON ${table} ([tenantId], [period], [categoryId])
          WHERE [categoryId] IS NOT NULL
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

    const existingLookup = await pool
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

    const existingRow = existingLookup.recordset?.[0] as Record<string, unknown> | undefined;

    if (existingRow) {
      await pool
        .request()
        .input('id', sql.NVarChar(64), String(existingRow.id))
        .input('thresholdAmount', sql.BigInt, Math.max(0, Math.round(thresholdAmount)))
        .query(`
          UPDATE ${table}
          SET [thresholdAmount] = @thresholdAmount,
              [updatedAt] = SYSUTCDATETIME()
          WHERE [id] = @id
        `);

      return {
        id: String(existingRow.id),
        tenantId,
        period: 'month',
        categoryId: normalizedCategoryId,
        thresholdAmount: Math.max(0, Math.round(thresholdAmount)),
      };
    }

    await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('period', sql.NVarChar(16), normalizedPeriod)
      .input('categoryId', sql.NVarChar(64), normalizedCategoryId)
      .input('thresholdAmount', sql.BigInt, Math.max(0, Math.round(thresholdAmount)))
      .input('id', sql.NVarChar(64), id)
      .query(`
        INSERT INTO ${table} ([id], [tenantId], [period], [categoryId], [thresholdAmount])
        VALUES (@id, @tenantId, @period, @categoryId, @thresholdAmount)
      `);

    return {
      id,
      tenantId,
      period: 'month',
      categoryId: normalizedCategoryId,
      thresholdAmount: Math.max(0, Math.round(thresholdAmount)),
    };
  }
}

