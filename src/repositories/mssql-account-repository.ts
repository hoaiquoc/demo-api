import { IAccountRepository } from '../interfaces/account-repository';
import { Account } from '../models/account';
import { getMssqlPool, sql } from '../db/mssql';
import { getAccountsTableName } from '../db/schema';

export class MsSqlAccountRepository implements IAccountRepository {
  async getAll(tenantId: string): Promise<Account[]> {
    const pool = await getMssqlPool();
    const table = getAccountsTableName();

    const result = await pool.request().input('tenantId', sql.NVarChar(64), tenantId).query(`
      SELECT [id], [name], [type], [initialBalance], [balance], [color], [assetCode], [assetQuantity], [assetUnit]
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
      balance: row.balance == null ? undefined : Number(row.balance),
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
      SELECT TOP 1 [id], [name], [type], [initialBalance], [balance], [color], [assetCode], [assetQuantity], [assetUnit]
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
      balance: row.balance == null ? undefined : Number(row.balance),
      color: String(row.color),
      assetCode: row.assetCode == null ? null : String(row.assetCode),
      assetQuantity: row.assetQuantity == null ? null : Number(row.assetQuantity),
      assetUnit: row.assetUnit == null ? null : String(row.assetUnit),
    };
  }

  async add(tenantId: string, account: Account): Promise<Account> {
    const pool = await getMssqlPool();
    const table = getAccountsTableName();
    const initialBalance = Math.round(account.initialBalance);
    const balance = account.balance == null ? initialBalance : Math.round(account.balance);

    await pool
      .request()
      .input('id', sql.NVarChar(64), account.id)
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('name', sql.NVarChar(128), account.name)
      .input('type', sql.NVarChar(64), account.type)
      .input('initialBalance', sql.BigInt, initialBalance)
      .input('balance', sql.BigInt, balance)
      .input('color', sql.NVarChar(32), account.color)
      .input('assetCode', sql.NVarChar(32), account.assetCode ?? null)
      .input('assetQuantity', sql.Decimal(18, 6), account.assetQuantity ?? null)
      .input('assetUnit', sql.NVarChar(16), account.assetUnit ?? null)
      .query(`
        INSERT INTO ${table} ([id], [tenantId], [name], [type], [initialBalance], [balance], [color], [assetCode], [assetQuantity], [assetUnit])
        VALUES (@id, @tenantId, @name, @type, @initialBalance, @balance, @color, @assetCode, @assetQuantity, @assetUnit)
      `);

    return {
      ...account,
      initialBalance,
      balance,
    };
  }

  async update(tenantId: string, id: string, account: Omit<Account, 'id'>): Promise<Account | undefined> {
    const pool = await getMssqlPool();
    const table = getAccountsTableName();
    const sqlTransaction = new sql.Transaction(pool);
    await sqlTransaction.begin();

    try {
      const existingResult = await new sql.Request(sqlTransaction)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('id', sql.NVarChar(64), id)
        .query(`
          SELECT TOP 1 [type], [initialBalance], [balance]
          FROM ${table} WITH (UPDLOCK, ROWLOCK)
          WHERE [tenantId] = @tenantId AND [id] = @id
        `);

      const existingRow = existingResult.recordset?.[0] as Record<string, unknown> | undefined;
      if (!existingRow) {
        await sqlTransaction.rollback();
        return undefined;
      }

      const previousType = existingRow.type == null ? '' : String(existingRow.type);
      const nextType = account.type;
      const previousInitial = Number(existingRow.initialBalance ?? 0);
      const previousBalance = Number(existingRow.balance ?? 0);
      const nextInitial = Math.round(account.initialBalance);

      const nextBalance =
        nextType === 'Tiết kiệm vàng'
          ? previousBalance
          : previousType !== 'Tiết kiệm vàng'
            ? Math.round(previousBalance + (nextInitial - previousInitial))
            : nextInitial;

      const result = await new sql.Request(sqlTransaction)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('id', sql.NVarChar(64), id)
        .input('name', sql.NVarChar(128), account.name)
        .input('type', sql.NVarChar(64), account.type)
        .input('initialBalance', sql.BigInt, nextInitial)
        .input('balance', sql.BigInt, nextBalance)
        .input('color', sql.NVarChar(32), account.color)
        .input('assetCode', sql.NVarChar(32), account.assetCode ?? null)
        .input('assetQuantity', sql.Decimal(18, 6), account.assetQuantity ?? null)
        .input('assetUnit', sql.NVarChar(16), account.assetUnit ?? null)
        .query(`
          UPDATE ${table}
          SET
            [name] = @name,
            [type] = @type,
            [initialBalance] = @initialBalance,
            [balance] = @balance,
            [color] = @color,
            [assetCode] = @assetCode,
            [assetQuantity] = @assetQuantity,
            [assetUnit] = @assetUnit
          WHERE [tenantId] = @tenantId AND [id] = @id;

          SELECT @@ROWCOUNT AS [affected];
        `);

      const affected = Number((result.recordset?.[0] as Record<string, unknown> | undefined)?.affected ?? 0);
      if (affected <= 0) {
        await sqlTransaction.rollback();
        return undefined;
      }

      await sqlTransaction.commit();

      return {
        id,
        ...account,
        initialBalance: nextInitial,
        balance: nextBalance,
      };
    } catch (error) {
      await sqlTransaction.rollback();
      throw error;
    }
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const pool = await getMssqlPool();
    const table = getAccountsTableName();

    const accountRow = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('id', sql.NVarChar(64), id)
      .query(`
        SELECT TOP 1 [balance], [assetQuantity]
        FROM ${table}
        WHERE [tenantId] = @tenantId AND [id] = @id
      `);

    const row = accountRow.recordset?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      return false;
    }

    const balanceValue = Number(row.balance ?? NaN);
    if (!Number.isFinite(balanceValue)) {
      return false;
    }

    const assetQuantityValue = Number(row.assetQuantity ?? 0);
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
