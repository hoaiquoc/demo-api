import { Request, Response } from 'express';
import { ITransactionRepository } from '../interfaces/transaction-repository';
import { TransactionItem } from '../models/transaction-item';

export class TransactionsController {
  constructor(private readonly transactionRepository: ITransactionRepository) {}

  private getIdParam(request: Request): string {
    const { id } = request.params;
    return Array.isArray(id) ? id[0] : id;
  }

  getAll = async (_request: Request, response: Response): Promise<void> => {
    try {
      const items = await this.transactionRepository.getAll();
      response.json(items);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  getById = async (request: Request, response: Response): Promise<void> => {
    try {
      const transaction = await this.transactionRepository.getById(this.getIdParam(request));
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
      const created = await this.transactionRepository.add(payload);
      response.status(201).json(created);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  update = async (request: Request, response: Response): Promise<void> => {
    try {
      const payload = request.body as Omit<TransactionItem, 'id'>;
      const updated = await this.transactionRepository.update(this.getIdParam(request), payload);
      if (!updated) {
        response.status(404).json({ message: 'Transaction not found' });
        return;
      }

      response.json(updated);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  delete = async (request: Request, response: Response): Promise<void> => {
    try {
      const deleted = await this.transactionRepository.delete(this.getIdParam(request));
      if (!deleted) {
        response.status(404).json({ message: 'Transaction not found' });
        return;
      }

      response.status(204).send();
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };
}
