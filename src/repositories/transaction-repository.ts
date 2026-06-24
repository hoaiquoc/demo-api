import { randomUUID } from 'node:crypto';
import { ITransactionRepository } from '../interfaces/transaction-repository';
import { TransactionItem } from '../models/transaction-item';

export class TransactionRepository implements ITransactionRepository {
  private readonly transactions: TransactionItem[] = [
    {
      id: randomUUID(),
      title: 'An sang',
      amount: 45000,
      type: 'Expense',
      transactionDate: new Date().toISOString(),
      note: 'Banh mi va ca phe',
    },
    {
      id: randomUUID(),
      title: 'Luong thang',
      amount: 15000000,
      type: 'Income',
      transactionDate: new Date(Date.now() - 86400000).toISOString(),
      note: 'Chuyen khoan',
    },
  ];

  getAll(): TransactionItem[] {
    return [...this.transactions].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  }

  getById(id: string): TransactionItem | undefined {
    return this.transactions.find((item) => item.id === id);
  }

  add(transaction: Omit<TransactionItem, 'id'>): TransactionItem {
    const created: TransactionItem = {
      id: randomUUID(),
      ...transaction,
    };

    this.transactions.push(created);
    return created;
  }

  update(id: string, transaction: Omit<TransactionItem, 'id'>): TransactionItem | undefined {
    const existing = this.getById(id);
    if (!existing) {
      return undefined;
    }

    existing.title = transaction.title;
    existing.amount = transaction.amount;
    existing.type = transaction.type;
    existing.transactionDate = transaction.transactionDate;
    existing.note = transaction.note;

    return existing;
  }

  delete(id: string): boolean {
    const index = this.transactions.findIndex((item) => item.id === id);
    if (index < 0) {
      return false;
    }

    this.transactions.splice(index, 1);
    return true;
  }
}
