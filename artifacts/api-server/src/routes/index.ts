import { Router, type IRouter } from "express";
import healthRouter from "./health";
import wbRouter from "./wb";

const router: IRouter = Router();

router.use(healthRouter);
router.use(wbRouter);

export default router;
