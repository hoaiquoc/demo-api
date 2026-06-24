import { Router } from 'express';
import { TransactionsController } from '../controllers/transactions-controller';
import { TransactionRepository } from '../repositories/transaction-repository';

const router = Router();
const transactionRepository = new TransactionRepository();
const transactionsController = new TransactionsController(transactionRepository);

router.get('/', transactionsController.getAll);
router.get('/:id', transactionsController.getById);
router.post('/', transactionsController.create);
router.put('/:id', transactionsController.update);
router.delete('/:id', transactionsController.delete);

export default router;
