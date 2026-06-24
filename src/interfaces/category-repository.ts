import { Category } from '../models/category';

export interface ICategoryRepository {
  getAll(tenantId: string): Promise<Category[]>;
  getById(tenantId: string, id: string): Promise<Category | undefined>;
  add(tenantId: string, category: Category): Promise<Category>;
  update(tenantId: string, id: string, category: Omit<Category, 'id'>): Promise<Category | undefined>;
  delete(tenantId: string, id: string): Promise<boolean>;
}
