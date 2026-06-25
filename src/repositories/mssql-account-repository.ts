import { IAccountRepository } from '../interfaces/account-repository';
import { Account } from '../models/account';
import { getMssqlPool, sql } from '../db/mssql';
import { getAccountsTableName, getTransactionsTableName } from '../db/schema';

export class MsSqlAccountRepository implements IAccountRepository {
  async getAll(tenantId: string): Promise<Account[]> {
    const pool = await getMssqlPool();
    const table = getAccountsTableName();

    const result = await pool.request().input('tenantId', sql.NVarChar(64), tenantId).query(`
      SELECT [id], [name], [type], [initialBalance], [color], [assetCode], [assetQuantity], [assetUnit]
      FROM ${table}
      WHERE [tenantId] = @tenantId
      ORDER BY [name] ASC
    `);

    const rows = result.recordset as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      type: String(row.type),
      initialBalance: Number(row.initialBalance),
      color: String(row.color),
      assetCode: row.assetCode == null ? null : String(row.assetCode),
      assetQuantity: row.assetQuantity == null ? null : Number(row.assetQuantity),
      assetUnit: row.assetUnit == null ? null : String(row.assetUnit),
    }));
  }

  async getById(tenantId: string, id: string): Promise<Account | undefined> {
    const pool = await getMssqlPool();
    const table = getAccountsTableName();

    const result = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('id', sql.NVarChar(64), id)
      .query(`
      SELECT TOP 1 [id], [name], [type], [initialBalance], [color], [assetCode], [assetQuantity], [assetUnit]
      FROM ${table}
      WHERE [tenantId] = @tenantId AND [id] = @id
    `);

    const row = result.recordset?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      return undefined;
    }

    return {
      id: String(row.id),
      name: String(row.name),
      type: String(row.type),
      initialBalance: Number(row.initialBalance),
      color: String(row.color),
      assetCode: row.assetCode == null ? null : String(row.assetCode),
      assetQuantity: row.assetQuantity == null ? null : Number(row.assetQuantity),
      assetUnit: row.assetUnit == null ? null : String(row.assetUnit),
    };
  }

  async add(tenantId: string, account: Account): Promise<Account> {
    const pool = await getMssqlPool();
    const table = getAccountsTableName();

    await pool
      .request()
      .input('id', sql.NVarChar(64), account.id)
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('name', sql.NVarChar(128), account.name)
      .input('type', sql.NVarChar(64), account.type)
      .input('initialBalance', sql.BigInt, Math.round(account.initialBalance))
      .input('color', sql.NVarChar(32), account.color)
      .input('assetCode', sql.NVarChar(32), account.assetCode ?? null)
      .input('assetQuantity', sql.Decimal(18, 6), account.assetQuantity ?? null)
      .input('assetUnit', sql.NVarChar(16), account.assetUnit ?? null)
      .query(`
        INSERT INTO ${table} ([id], [tenantId], [name], [type], [initialBalance], [color], [assetCode], [assetQuantity], [assetUnit])
        VALUES (@id, @tenantId, @name, @type, @initialBalance, @color, @assetCode, @assetQuantity, @assetUnit)
      `);

    return account;
  }

  async update(tenantId: string, id: string, account: Omit<Account, 'id'>): Promise<Account | undefined> {
    const pool = await getMssqlPool();
    const table = getAccountsTableName();

    const result = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('id', sql.NVarChar(64), id)
      .input('name', sql.NVarChar(128), account.name)
      .input('type', sql.NVarChar(64), account.type)
      .input('initialBalance', sql.BigInt, Math.round(account.initialBalance))
      .input('color', sql.NVarChar(32), account.color)
      .input('assetCode', sql.NVarChar(32), account.assetCode ?? null)
      .input('assetQuantity', sql.Decimal(18, 6), account.assetQuantity ?? null)
      .input('assetUnit', sql.NVarChar(16), account.assetUnit ?? null)
      .query(`
        UPDATE ${table}
        SET [name] = @name, [type] = @type, [initialBalance] = @initialBalance, [color] = @color, [assetCode] = @assetCode, [assetQuantity] = @assetQuantity, [assetUnit] = @assetUnit
        WHERE [tenantId] = @tenantId AND [id] = @id;

        SELECT @@ROWCOUNT AS [affected];
      `);

    const affected = Number((result.recordset?.[0] as Record<string, unknown> | undefined)?.affected ?? 0);
    if (affected <= 0) {
      return undefined;
    }

    return {
      id,
      ...account,
    };
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const pool = await getMssqlPool();
    const table = getAccountsTableName();
    const transactionsTable = getTransactionsTableName();

    const balanceResult = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('id', sql.NVarChar(64), id)
      .query(`
      SELECT
        a.[id] AS [id],
        CAST(a.[initialBalance] AS BIGINT)
        + ISNULL(SUM(CASE WHEN t.[type] = 'Income' THEN CAST(t.[amount] AS BIGINT) ELSE -CAST(t.[amount] AS BIGINT) END), 0) AS [balance]
      FROM ${table} a
      LEFT JOIN ${transactionsTable} t ON t.[tenantId] = a.[tenantId] AND t.[accountId] = a.[id]
      WHERE a.[tenantId] = @tenantId AND a.[id] = @id
      GROUP BY a.[id], a.[initialBalance]
    `);

    const row = balanceResult.recordset?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      return false;
    }

    const balanceValue = Number(row.balance ?? NaN);
    if (!Number.isFinite(balanceValue)) {
      return false;
    }

    const accountRow = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('id', sql.NVarChar(64), id)
      .query(`
        SELECT TOP 1 [assetQuantity]
        FROM ${table}
        WHERE [tenantId] = @tenantId AND [id] = @id
      `);

    const assetQuantityValue = Number((accountRow.recordset?.[0] as Record<string, unknown> | undefined)?.assetQuantity ?? 0);
    const hasAssetQuantity = Number.isFinite(assetQuantityValue) && assetQuantityValue !== 0;

    if (balanceValue !== 0 || hasAssetQuantity) {
      throw new Error('ACCOUNT_BALANCE_NOT_ZERO');
    }

    const result = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('id', sql.NVarChar(64), id)
      .query(`
      DELETE FROM ${table}
      WHERE [tenantId] = @tenantId AND [id] = @id;

      SELECT @@ROWCOUNT AS [affected];
    `);

    const affected = Number((result.recordset?.[0] as Record<string, unknown> | undefined)?.affected ?? 0);
    return affected > 0;
  }
}
