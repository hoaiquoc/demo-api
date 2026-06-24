export type SpendingAlertPeriod = 'day' | 'week' | 'month';

export interface SpendingAlert {
  id: string;
  tenantId: string;
  period: SpendingAlertPeriod;
  thresholdAmount: number;
}
