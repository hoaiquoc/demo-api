import { Router } from 'express';
import { TransfersController } from '../controllers/transfers-controller';
import { isMssqlEnabled } from '../db/mssql';
import { MsSqlTransactionRepository } from '../repositories/mssql-transaction-repository';

const router = Router();
if (!isMssqlEnabled()) {
  router.use((_request, response) => {
    response.status(500).json({ message: 'MSSQL chưa được cấu hình' });
  });
} else {
  const transactionRepository = new MsSqlTransactionRepository();
  const transfersController = new TransfersController(transactionRepository);

  router.post('/', transfersController.create);
}

export default router;
