export type BudgetScopeType = 'account' | 'category';

export interface Budget {
  id: string;
  tenantId: string;
  month: string;
  scopeType: BudgetScopeType;
  scopeId: string;
  amount: number;
}

