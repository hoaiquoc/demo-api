import { IAccountRepository } from '../interfaces/account-repository';
import { Account } from '../models/account';

export class AccountRepository implements IAccountRepository {
  private readonly accounts: Account[] = [
    { id: 'cash', name: 'Tiền mặt', type: 'Ví cá nhân', initialBalance: 2500000, color: 'bg-emerald-500' },
    { id: 'bank', name: 'VCB', type: 'Tài khoản ngân hàng', initialBalance: 12000000, color: 'bg-sky-500' },
    { id: 'travel', name: 'Quỹ du lịch', type: 'Ngân sách mục tiêu', initialBalance: 5000000, color: 'bg-violet-500' },
  ];

  async getAll(): Promise<Account[]> {
    return [...this.accounts];
  }

  async getById(id: string): Promise<Account | undefined> {
    return this.accounts.find((item) => item.id === id);
  }

  async add(account: Account): Promise<Account> {
    this.accounts.push(account);
    return account;
  }

  async update(id: string, account: Omit<Account, 'id'>): Promise<Account | undefined> {
    const existing = await this.getById(id);
    if (!existing) {
      return undefined;
    }

    existing.name = account.name;
    existing.type = account.type;
    existing.initialBalance = account.initialBalance;
    existing.color = account.color;

    return existing;
  }

  async delete(id: string): Promise<boolean> {
    const index = this.accounts.findIndex((item) => item.id === id);
    if (index < 0) {
      return false;
    }

    this.accounts.splice(index, 1);
    return true;
  }
}

