import { randomUUID } from 'node:crypto';
import { ITransactionRepository } from '../interfaces/transaction-repository';
import { TransactionItem } from '../models/transaction-item';
import { getMssqlPool, sql } from '../db/mssql';
import { getTransactionsTableName } from '../db/schema';

export class MsSqlTransactionRepository implements ITransactionRepository {
  async getAll(): Promise<TransactionItem[]> {
    const pool = await getMssqlPool();
    const table = getTransactionsTableName();

    const result = await pool.request().query(`
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
        [createdBy]
      FROM ${table}
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
    }));
  }

  async getById(id: string): Promise<TransactionItem | undefined> {
    const pool = await getMssqlPool();
    const table = getTransactionsTableName();

    const result = await pool.request().input('id', sql.NVarChar(64), id).query(`
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
        [createdBy]
      FROM ${table}
      WHERE [id] = @id
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
    };
  }

  async add(transaction: Omit<TransactionItem, 'id'>): Promise<TransactionItem> {
    const pool = await getMssqlPool();
    const table = getTransactionsTableName();
    const id = randomUUID();

    await pool
      .request()
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
        INSERT INTO ${table}
          ([id], [title], [accountId], [categoryId], [amount], [type], [occurredAt], [status], [note], [createdBy])
        VALUES
          (@id, @title, @accountId, @categoryId, @amount, @type, @occurredAt, @status, @note, @createdBy)
      `);

    return { id, ...transaction };
  }

  async update(id: string, transaction: Omit<TransactionItem, 'id'>): Promise<TransactionItem | undefined> {
    const pool = await getMssqlPool();
    const table = getTransactionsTableName();

    const result = await pool
      .request()
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
        WHERE [id] = @id;

        SELECT @@ROWCOUNT AS [affected];
      `);

    const affected = Number(result.recordset?.[0]?.affected ?? 0);
    if (affected <= 0) {
      return undefined;
    }

    return { id, ...transaction };
  }

  async delete(id: string): Promise<boolean> {
    const pool = await getMssqlPool();
    const table = getTransactionsTableName();

    const result = await pool.request().input('id', sql.NVarChar(64), id).query(`
      DELETE FROM ${table}
      WHERE [id] = @id;

      SELECT @@ROWCOUNT AS [affected];
    `);

    const affected = Number(result.recordset?.[0]?.affected ?? 0);
    return affected > 0;
  }
}
