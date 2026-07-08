export type SpendingAlertPeriod = 'month';

export interface SpendingAlert {
  id: string;
  tenantId: string;
  period: SpendingAlertPeriod;
  categoryId: string | null;
  thresholdAmount: number;
}
