import { Budget, BudgetScopeType } from '../models/budget';

export interface IBudgetRepository {
  getByMonth(tenantId: string, month: string): Promise<Budget[]>;
  upsert(tenantId: string, month: string, scopeType: BudgetScopeType, scopeId: string, amount: number): Promise<Budget | null>;
}

