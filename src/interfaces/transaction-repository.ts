import { TransactionItem } from '../models/transaction-item';

export interface ITransactionRepository {
  getAll(): TransactionItem[];
  getById(id: string): TransactionItem | undefined;
  add(transaction: Omit<TransactionItem, 'id'>): TransactionItem;
  update(id: string, transaction: Omit<TransactionItem, 'id'>): TransactionItem | undefined;
  delete(id: string): boolean;
}
