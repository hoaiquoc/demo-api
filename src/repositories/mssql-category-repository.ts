import { ICategoryRepository } from '../interfaces/category-repository';
import { Category } from '../models/category';
import { getMssqlPool, sql } from '../db/mssql';
import { getCategoriesTableName } from '../db/schema';

export class MsSqlCategoryRepository implements ICategoryRepository {
  async getAll(): Promise<Category[]> {
    const pool = await getMssqlPool();
    const table = getCategoriesTableName();

    const result = await pool.request().query(`
      SELECT [id], [name], [type], [icon], [color]
      FROM ${table}
      ORDER BY [type] ASC, [name] ASC
    `);

    const rows = result.recordset as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      type: row.type === 'Income' ? 'Income' : 'Expense',
      icon: String(row.icon),
      color: String(row.color),
    }));
  }

  async getById(id: string): Promise<Category | undefined> {
    const pool = await getMssqlPool();
    const table = getCategoriesTableName();

    const result = await pool.request().input('id', sql.NVarChar(64), id).query(`
      SELECT TOP 1 [id], [name], [type], [icon], [color]
      FROM ${table}
      WHERE [id] = @id
    `);

    const row = result.recordset?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      return undefined;
    }

    return {
      id: String(row.id),
      name: String(row.name),
      type: row.type === 'Income' ? 'Income' : 'Expense',
      icon: String(row.icon),
      color: String(row.color),
    };
  }

  async add(category: Category): Promise<Category> {
    const pool = await getMssqlPool();
    const table = getCategoriesTableName();

    await pool
      .request()
      .input('id', sql.NVarChar(64), category.id)
      .input('name', sql.NVarChar(128), category.name)
      .input('type', sql.NVarChar(16), category.type)
      .input('icon', sql.NVarChar(8), category.icon)
      .input('color', sql.NVarChar(64), category.color)
      .query(`
        INSERT INTO ${table} ([id], [name], [type], [icon], [color])
        VALUES (@id, @name, @type, @icon, @color)
      `);

    return category;
  }

  async update(id: string, category: Omit<Category, 'id'>): Promise<Category | undefined> {
    const pool = await getMssqlPool();
    const table = getCategoriesTableName();

    const result = await pool
      .request()
      .input('id', sql.NVarChar(64), id)
      .input('name', sql.NVarChar(128), category.name)
      .input('type', sql.NVarChar(16), category.type)
      .input('icon', sql.NVarChar(8), category.icon)
      .input('color', sql.NVarChar(64), category.color)
      .query(`
        UPDATE ${table}
        SET [name] = @name, [type] = @type, [icon] = @icon, [color] = @color
        WHERE [id] = @id;

        SELECT @@ROWCOUNT AS [affected];
      `);

    const affected = Number((result.recordset?.[0] as Record<string, unknown> | undefined)?.affected ?? 0);
    if (affected <= 0) {
      return undefined;
    }

    return { id, ...category };
  }

  async delete(id: string): Promise<boolean> {
    const pool = await getMssqlPool();
    const table = getCategoriesTableName();

    const result = await pool.request().input('id', sql.NVarChar(64), id).query(`
      DELETE FROM ${table}
      WHERE [id] = @id;

      SELECT @@ROWCOUNT AS [affected];
    `);

    const affected = Number((result.recordset?.[0] as Record<string, unknown> | undefined)?.affected ?? 0);
    return affected > 0;
  }
}

