import { TransactionItem } from '../models/transaction-item';

export interface ITransactionRepository {
  getAll(tenantId: string): Promise<TransactionItem[]>;
  getById(tenantId: string, id: string): Promise<TransactionItem | undefined>;
  add(tenantId: string, transaction: Omit<TransactionItem, 'id'>): Promise<TransactionItem>;
  update(tenantId: string, id: string, transaction: Omit<TransactionItem, 'id'>): Promise<TransactionItem | undefined>;
  delete(tenantId: string, id: string): Promise<boolean>;
  adjust(
    tenantId: string,
    id: string,
    transaction: Omit<TransactionItem, 'id' | 'adjustmentOfId' | 'adjustedById'>,
  ): Promise<{ original: TransactionItem; adjustment: TransactionItem }>;
}
