import { randomUUID } from 'node:crypto';
import { ITransactionRepository } from '../interfaces/transaction-repository';
import { TransactionItem } from '../models/transaction-item';

export class TransactionRepository implements ITransactionRepository {
  private readonly transactions: TransactionItem[] = [
    {
      id: randomUUID(),
      title: 'Luong thang 6',
      accountId: 'bank',
      categoryId: 'salary',
      amount: 22000000,
      type: 'Income',
      occurredAt: new Date().toISOString(),
      note: 'Nhan luong cong ty',
      createdBy: 'Minh',
    },
    {
      id: randomUUID(),
      title: 'Ca phe sang',
      accountId: 'cash',
      categoryId: 'food',
      amount: 45000,
      type: 'Expense',
      occurredAt: new Date(Date.now() - 86400000).toISOString(),
      note: 'Banh mi va ca phe',
      createdBy: 'Lan',
    },
  ];

  getAll(): TransactionItem[] {
    return [...this.transactions].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
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
    existing.accountId = transaction.accountId;
    existing.categoryId = transaction.categoryId;
    existing.amount = transaction.amount;
    existing.type = transaction.type;
    existing.occurredAt = transaction.occurredAt;
    existing.note = transaction.note;
    existing.createdBy = transaction.createdBy;

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
