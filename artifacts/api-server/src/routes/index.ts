import { Router, type IRouter } from "express";
import healthRouter from "./health";
import wbRouter from "./wb";
import ozonApiRouter from "./ozon-api";
import ymApiRouter from "./ym-api";

const router: IRouter = Router();

router.use(healthRouter);
router.use(wbRouter);
router.use(ozonApiRouter);
router.use(ymApiRouter);

export default router;
