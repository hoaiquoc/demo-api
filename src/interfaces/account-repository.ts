import { Account } from '../models/account';

export interface IAccountRepository {
  getAll(): Promise<Account[]>;
  getById(id: string): Promise<Account | undefined>;
  add(account: Account): Promise<Account>;
  update(id: string, account: Omit<Account, 'id'>): Promise<Account | undefined>;
  delete(id: string): Promise<boolean>;
}

