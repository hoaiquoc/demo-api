import { Request, Response } from 'express';
import { IBudgetRepository } from '../interfaces/budget-repository';
import { BudgetScopeType } from '../models/budget';

export class BudgetsController {
  constructor(private readonly repository: IBudgetRepository) {}

  private getTenantId(response: Response): string {
    return String((response.locals as Record<string, unknown>).tenantId ?? '');
  }

  getByMonth = async (request: Request, response: Response): Promise<void> => {
    const month = String(request.query.month ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      response.status(400).json({ message: 'month không hợp lệ (YYYY-MM)' });
      return;
    }

    try {
      const items = await this.repository.getByMonth(this.getTenantId(response), month);
      response.json(items);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  upsert = async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as { month?: string; scopeType?: string; scopeId?: string; amount?: unknown };
    const month = String(payload.month ?? '').trim();
    const scopeType: BudgetScopeType | null = payload.scopeType === 'account' || payload.scopeType === 'category' ? payload.scopeType : null;
    const scopeId = String(payload.scopeId ?? '').trim() || 'all';
    const amount = Number(payload.amount ?? 0);

    if (!/^\d{4}-\d{2}$/.test(month)) {
      response.status(400).json({ message: 'month không hợp lệ (YYYY-MM)' });
      return;
    }

    if (!scopeType) {
      response.status(400).json({ message: 'scopeType không hợp lệ' });
      return;
    }

    if (!scopeId) {
      response.status(400).json({ message: 'scopeId là bắt buộc' });
      return;
    }

    if (!Number.isFinite(amount) || amount < 0) {
      response.status(400).json({ message: 'amount không hợp lệ' });
      return;
    }

    try {
      const saved = await this.repository.upsert(this.getTenantId(response), month, scopeType, scopeId, Math.round(amount));
      response.json({ ok: true, item: saved });
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };
}

