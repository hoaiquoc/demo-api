import { randomUUID } from 'node:crypto';
import { ITransactionRepository } from '../interfaces/transaction-repository';
import { TransactionItem } from '../models/transaction-item';
import { getMssqlPool, sql } from '../db/mssql';
import { getTransactionsTableName } from '../db/schema';

export class MsSqlTransactionRepository implements ITransactionRepository {
  async getAll(tenantId: string): Promise<TransactionItem[]> {
    const pool = await getMssqlPool();
    const table = getTransactionsTableName();

    const result = await pool.request().input('tenantId', sql.NVarChar(64), tenantId).query(`
      SELECT
        [id],
        [title],
        [accountId],
        [categoryId],
        [amount],
        [type],
        [occurredAt],
        [status],
        [note],
        [createdBy],
        [adjustmentOfId],
        [adjustedById]
      FROM ${table}
      WHERE [tenantId] = @tenantId
      ORDER BY [occurredAt] DESC
    `);

    const rows = result.recordset as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      accountId: String(row.accountId),
      categoryId: String(row.categoryId),
      amount: Number(row.amount),
      type: row.type === 'Income' ? 'Income' : 'Expense',
      occurredAt: row.occurredAt instanceof Date ? row.occurredAt.toISOString() : String(row.occurredAt),
      status: row.status === 'Draft' || row.status === 'Pending' || row.status === 'Completed' ? row.status : 'Completed',
      note: row.note == null ? '' : String(row.note),
      createdBy: String(row.createdBy),
      adjustmentOfId: row.adjustmentOfId == null ? undefined : String(row.adjustmentOfId),
      adjustedById: row.adjustedById == null ? undefined : String(row.adjustedById),
    }));
  }

  async getById(tenantId: string, id: string): Promise<TransactionItem | undefined> {
    const pool = await getMssqlPool();
    const table = getTransactionsTableName();

    const result = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('id', sql.NVarChar(64), id)
      .query(`
      SELECT TOP 1
        [id],
        [title],
        [accountId],
        [categoryId],
        [amount],
        [type],
        [occurredAt],
        [status],
        [note],
        [createdBy],
        [adjustmentOfId],
        [adjustedById]
      FROM ${table}
      WHERE [tenantId] = @tenantId AND [id] = @id
    `);

    const row = result.recordset[0];
    if (!row) {
      return undefined;
    }

    return {
      id: String(row.id),
      title: String(row.title),
      accountId: String(row.accountId),
      categoryId: String(row.categoryId),
      amount: Number(row.amount),
      type: row.type === 'Income' ? 'Income' : 'Expense',
      occurredAt: row.occurredAt instanceof Date ? row.occurredAt.toISOString() : String(row.occurredAt),
      status: row.status === 'Draft' || row.status === 'Pending' || row.status === 'Completed' ? row.status : 'Completed',
      note: row.note == null ? '' : String(row.note),
      createdBy: String(row.createdBy),
      adjustmentOfId: row.adjustmentOfId == null ? undefined : String(row.adjustmentOfId),
      adjustedById: row.adjustedById == null ? undefined : String(row.adjustedById),
    };
  }

  async add(tenantId: string, transaction: Omit<TransactionItem, 'id'>): Promise<TransactionItem> {
    const pool = await getMssqlPool();
    const table = getTransactionsTableName();
    const id = randomUUID();

    await pool
      .request()
      .input('id', sql.NVarChar(64), id)
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('title', sql.NVarChar(255), transaction.title)
      .input('accountId', sql.NVarChar(64), transaction.accountId)
      .input('categoryId', sql.NVarChar(64), transaction.categoryId)
      .input('amount', sql.BigInt, Math.round(transaction.amount))
      .input('type', sql.NVarChar(16), transaction.type)
      .input('occurredAt', sql.DateTime2, new Date(transaction.occurredAt))
      .input('status', sql.NVarChar(16), transaction.status)
      .input('note', sql.NVarChar(sql.MAX), transaction.note ?? '')
      .input('createdBy', sql.NVarChar(128), transaction.createdBy)
      .query(`
        INSERT INTO ${table}
          ([id], [tenantId], [title], [accountId], [categoryId], [amount], [type], [occurredAt], [status], [note], [createdBy])
        VALUES
          (@id, @tenantId, @title, @accountId, @categoryId, @amount, @type, @occurredAt, @status, @note, @createdBy)
      `);

    return { id, ...transaction };
  }

  async adjust(
    tenantId: string,
    id: string,
    transaction: Omit<TransactionItem, 'id' | 'adjustmentOfId' | 'adjustedById'>,
  ): Promise<{ original: TransactionItem; adjustment: TransactionItem }> {
    const pool = await getMssqlPool();
    const table = getTransactionsTableName();
    const adjustmentId = randomUUID();
    const sqlTransaction = new sql.Transaction(pool);

    await sqlTransaction.begin();

    try {
      const lookup = await new sql.Request(sqlTransaction)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('id', sql.NVarChar(64), id)
        .query(`
        SELECT TOP 1
          [id],
          [title],
          [accountId],
          [categoryId],
          [amount],
          [type],
          [occurredAt],
          [status],
          [note],
          [createdBy],
          [adjustmentOfId],
          [adjustedById]
        FROM ${table}
        WHERE [tenantId] = @tenantId AND [id] = @id
      `);

      const originalRow = lookup.recordset?.[0] as Record<string, unknown> | undefined;
      if (!originalRow) {
        throw new Error('TRANSACTION_NOT_FOUND');
      }

      if (originalRow.adjustmentOfId != null) {
        throw new Error('CANNOT_ADJUST_ADJUSTMENT');
      }

      if (originalRow.adjustedById != null) {
        throw new Error('TRANSACTION_ALREADY_ADJUSTED');
      }

      await new sql.Request(sqlTransaction)
        .input('id', sql.NVarChar(64), adjustmentId)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('title', sql.NVarChar(255), transaction.title)
        .input('accountId', sql.NVarChar(64), transaction.accountId)
        .input('categoryId', sql.NVarChar(64), transaction.categoryId)
        .input('amount', sql.BigInt, Math.round(transaction.amount))
        .input('type', sql.NVarChar(16), transaction.type)
        .input('occurredAt', sql.DateTime2, new Date(transaction.occurredAt))
        .input('status', sql.NVarChar(16), transaction.status)
        .input('note', sql.NVarChar(sql.MAX), transaction.note ?? '')
        .input('createdBy', sql.NVarChar(128), transaction.createdBy)
        .input('adjustmentOfId', sql.NVarChar(64), id)
        .query(`
          INSERT INTO ${table}
            ([id], [tenantId], [title], [accountId], [categoryId], [amount], [type], [occurredAt], [status], [note], [createdBy], [adjustmentOfId])
          VALUES
            (@id, @tenantId, @title, @accountId, @categoryId, @amount, @type, @occurredAt, @status, @note, @createdBy, @adjustmentOfId)
        `);

      await new sql.Request(sqlTransaction)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('id', sql.NVarChar(64), id)
        .input('adjustedById', sql.NVarChar(64), adjustmentId)
        .query(`
          UPDATE ${table}
          SET [adjustedById] = @adjustedById
          WHERE [tenantId] = @tenantId AND [id] = @id;

          SELECT @@ROWCOUNT AS [affected];
        `);

      await sqlTransaction.commit();

      const original: TransactionItem = {
        id: String(originalRow.id),
        title: String(originalRow.title),
        accountId: String(originalRow.accountId),
        categoryId: String(originalRow.categoryId),
        amount: Number(originalRow.amount),
        type: originalRow.type === 'Income' ? 'Income' : 'Expense',
        occurredAt: originalRow.occurredAt instanceof Date ? originalRow.occurredAt.toISOString() : String(originalRow.occurredAt),
        status:
          originalRow.status === 'Draft' || originalRow.status === 'Pending' || originalRow.status === 'Completed'
            ? (originalRow.status as 'Draft' | 'Pending' | 'Completed')
            : 'Completed',
        note: originalRow.note == null ? '' : String(originalRow.note),
        createdBy: String(originalRow.createdBy),
        adjustmentOfId: originalRow.adjustmentOfId == null ? undefined : String(originalRow.adjustmentOfId),
        adjustedById: adjustmentId,
      };

      const adjustment: TransactionItem = {
        id: adjustmentId,
        ...transaction,
        adjustmentOfId: id,
      };

      return { original, adjustment };
    } catch (error) {
      await sqlTransaction.rollback();
      throw error;
    }
  }

  async update(tenantId: string, id: string, transaction: Omit<TransactionItem, 'id'>): Promise<TransactionItem | undefined> {
    const pool = await getMssqlPool();
    const table = getTransactionsTableName();

    const result = await pool
      .request()
      .input('tenantId', sql.NVarChar(64), tenantId)
      .input('id', sql.NVarChar(64), id)
      .input('title', sql.NVarChar(255), transaction.title)
      .input('accountId', sql.NVarChar(64), transaction.accountId)
      .input('categoryId', sql.NVarChar(64), transaction.categoryId)
      .input('amount', sql.BigInt, Math.round(transaction.amount))
      .input('type', sql.NVarChar(16), transaction.type)
      .input('occurredAt', sql.DateTime2, new Date(transaction.occurredAt))
      .input('status', sql.NVarChar(16), transaction.status)
      .input('note', sql.NVarChar(sql.MAX), transaction.note ?? '')
      .input('createdBy', sql.NVarChar(128), transaction.createdBy)
      .query(`
        UPDATE ${table}
        SET
          [title] = @title,
          [accountId] = @accountId,
          [categoryId] = @categoryId,
          [amount] = @amount,
          [type] = @type,
          [occurredAt] = @occurredAt,
          [status] = @status,
          [note] = @note,
          [createdBy] = @createdBy
        WHERE [tenantId] = @tenantId AND [id] = @id;

        SELECT @@ROWCOUNT AS [affected];
      `);

    const affected = Number(result.recordset?.[0]?.affected ?? 0);
    if (affected <= 0) {
      return undefined;
    }

    return { id, ...transaction };
  }

  async delete(_tenantId: string, _id: string): Promise<boolean> {
    throw new Error('TRANSACTION_DELETE_NOT_ALLOWED');
  }
}
