import { Router } from 'express';
import { AccountsController } from '../controllers/accounts-controller';
import { isMssqlEnabled } from '../db/mssql';
import { AccountRepository } from '../repositories/account-repository';
import { MsSqlAccountRepository } from '../repositories/mssql-account-repository';

const router = Router();
const accountRepository = isMssqlEnabled() ? new MsSqlAccountRepository() : new AccountRepository();
const accountsController = new AccountsController(accountRepository);

router.get('/', accountsController.getAll);
router.get('/:id', accountsController.getById);
router.post('/', accountsController.create);
router.put('/:id', accountsController.update);
router.delete('/:id', accountsController.delete);

export default router;

