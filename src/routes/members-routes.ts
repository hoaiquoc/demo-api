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
}

export default router;

