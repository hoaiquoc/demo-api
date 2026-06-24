import { Request, Response } from 'express';
import { ICategoryRepository } from '../interfaces/category-repository';
import { Category } from '../models/category';

export class CategoriesController {
  constructor(private readonly categoryRepository: ICategoryRepository) {}

  private getIdParam(request: Request): string {
    const { id } = request.params;
    return Array.isArray(id) ? id[0] : id;
  }

  getAll = async (_request: Request, response: Response): Promise<void> => {
    try {
      const items = await this.categoryRepository.getAll();
      response.json(items);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  getById = async (request: Request, response: Response): Promise<void> => {
    try {
      const category = await this.categoryRepository.getById(this.getIdParam(request));
      if (!category) {
        response.status(404).json({ message: 'Category not found' });
        return;
      }

      response.json(category);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  create = async (request: Request, response: Response): Promise<void> => {
    try {
      const payload = request.body as Category;
      if (!payload?.id || !payload?.name) {
        response.status(400).json({ message: 'id và name là bắt buộc' });
        return;
      }

      const created = await this.categoryRepository.add(payload);
      response.status(201).json(created);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  update = async (request: Request, response: Response): Promise<void> => {
    try {
      const payload = request.body as Omit<Category, 'id'>;
      const updated = await this.categoryRepository.update(this.getIdParam(request), payload);
      if (!updated) {
        response.status(404).json({ message: 'Category not found' });
        return;
      }

      response.json(updated);
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };

  delete = async (request: Request, response: Response): Promise<void> => {
    try {
      const deleted = await this.categoryRepository.delete(this.getIdParam(request));
      if (!deleted) {
        response.status(404).json({ message: 'Category not found' });
        return;
      }

      response.status(204).send();
    } catch {
      response.status(500).json({ message: 'Internal server error' });
    }
  };
}

