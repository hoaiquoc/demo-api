import { Request, Response } from 'express';
import { ITransactionRepository } from '../interfaces/transaction-repository';
import { TransactionItem } from '../models/transaction-item';

export class TransactionsController {
  constructor(private readonly transactionRepository: ITransactionRepository) {}

  private getTenantId(response: Response): string {
    return String((response.locals as Record<string, unknown>).tenantId ?? '');
  }

  private getIdParam(request: Request): string {
    const { id } = request.params;
    return Array.isArray(id) ? id[0] : id;
  }

  getAll = async (_request: Request, response: Response): Promise<void> => {
    try {
      const items = await this.transactionRepository.getAll(this.getTenantId(response));
      response.json(items);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  getById = async (request: Request, response: Response): Promise<void> => {
    try {
      const transaction = await this.transactionRepository.getById(this.getTenantId(response), this.getIdParam(request));
      if (!transaction) {
        response.status(404).json({ message: 'Transaction not found' });
        return;
      }

      response.json(transaction);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  create = async (request: Request, response: Response): Promise<void> => {
    try {
      const payload = request.body as Omit<TransactionItem, 'id'>;
      const rawAmount = Number((payload as Record<string, unknown>).amount ?? 0);
      const amount = Number.isFinite(rawAmount) ? Math.abs(Math.round(rawAmount)) : 0;
      const created = await this.transactionRepository.add(this.getTenantId(response), {
        ...payload,
        amount,
        status: payload.status === 'Draft' || payload.status === 'Pending' || payload.status === 'Completed' ? payload.status : 'Completed',
      });
      response.status(201).json(created);
    } catch (error) {
      if (error instanceof Error && error.message === 'GOLD_INSUFFICIENT') {
        response.status(409).json({ message: 'Không đủ vàng để tạo phiếu chi' });
        return;
      }

      if (error instanceof Error && (error.message === 'GOLD_PRICE_UNAVAILABLE' || error.message === 'GOLD_PRICE_INVALID')) {
        response.status(502).json({ message: 'Không lấy được giá vàng để quy đổi' });
        return;
      }

      response.status(500).json({ message: 'Internal server error' });
    }
  };

  update = async (request: Request, response: Response): Promise<void> => {
    response.status(405).json({ message: 'Không cho phép sửa trực tiếp. Hãy tạo phiếu điều chỉnh.' });
  };

  adjust = async (request: Request, response: Response): Promise<void> => {
    try {
      const payload = request.body as Omit<TransactionItem, 'id' | 'adjustmentOfId' | 'adjustedById'>;
      const rawAmount = Number((payload as Record<string, unknown>).amount ?? 0);
      const amount = Number.isFinite(rawAmount) ? Math.abs(Math.round(rawAmount)) : 0;
      const result = await this.transactionRepository.adjust(this.getTenantId(response), this.getIdParam(request), {
        ...payload,
        amount,
        status: payload.status === 'Draft' || payload.status === 'Pending' || payload.status === 'Completed' ? payload.status : 'Completed',
      });
      response.status(201).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'TRANSACTION_NOT_FOUND') {
        response.status(404).json({ message: 'Transaction not found' });
        return;
      }

      if (error instanceof Error && (error.message === 'TRANSACTION_ALREADY_ADJUSTED' || error.message === 'CANNOT_ADJUST_ADJUSTMENT')) {
        response.status(409).json({ message: 'Phiếu này không thể điều chỉnh' });
        return;
      }

      response.status(500).json({ message: 'Internal server error' });
    }
  };

  delete = async (request: Request, response: Response): Promise<void> => {
    try {
      await this.transactionRepository.delete(this.getTenantId(response), this.getIdParam(request));
      response.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === 'TRANSACTION_DELETE_NOT_ALLOWED') {
        response.status(405).json({ message: 'Không cho phép xoá phiếu' });
        return;
      }

      response.status(500).json({ message: 'Internal server error' });
    }
  };
}
