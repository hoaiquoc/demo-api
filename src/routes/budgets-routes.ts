import { Router } from 'express';
import { isMssqlEnabled } from '../db/mssql';
import { BudgetsController } from '../controllers/budgets-controller';
import { MsSqlBudgetRepository } from '../repositories/mssql-budget-repository';

const router = Router();

if (!isMssqlEnabled()) {
  router.use((_request, response) => {
    response.status(500).json({ message: 'MSSQL chưa được cấu hình' });
  });
} else {
  const repository = new MsSqlBudgetRepository();
  const controller = new BudgetsController(repository);
  router.get('/', controller.getByMonth);
  router.put('/', controller.upsert);
}

export default router;

