import { SpendingAlert, SpendingAlertPeriod } from '../models/spending-alert';

export interface ISpendingAlertRepository {
  getAll(tenantId: string): Promise<SpendingAlert[]>;
  upsert(tenantId: string, period: SpendingAlertPeriod, thresholdAmount: number): Promise<SpendingAlert>;
}

