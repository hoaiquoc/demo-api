import { Request, Response } from 'express';
import { ITransactionRepository } from '../interfaces/transaction-repository';
import { TransactionItem } from '../models/transaction-item';

export class TransactionsController {
  constructor(private readonly transactionRepository: ITransactionRepository) {}

  private getIdParam(request: Request): string {
    const { id } = request.params;
    return Array.isArray(id) ? id[0] : id;
  }

  getAll = (_request: Request, response: Response): void => {
    response.json(this.transactionRepository.getAll());
  };

  getById = (request: Request, response: Response): void => {
    const transaction = this.transactionRepository.getById(this.getIdParam(request));
    if (!transaction) {
      response.status(404).json({ message: 'Transaction not found' });
      return;
    }

    response.json(transaction);
  };

  create = (request: Request, response: Response): void => {
    const payload = request.body as Omit<TransactionItem, 'id'>;
    const created = this.transactionRepository.add(payload);
    response.status(201).json(created);
  };

  update = (request: Request, response: Response): void => {
    const payload = request.body as Omit<TransactionItem, 'id'>;
    const updated = this.transactionRepository.update(this.getIdParam(request), payload);
    if (!updated) {
      response.status(404).json({ message: 'Transaction not found' });
      return;
    }

    response.json(updated);
  };

  delete = (request: Request, response: Response): void => {
    const deleted = this.transactionRepository.delete(this.getIdParam(request));
    if (!deleted) {
      response.status(404).json({ message: 'Transaction not found' });
      return;
    }

    response.status(204).send();
  };
}
