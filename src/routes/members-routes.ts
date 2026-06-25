import { Router } from 'express';
import { isMssqlEnabled } from '../db/mssql';
import { MembersController } from '../controllers/members-controller';

const router = Router();

if (!isMssqlEnabled()) {
  router.use((_request, response) => {
    response.status(500).json({ message: 'MSSQL chưa được cấu hình' });
  });
} else {
  const controller = new MembersController();
  router.get('/', controller.getAll);
  router.post('/', controller.create);
  router.put('/:id/role', controller.updateRole);
  router.put('/:id/password', controller.resetPassword);
  router.delete('/:id', controller.deactivate);
}

export default router;
