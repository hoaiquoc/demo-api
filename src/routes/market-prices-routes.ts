import { Router } from 'express';
import { MarketPricesController } from '../controllers/market-prices-controller';

const router = Router();
const controller = new MarketPricesController();

router.get('/gold', controller.getGoldCurrent);

export default router;

