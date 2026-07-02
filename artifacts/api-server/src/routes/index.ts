import { Router, type IRouter } from "express";
import healthRouter from "./health";
import packagesRouter from "./packages";

const router: IRouter = Router();

router.use(healthRouter);
router.use(packagesRouter);

export default router;
