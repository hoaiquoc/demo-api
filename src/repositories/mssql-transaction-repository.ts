import { randomUUID } from 'node:crypto';
import { ITransactionRepository } from '../interfaces/transaction-repository';
import { TransactionItem } from '../models/transaction-item';
import { getMssqlPool, sql } from '../db/mssql';
import { getAccountsTableName, getTransactionsTableName } from '../db/schema';

type GoldPriceSnapshot = {
  typeCode: string;
  sellOrBuy: number;
  vndPerGram: number;
  fetchedAt: number;
};

const GOLD_PRICE_TTL_MS = 5 * 60 * 1000;
const goldPriceCache = new Map<string, GoldPriceSnapshot>();

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    return Number(normalized);
  }
  return NaN;
}

function normalizeGoldUnit(value: unknown): 'gram' | 'chi' | 'luong' | null {
  return value === 'gram' || value === 'chi' || value === 'luong' ? value : null;
}

function toGoldGrams(quantity: number, unit: 'gram' | 'chi' | 'luong' | null): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }

  if (unit === 'luong') {
    return quantity * 37.5;
  }

  if (unit === 'chi') {
    return quantity * 3.75;
  }

  return quantity;
}

function fromGoldGrams(grams: number, unit: 'gram' | 'chi' | 'luong'): number {
  if (!Number.isFinite(grams) || grams <= 0) {
    return 0;
  }

  if (unit === 'luong') {
    return grams / 37.5;
  }

  if (unit === 'chi') {
    return grams / 3.75;
  }

  return grams;
}

function roundGoldValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 1_000_000) / 1_000_000;
}

function getCompletedCashDelta(
  accountType: string,
  transaction: Pick<TransactionItem, 'type' | 'status' | 'amount'>,
): number {
  if (accountType === 'Tiết kiệm vàng' || transaction.status !== 'Completed') {
    return 0;
  }

  const amount = Math.abs(Math.round(transaction.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  return transaction.type === 'Income' ? amount : -amount;
}

async function getCompletedGoldDeltaGrams(
  accountType: string,
  assetCode: unknown,
  transaction: Pick<TransactionItem, 'type' | 'status' | 'amount' | 'assetQuantity' | 'assetUnit'>,
): Promise<number> {
  if (accountType !== 'Tiết kiệm vàng' || transaction.status !== 'Completed') {
    return 0;
  }

  const quantityRaw = toNumber(transaction.assetQuantity ?? NaN);
  const quantity = Number.isFinite(quantityRaw) ? Math.max(0, quantityRaw) : 0;
  const unit = normalizeGoldUnit(transaction.assetUnit);
  const inputGrams = toGoldGrams(quantity, unit);
  const sign = transaction.type === 'Income' ? 1 : -1;

  if (inputGrams > 0) {
    return roundGoldValue(sign * inputGrams);
  }

  const goldPrice = await getGoldVndPerGram(assetCode == null ? 'SJL1L10' : String(assetCode));
  return roundGoldValue((sign * Math.abs(Math.round(transaction.amount))) / goldPrice.vndPerGram);
}

async function getGoldVndPerGram(typeCode: string): Promise<GoldPriceSnapshot> {
  const normalizedTypeCode = typeCode.trim() || 'SJL1L10';
  const now = Date.now();
  const cached = goldPriceCache.get(normalizedTypeCode);
  if (cached && now - cached.fetchedAt < GOLD_PRICE_TTL_MS) {
    return cached;
  }

  const upstream = await fetch(`https://www.vang.today/api/prices?type=${encodeURIComponent(normalizedTypeCode)}`);
  if (!upstream.ok) {
    throw new Error('GOLD_PRICE_UNAVAILABLE');
  }

  const payload = (await upstream.json()) as Record<string, unknown>;
  const buy = toNumber(payload.buy);
  const sell = toNumber(payload.sell);
  const sellOrBuy = Number.isFinite(sell) && sell > 0 ? sell : buy;

  if (!Number.isFinite(buy) || !Number.isFinite(sellOrBuy) || sellOrBuy <= 0) {
    throw new Error('GOLD_PRICE_INVALID');
  }

  const vndPerGram = sellOrBuy / 37.5;
  if (!Number.isFinite(vndPerGram) || vndPerGram <= 0) {
    throw new Error('GOLD_PRICE_INVALID');
  }

  const snapshot: GoldPriceSnapshot = {
    typeCode: normalizedTypeCode,
    sellOrBuy,
    vndPerGram,
    fetchedAt: now,
  };
  goldPriceCache.set(normalizedTypeCode, snapshot);
  return snapshot;
}

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
        [adjustedById],
        [assetQuantity],
        [assetUnit]
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
      assetQuantity: row.assetQuantity == null ? null : Number(row.assetQuantity),
      assetUnit: row.assetUnit == null ? null : String(row.assetUnit),
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
        [adjustedById],
        [assetQuantity],
        [assetUnit]
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
      assetQuantity: row.assetQuantity == null ? null : Number(row.assetQuantity),
      assetUnit: row.assetUnit == null ? null : String(row.assetUnit),
    };
  }

  async add(tenantId: string, transaction: Omit<TransactionItem, 'id'>): Promise<TransactionItem> {
    const pool = await getMssqlPool();
    const table = getTransactionsTableName();
    const accountsTable = getAccountsTableName();
    const id = randomUUID();

    const sqlTransaction = new sql.Transaction(pool);
    await sqlTransaction.begin();

    try {
      const accountLookup = await new sql.Request(sqlTransaction)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('accountId', sql.NVarChar(64), transaction.accountId)
        .query(`
          SELECT TOP 1 [type], [assetCode], [assetQuantity], [assetUnit]
          FROM ${accountsTable} WITH (UPDLOCK, ROWLOCK)
          WHERE [tenantId] = @tenantId AND [id] = @accountId
        `);

      const accountRow = accountLookup.recordset?.[0] as Record<string, unknown> | undefined;
      const accountType = accountRow?.type == null ? '' : String(accountRow.type);
      const isGold = accountType === 'Tiết kiệm vàng';
      const status = transaction.status === 'Draft' || transaction.status === 'Pending' || transaction.status === 'Completed' ? transaction.status : 'Completed';

      const currentQuantityRaw = toNumber(accountRow?.assetQuantity ?? 0);
      const currentQuantity = Number.isFinite(currentQuantityRaw) ? currentQuantityRaw : 0;
      const inputAssetQuantityRaw = toNumber(transaction.assetQuantity ?? NaN);
      const inputAssetQuantity = Number.isFinite(inputAssetQuantityRaw) ? Math.max(0, inputAssetQuantityRaw) : 0;
      const currentAssetUnit = normalizeGoldUnit(accountRow?.assetUnit);
      const inputAssetUnit = normalizeGoldUnit(transaction.assetUnit);
      const storageUnit =
        currentAssetUnit === 'gram' && inputAssetUnit && inputAssetUnit !== 'gram'
          ? inputAssetUnit
          : currentAssetUnit ?? inputAssetUnit ?? 'chi';
      const currentGrams = toGoldGrams(currentQuantity, currentAssetUnit ?? storageUnit);
      const inputGrams = toGoldGrams(inputAssetQuantity, inputAssetUnit);
      const goldPrice =
        isGold && status === 'Completed' && inputGrams <= 0
          ? await getGoldVndPerGram(accountRow?.assetCode == null ? 'SJL1L10' : String(accountRow.assetCode))
          : null;

      const gramsDeltaRaw =
        isGold && status === 'Completed' && goldPrice
          ? ((transaction.type === 'Income' ? 1 : -1) * Number(transaction.amount)) / goldPrice.vndPerGram
          : isGold && status === 'Completed'
            ? (transaction.type === 'Income' ? 1 : -1) * inputGrams
          : 0;
      const gramsDelta = Math.round(gramsDeltaRaw * 1_000_000) / 1_000_000;
      const nextGrams = Math.round((currentGrams + gramsDelta) * 1_000_000) / 1_000_000;
      const nextQuantity = Math.round(fromGoldGrams(nextGrams, storageUnit) * 1_000_000) / 1_000_000;

      if (isGold && status === 'Completed' && nextGrams < 0) {
        throw new Error('GOLD_INSUFFICIENT');
      }

      const amountForInsert = Math.round(transaction.amount);
      const cashDelta = getCompletedCashDelta(accountType, {
        type: transaction.type,
        status,
        amount: amountForInsert,
      });

      await new sql.Request(sqlTransaction)
        .input('id', sql.NVarChar(64), id)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('title', sql.NVarChar(255), transaction.title)
        .input('accountId', sql.NVarChar(64), transaction.accountId)
        .input('categoryId', sql.NVarChar(64), transaction.categoryId)
        .input('amount', sql.BigInt, amountForInsert)
        .input('type', sql.NVarChar(16), transaction.type)
        .input('occurredAt', sql.DateTime2, new Date(transaction.occurredAt))
        .input('status', sql.NVarChar(16), status)
        .input('assetQuantity', sql.Decimal(18, 6), isGold && inputGrams > 0 ? inputAssetQuantity : null)
        .input('assetUnit', sql.NVarChar(16), isGold && inputGrams > 0 ? inputAssetUnit : null)
        .input('note', sql.NVarChar(sql.MAX), transaction.note ?? '')
        .input('createdBy', sql.NVarChar(128), transaction.createdBy)
        .query(`
          INSERT INTO ${table}
            ([id], [tenantId], [title], [accountId], [categoryId], [amount], [type], [occurredAt], [status], [assetQuantity], [assetUnit], [note], [createdBy])
          VALUES
            (@id, @tenantId, @title, @accountId, @categoryId, @amount, @type, @occurredAt, @status, @assetQuantity, @assetUnit, @note, @createdBy)
        `);

      if (cashDelta !== 0) {
        await new sql.Request(sqlTransaction)
          .input('tenantId', sql.NVarChar(64), tenantId)
          .input('accountId', sql.NVarChar(64), transaction.accountId)
          .input('delta', sql.BigInt, cashDelta)
          .query(`
            UPDATE ${accountsTable}
            SET [balance] = CAST([balance] AS BIGINT) + @delta
            WHERE [tenantId] = @tenantId AND [id] = @accountId
          `);
      }

      if (isGold && status === 'Completed') {
        await new sql.Request(sqlTransaction)
          .input('tenantId', sql.NVarChar(64), tenantId)
          .input('accountId', sql.NVarChar(64), transaction.accountId)
          .input('assetQuantity', sql.Decimal(18, 6), nextQuantity)
          .input('assetUnit', sql.NVarChar(16), storageUnit)
          .query(`
            UPDATE ${accountsTable}
            SET [assetQuantity] = @assetQuantity,
                [assetUnit] = @assetUnit
            WHERE [tenantId] = @tenantId AND [id] = @accountId
          `);
      }

      await sqlTransaction.commit();

      return {
        id,
        ...transaction,
        amount: amountForInsert,
        status,
        assetQuantity: isGold && inputGrams > 0 ? inputAssetQuantity : null,
        assetUnit: isGold && inputGrams > 0 ? inputAssetUnit : null,
      };
    } catch (error) {
      await sqlTransaction.rollback();
      throw error;
    }

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
          [adjustedById],
          [assetQuantity],
          [assetUnit]
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
        .input('assetQuantity', sql.Decimal(18, 6), transaction.assetQuantity ?? null)
        .input('assetUnit', sql.NVarChar(16), transaction.assetUnit ?? null)
        .input('note', sql.NVarChar(sql.MAX), transaction.note ?? '')
        .input('createdBy', sql.NVarChar(128), transaction.createdBy)
        .input('adjustmentOfId', sql.NVarChar(64), id)
        .query(`
          INSERT INTO ${table}
            ([id], [tenantId], [title], [accountId], [categoryId], [amount], [type], [occurredAt], [status], [assetQuantity], [assetUnit], [note], [createdBy], [adjustmentOfId])
          VALUES
            (@id, @tenantId, @title, @accountId, @categoryId, @amount, @type, @occurredAt, @status, @assetQuantity, @assetUnit, @note, @createdBy, @adjustmentOfId)
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
        assetQuantity: originalRow.assetQuantity == null ? null : Number(originalRow.assetQuantity),
        assetUnit: originalRow.assetUnit == null ? null : String(originalRow.assetUnit),
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
    const accountsTable = getAccountsTableName();
    const sqlTransaction = new sql.Transaction(pool);
    await sqlTransaction.begin();

    try {
      const existingResult = await new sql.Request(sqlTransaction)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('id', sql.NVarChar(64), id)
        .query(`
          SELECT TOP 1
            [id],
            [accountId],
            [amount],
            [type],
            [status],
            [assetQuantity],
            [assetUnit],
            [adjustmentOfId],
            [adjustedById]
          FROM ${table} WITH (UPDLOCK, ROWLOCK)
          WHERE [tenantId] = @tenantId AND [id] = @id
        `);

      const existingRow = existingResult.recordset?.[0] as Record<string, unknown> | undefined;
      if (!existingRow) {
        await sqlTransaction.rollback();
        return undefined;
      }

      if (existingRow.adjustmentOfId != null || existingRow.adjustedById != null) {
        throw new Error('TRANSACTION_UPDATE_NOT_ALLOWED');
      }

      const impactedAccountIds = Array.from(new Set([String(existingRow.accountId), transaction.accountId].filter(Boolean)));
      const accountRows = new Map<string, Record<string, unknown>>();

      for (const accountId of impactedAccountIds) {
        const accountResult = await new sql.Request(sqlTransaction)
          .input('tenantId', sql.NVarChar(64), tenantId)
          .input('accountId', sql.NVarChar(64), accountId)
          .query(`
            SELECT TOP 1 [id], [type], [assetCode], [assetQuantity], [assetUnit]
            FROM ${accountsTable} WITH (UPDLOCK, ROWLOCK)
            WHERE [tenantId] = @tenantId AND [id] = @accountId
          `);

        const accountRow = accountResult.recordset?.[0] as Record<string, unknown> | undefined;
        if (accountRow) {
          accountRows.set(accountId, accountRow);
        }
      }

      const previousAccountId = String(existingRow.accountId);
      const previousAccount = accountRows.get(previousAccountId);
      const nextAccount = accountRows.get(transaction.accountId);

      const previousTransaction: Omit<TransactionItem, 'id'> = {
        title: '',
        accountId: previousAccountId,
        categoryId: '',
        amount: Number(existingRow.amount ?? 0),
        type: existingRow.type === 'Income' ? 'Income' : 'Expense',
        occurredAt: '',
        status:
          existingRow.status === 'Draft' || existingRow.status === 'Pending' || existingRow.status === 'Completed'
            ? (existingRow.status as 'Draft' | 'Pending' | 'Completed')
            : 'Completed',
        note: '',
        createdBy: '',
        assetQuantity: existingRow.assetQuantity == null ? null : Number(existingRow.assetQuantity),
        assetUnit: existingRow.assetUnit == null ? null : String(existingRow.assetUnit),
      };

      const nextStatus =
        transaction.status === 'Draft' || transaction.status === 'Pending' || transaction.status === 'Completed' ? transaction.status : 'Completed';
      const nextAmount = Math.abs(Math.round(transaction.amount));
      const nextAssetQuantityRaw = toNumber(transaction.assetQuantity ?? NaN);
      const nextAssetQuantity = Number.isFinite(nextAssetQuantityRaw) ? Math.max(0, nextAssetQuantityRaw) : 0;
      const nextAssetUnit = normalizeGoldUnit(transaction.assetUnit);

      const previousGoldDelta = previousAccount
        ? await getCompletedGoldDeltaGrams(previousAccount.type == null ? '' : String(previousAccount.type), previousAccount.assetCode, previousTransaction)
        : 0;
      const nextGoldDelta = nextAccount
        ? await getCompletedGoldDeltaGrams(nextAccount.type == null ? '' : String(nextAccount.type), nextAccount.assetCode, {
            type: transaction.type,
            status: nextStatus,
            amount: nextAmount,
            assetQuantity: nextAssetQuantity,
            assetUnit: nextAssetUnit,
          })
        : 0;

      const previousCashDelta = previousAccount
        ? getCompletedCashDelta(previousAccount.type == null ? '' : String(previousAccount.type), previousTransaction)
        : 0;
      const nextCashDelta = nextAccount
        ? getCompletedCashDelta(nextAccount.type == null ? '' : String(nextAccount.type), {
            type: transaction.type,
            status: nextStatus,
            amount: nextAmount,
          })
        : 0;

      const goldAdjustments = new Map<string, { row: Record<string, unknown>; deltaGrams: number; preferredUnit: 'gram' | 'chi' | 'luong' | null }>();

      if (previousAccount && previousGoldDelta !== 0) {
        goldAdjustments.set(previousAccountId, {
          row: previousAccount,
          deltaGrams: -previousGoldDelta,
          preferredUnit: normalizeGoldUnit(previousTransaction.assetUnit),
        });
      }

      if (nextAccount && nextGoldDelta !== 0) {
        const existing = goldAdjustments.get(transaction.accountId);
        if (existing) {
          existing.deltaGrams = roundGoldValue(existing.deltaGrams + nextGoldDelta);
          existing.preferredUnit = existing.preferredUnit ?? nextAssetUnit;
        } else {
          goldAdjustments.set(transaction.accountId, {
            row: nextAccount,
            deltaGrams: nextGoldDelta,
            preferredUnit: nextAssetUnit,
          });
        }
      }

      for (const [accountId, adjustment] of goldAdjustments.entries()) {
        if (adjustment.row.type !== 'Tiết kiệm vàng' && String(adjustment.row.type ?? '') !== 'Tiết kiệm vàng') {
          continue;
        }

        const currentQuantityRaw = toNumber(adjustment.row.assetQuantity ?? 0);
        const currentQuantity = Number.isFinite(currentQuantityRaw) ? currentQuantityRaw : 0;
        const currentUnit = normalizeGoldUnit(adjustment.row.assetUnit);
        const storageUnit = currentUnit ?? adjustment.preferredUnit ?? 'chi';
        const nextGrams = roundGoldValue(toGoldGrams(currentQuantity, currentUnit ?? storageUnit) + adjustment.deltaGrams);
        if (nextGrams < 0) {
          throw new Error('GOLD_INSUFFICIENT');
        }

        const nextQuantity = roundGoldValue(fromGoldGrams(nextGrams, storageUnit));
        await new sql.Request(sqlTransaction)
          .input('tenantId', sql.NVarChar(64), tenantId)
          .input('accountId', sql.NVarChar(64), accountId)
          .input('assetQuantity', sql.Decimal(18, 6), nextQuantity)
          .input('assetUnit', sql.NVarChar(16), storageUnit)
          .query(`
            UPDATE ${accountsTable}
            SET [assetQuantity] = @assetQuantity,
                [assetUnit] = @assetUnit
            WHERE [tenantId] = @tenantId AND [id] = @accountId
          `);
      }

      if (previousCashDelta !== 0 || nextCashDelta !== 0) {
        if (previousAccountId === transaction.accountId) {
          const netDelta = Math.round(nextCashDelta - previousCashDelta);
          if (netDelta !== 0) {
            await new sql.Request(sqlTransaction)
              .input('tenantId', sql.NVarChar(64), tenantId)
              .input('accountId', sql.NVarChar(64), transaction.accountId)
              .input('delta', sql.BigInt, netDelta)
              .query(`
                UPDATE ${accountsTable}
                SET [balance] = CAST([balance] AS BIGINT) + @delta
                WHERE [tenantId] = @tenantId AND [id] = @accountId
              `);
          }
        } else {
          if (previousCashDelta !== 0) {
            await new sql.Request(sqlTransaction)
              .input('tenantId', sql.NVarChar(64), tenantId)
              .input('accountId', sql.NVarChar(64), previousAccountId)
              .input('delta', sql.BigInt, Math.round(-previousCashDelta))
              .query(`
                UPDATE ${accountsTable}
                SET [balance] = CAST([balance] AS BIGINT) + @delta
                WHERE [tenantId] = @tenantId AND [id] = @accountId
              `);
          }

          if (nextCashDelta !== 0) {
            await new sql.Request(sqlTransaction)
              .input('tenantId', sql.NVarChar(64), tenantId)
              .input('accountId', sql.NVarChar(64), transaction.accountId)
              .input('delta', sql.BigInt, Math.round(nextCashDelta))
              .query(`
                UPDATE ${accountsTable}
                SET [balance] = CAST([balance] AS BIGINT) + @delta
                WHERE [tenantId] = @tenantId AND [id] = @accountId
              `);
          }
        }
      }

      const updateResult = await new sql.Request(sqlTransaction)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('id', sql.NVarChar(64), id)
        .input('title', sql.NVarChar(255), transaction.title)
        .input('accountId', sql.NVarChar(64), transaction.accountId)
        .input('categoryId', sql.NVarChar(64), transaction.categoryId)
        .input('amount', sql.BigInt, nextAmount)
        .input('type', sql.NVarChar(16), transaction.type)
        .input('occurredAt', sql.DateTime2, new Date(transaction.occurredAt))
        .input('status', sql.NVarChar(16), nextStatus)
        .input('assetQuantity', sql.Decimal(18, 6), nextGoldDelta !== 0 || nextAssetQuantity > 0 ? nextAssetQuantity : null)
        .input('assetUnit', sql.NVarChar(16), nextGoldDelta !== 0 || nextAssetQuantity > 0 ? nextAssetUnit : null)
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
            [assetQuantity] = @assetQuantity,
            [assetUnit] = @assetUnit,
            [note] = @note,
            [createdBy] = @createdBy
          WHERE [tenantId] = @tenantId AND [id] = @id;

          SELECT @@ROWCOUNT AS [affected];
        `);

      const affected = Number(updateResult.recordset?.[0]?.affected ?? 0);
      if (affected <= 0) {
        await sqlTransaction.rollback();
        return undefined;
      }

      await sqlTransaction.commit();
      return {
        id,
        ...transaction,
        amount: nextAmount,
        status: nextStatus,
        assetQuantity: nextGoldDelta !== 0 || nextAssetQuantity > 0 ? nextAssetQuantity : null,
        assetUnit: nextGoldDelta !== 0 || nextAssetQuantity > 0 ? nextAssetUnit : null,
      };
    } catch (error) {
      await sqlTransaction.rollback();
      throw error;
    }
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const pool = await getMssqlPool();
    const table = getTransactionsTableName();
    const accountsTable = getAccountsTableName();
    const sqlTransaction = new sql.Transaction(pool);
    await sqlTransaction.begin();

    try {
      const existingResult = await new sql.Request(sqlTransaction)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('id', sql.NVarChar(64), id)
        .query(`
          SELECT TOP 1
            [id],
            [accountId],
            [amount],
            [type],
            [status],
            [assetQuantity],
            [assetUnit],
            [adjustmentOfId],
            [adjustedById]
          FROM ${table} WITH (UPDLOCK, ROWLOCK)
          WHERE [tenantId] = @tenantId AND [id] = @id
        `);

      const existingRow = existingResult.recordset?.[0] as Record<string, unknown> | undefined;
      if (!existingRow) {
        await sqlTransaction.rollback();
        return false;
      }

      if (existingRow.adjustmentOfId != null || existingRow.adjustedById != null) {
        throw new Error('TRANSACTION_DELETE_NOT_ALLOWED');
      }

      const accountId = String(existingRow.accountId);
      const accountResult = await new sql.Request(sqlTransaction)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('accountId', sql.NVarChar(64), accountId)
        .query(`
          SELECT TOP 1 [id], [type], [assetCode], [assetQuantity], [assetUnit]
          FROM ${accountsTable} WITH (UPDLOCK, ROWLOCK)
          WHERE [tenantId] = @tenantId AND [id] = @accountId
        `);

      const accountRow = accountResult.recordset?.[0] as Record<string, unknown> | undefined;
      const cashDelta = accountRow
        ? getCompletedCashDelta(accountRow.type == null ? '' : String(accountRow.type), {
            type: existingRow.type === 'Income' ? 'Income' : 'Expense',
            status:
              existingRow.status === 'Draft' || existingRow.status === 'Pending' || existingRow.status === 'Completed'
                ? (existingRow.status as 'Draft' | 'Pending' | 'Completed')
                : 'Completed',
            amount: Number(existingRow.amount ?? 0),
          })
        : 0;
      const goldDelta = accountRow
        ? await getCompletedGoldDeltaGrams(accountRow.type == null ? '' : String(accountRow.type), accountRow.assetCode, {
            type: existingRow.type === 'Income' ? 'Income' : 'Expense',
            status:
              existingRow.status === 'Draft' || existingRow.status === 'Pending' || existingRow.status === 'Completed'
                ? (existingRow.status as 'Draft' | 'Pending' | 'Completed')
                : 'Completed',
            amount: Number(existingRow.amount ?? 0),
            assetQuantity: existingRow.assetQuantity == null ? null : Number(existingRow.assetQuantity),
            assetUnit: existingRow.assetUnit == null ? null : String(existingRow.assetUnit),
          })
        : 0;

      if (accountRow && goldDelta !== 0 && String(accountRow.type ?? '') === 'Tiết kiệm vàng') {
        const currentQuantityRaw = toNumber(accountRow.assetQuantity ?? 0);
        const currentQuantity = Number.isFinite(currentQuantityRaw) ? currentQuantityRaw : 0;
        const currentUnit = normalizeGoldUnit(accountRow.assetUnit) ?? normalizeGoldUnit(existingRow.assetUnit) ?? 'chi';
        const nextGrams = roundGoldValue(toGoldGrams(currentQuantity, currentUnit) - goldDelta);
        if (nextGrams < 0) {
          throw new Error('GOLD_INSUFFICIENT');
        }

        const nextQuantity = roundGoldValue(fromGoldGrams(nextGrams, currentUnit));
        await new sql.Request(sqlTransaction)
          .input('tenantId', sql.NVarChar(64), tenantId)
          .input('accountId', sql.NVarChar(64), accountId)
          .input('assetQuantity', sql.Decimal(18, 6), nextQuantity)
          .input('assetUnit', sql.NVarChar(16), currentUnit)
          .query(`
            UPDATE ${accountsTable}
            SET [assetQuantity] = @assetQuantity,
                [assetUnit] = @assetUnit
            WHERE [tenantId] = @tenantId AND [id] = @accountId
          `);
      }

      if (cashDelta !== 0) {
        await new sql.Request(sqlTransaction)
          .input('tenantId', sql.NVarChar(64), tenantId)
          .input('accountId', sql.NVarChar(64), accountId)
          .input('delta', sql.BigInt, Math.round(-cashDelta))
          .query(`
            UPDATE ${accountsTable}
            SET [balance] = CAST([balance] AS BIGINT) + @delta
            WHERE [tenantId] = @tenantId AND [id] = @accountId
          `);
      }

      const deleteResult = await new sql.Request(sqlTransaction)
        .input('tenantId', sql.NVarChar(64), tenantId)
        .input('id', sql.NVarChar(64), id)
        .query(`
          DELETE FROM ${table}
          WHERE [tenantId] = @tenantId AND [id] = @id;

          SELECT @@ROWCOUNT AS [affected];
        `);

      const affected = Number(deleteResult.recordset?.[0]?.affected ?? 0);
      if (affected <= 0) {
        await sqlTransaction.rollback();
        return false;
      }

      await sqlTransaction.commit();
      return true;
    } catch (error) {
      await sqlTransaction.rollback();
      throw error;
    }
  }
}
