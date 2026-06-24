import { Request, Response } from 'express';
import { IAccountRepository } from '../interfaces/account-repository';
import { Account } from '../models/account';

export class AccountsController {
  constructor(private readonly accountRepository: IAccountRepository) {}

  private getIdParam(request: Request): string {
    const { id } = request.params;
    return Array.isArray(id) ? id[0] : id;
  }

  getAll = async (_request: Request, response: Response): Promise<void> => {
    try {
      const items = await this.accountRepository.getAll();
      response.json(items);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  getById = async (request: Request, response: Response): Promise<void> => {
    try {
      const account = await this.accountRepository.getById(this.getIdParam(request));
      if (!account) {
        response.status(404).json({ message: 'Account not found' });
        return;
      }

      response.json(account);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  create = async (request: Request, response: Response): Promise<void> => {
    try {
      const payload = request.body as Account;
      if (!payload?.id || !payload?.name) {
        response.status(400).json({ message: 'id và name là bắt buộc' });
        return;
      }

      const created = await this.accountRepository.add(payload);
      response.status(201).json(created);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  update = async (request: Request, response: Response): Promise<void> => {
    try {
      const payload = request.body as Omit<Account, 'id'>;
      const updated = await this.accountRepository.update(this.getIdParam(request), payload);
      if (!updated) {
        response.status(404).json({ message: 'Account not found' });
        return;
      }

      response.json(updated);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  delete = async (request: Request, response: Response): Promise<void> => {
    try {
      const deleted = await this.accountRepository.delete(this.getIdParam(request));
      if (!deleted) {
        response.status(404).json({ message: 'Account not found' });
        return;
      }

      response.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === 'ACCOUNT_BALANCE_NOT_ZERO') {
        response.status(409).json({ message: 'Chỉ được xoá khoản khi số dư = 0' });
        return;
      }

      response.status(500).json({ message: 'Internal server error' });
    }
  };
}
