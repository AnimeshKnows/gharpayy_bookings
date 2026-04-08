import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bookingsRouter from "./bookings";
import authRouter from "./auth";
import zonesRouter from "./zones";
import teammatesRouter from "./teammates";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(zonesRouter);
router.use(teammatesRouter);
router.use(bookingsRouter);

export default router;
