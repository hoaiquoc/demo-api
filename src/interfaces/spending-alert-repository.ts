import { SpendingAlert } from '../models/spending-alert';

export interface ISpendingAlertRepository {
  getAll(tenantId: string): Promise<SpendingAlert[]>;
  upsert(tenantId: string, categoryId: string | null, thresholdAmount: number, period?: 'month'): Promise<SpendingAlert>;
}

