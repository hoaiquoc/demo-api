import { Router } from 'express';
import { AccountsController } from '../controllers/accounts-controller';
import { isMssqlEnabled } from '../db/mssql';
import { MsSqlAccountRepository } from '../repositories/mssql-account-repository';

const router = Router();
if (!isMssqlEnabled()) {
  router.use((_request, response) => {
    response.status(500).json({ message: 'MSSQL chưa được cấu hình' });
  });
} else {
  const accountRepository = new MsSqlAccountRepository();
  const accountsController = new AccountsController(accountRepository);

  router.get('/', accountsController.getAll);
  router.get('/:id', accountsController.getById);
  router.post('/', accountsController.create);
  router.put('/:id', accountsController.update);
  router.delete('/:id', accountsController.delete);
}

export default router;
