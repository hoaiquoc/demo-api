import { Router } from 'express';
import { CategoriesController } from '../controllers/categories-controller';
import { isMssqlEnabled } from '../db/mssql';
import { MsSqlCategoryRepository } from '../repositories/mssql-category-repository';

const router = Router();
if (!isMssqlEnabled()) {
  router.use((_request, response) => {
    response.status(500).json({ message: 'MSSQL chưa được cấu hình' });
  });
} else {
  const categoryRepository = new MsSqlCategoryRepository();
  const categoriesController = new CategoriesController(categoryRepository);

  router.get('/', categoriesController.getAll);
  router.get('/:id', categoriesController.getById);
  router.post('/', categoriesController.create);
  router.put('/:id', categoriesController.update);
  router.delete('/:id', categoriesController.delete);
}

export default router;
