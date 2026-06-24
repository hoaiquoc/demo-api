import { Router } from 'express';
import { TransactionsController } from '../controllers/transactions-controller';
import { MsSqlTransactionRepository } from '../repositories/mssql-transaction-repository';
import { isMssqlEnabled } from '../db/mssql';

const router = Router();
if (!isMssqlEnabled()) {
  router.use((_request, response) => {
    response.status(500).json({ message: 'MSSQL chưa được cấu hình' });
  });
} else {
  const transactionRepository = new MsSqlTransactionRepository();
  const transactionsController = new TransactionsController(transactionRepository);

  router.get('/', transactionsController.getAll);
  router.get('/:id', transactionsController.getById);
  router.post('/', transactionsController.create);
  router.post('/:id/adjust', transactionsController.adjust);
  router.put('/:id', transactionsController.update);
  router.delete('/:id', transactionsController.delete);
}

export default router;
