import { Category } from '../models/category';

export interface ICategoryRepository {
  getAll(): Promise<Category[]>;
  getById(id: string): Promise<Category | undefined>;
  add(category: Category): Promise<Category>;
  update(id: string, category: Omit<Category, 'id'>): Promise<Category | undefined>;
  delete(id: string): Promise<boolean>;
}

