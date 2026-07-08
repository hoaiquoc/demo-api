import { Request, Response } from 'express';
import { ISpendingAlertRepository } from '../interfaces/spending-alert-repository';

export class SpendingAlertsController {
  constructor(private readonly repository: ISpendingAlertRepository) {}

  private getTenantId(response: Response): string {
    return String((response.locals as Record<string, unknown>).tenantId ?? '');
  }

  private normalizePeriod(period: unknown): 'month' {
    if (typeof period === 'string') {
      const normalized = period.trim().toLowerCase();
      if (normalized === 'month' || normalized === 'monthly' || normalized === 'day' || normalized === 'daily' || normalized === 'week' || normalized === 'weekly') {
        return 'month';
      }
    }
    return 'month';
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
    const payload = request.body as { categoryId?: string | null; thresholdAmount?: unknown; period?: string };
    const categoryId = typeof payload.categoryId === 'string' && payload.categoryId.trim() ? payload.categoryId.trim() : null;
    const thresholdAmount = Number(payload.thresholdAmount ?? 0);
    const period = this.normalizePeriod(payload.period);

    if (!Number.isFinite(thresholdAmount) || thresholdAmount < 0) {
      response.status(400).json({ message: 'thresholdAmount không hợp lệ' });
      return;
    }

    try {
      const saved = await this.repository.upsert(this.getTenantId(response), categoryId, Math.round(thresholdAmount), period);
      response.json(saved);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };
}

