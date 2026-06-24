import { Request, Response } from 'express';
import { ISpendingAlertRepository } from '../interfaces/spending-alert-repository';
import { SpendingAlertPeriod } from '../models/spending-alert';

export class SpendingAlertsController {
  constructor(private readonly repository: ISpendingAlertRepository) {}

  private getTenantId(response: Response): string {
    return String((response.locals as Record<string, unknown>).tenantId ?? '');
  }

  getAll = async (_request: Request, response: Response): Promise<void> => {
    try {
      const items = await this.repository.getAll(this.getTenantId(response));
      response.json(items);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  upsert = async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as { period?: string; thresholdAmount?: unknown };
    const period =
      payload.period === 'day' || payload.period === 'week' || payload.period === 'month' ? (payload.period as SpendingAlertPeriod) : null;
    const thresholdAmount = Number(payload.thresholdAmount ?? 0);

    if (!period) {
      response.status(400).json({ message: 'period không hợp lệ' });
      return;
    }

    if (!Number.isFinite(thresholdAmount) || thresholdAmount < 0) {
      response.status(400).json({ message: 'thresholdAmount không hợp lệ' });
      return;
    }

    try {
      const saved = await this.repository.upsert(this.getTenantId(response), period, Math.round(thresholdAmount));
      response.json(saved);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };
}

