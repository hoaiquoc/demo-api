import { Router } from 'express';
import { SpendingAlertsController } from '../controllers/spending-alerts-controller';
import { MsSqlSpendingAlertRepository } from '../repositories/mssql-spending-alert-repository';
import { isMssqlEnabled } from '../db/mssql';

const router = Router();

if (!isMssqlEnabled()) {
  router.use((_request, response) => {
    response.status(500).json({ message: 'MSSQL chưa được cấu hình' });
  });
} else {
  const repository = new MsSqlSpendingAlertRepository();
  const controller = new SpendingAlertsController(repository);

  router.get('/', controller.getAll);
  router.put('/', controller.upsert);
}

export default router;

