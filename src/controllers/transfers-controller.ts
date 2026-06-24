import { Request, Response } from 'express';
import { ITransactionRepository } from '../interfaces/transaction-repository';
import { TransferRequest } from '../models/transfer';

export class TransfersController {
  constructor(private readonly transactionRepository: ITransactionRepository) {}

  create = async (request: Request, response: Response): Promise<void> => {
    const tenantId = String((response.locals as Record<string, unknown>).tenantId ?? '');
    const payload = request.body as TransferRequest;

    if (!payload?.fromAccountId || !payload?.toAccountId || !payload?.createdBy) {
      response.status(400).json({ message: 'fromAccountId, toAccountId, createdBy là bắt buộc' });
      return;
    }

    if (payload.fromAccountId === payload.toAccountId) {
      response.status(400).json({ message: 'Không thể chuyển tiền cùng một khoản' });
      return;
    }

    const amountValue = Number(payload.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      response.status(400).json({ message: 'Số tiền phải lớn hơn 0' });
      return;
    }

    const occurredAt = payload.occurredAt?.trim() ? payload.occurredAt.trim() : new Date().toISOString();
    const note = payload.note?.trim() ?? '';

    try {
      const outTransaction = await this.transactionRepository.add(tenantId, {
        title: 'Chuyển tiền',
        accountId: payload.fromAccountId,
        categoryId: 'transfer',
        amount: Math.round(amountValue),
        type: 'Expense',
        occurredAt,
        note,
        createdBy: payload.createdBy,
        status: 'Completed',
      });

      const inTransaction = await this.transactionRepository.add(tenantId, {
        title: 'Nhận chuyển tiền',
        accountId: payload.toAccountId,
        categoryId: 'transfer',
        amount: Math.round(amountValue),
        type: 'Income',
        occurredAt,
        note,
        createdBy: payload.createdBy,
        status: 'Completed',
      });

      response.status(201).json({ outTransaction, inTransaction });
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };
}
