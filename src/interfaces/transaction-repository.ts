import { TransactionItem } from '../models/transaction-item';

export interface ITransactionRepository {
  getAll(): Promise<TransactionItem[]>;
  getById(id: string): Promise<TransactionItem | undefined>;
  add(transaction: Omit<TransactionItem, 'id'>): Promise<TransactionItem>;
  update(id: string, transaction: Omit<TransactionItem, 'id'>): Promise<TransactionItem | undefined>;
  delete(id: string): Promise<boolean>;
}
