import { Account } from '../models/account';

export interface IAccountRepository {
  getAll(tenantId: string): Promise<Account[]>;
  getById(tenantId: string, id: string): Promise<Account | undefined>;
  add(tenantId: string, account: Account): Promise<Account>;
  update(tenantId: string, id: string, account: Omit<Account, 'id'>): Promise<Account | undefined>;
  delete(tenantId: string, id: string): Promise<boolean>;
}
