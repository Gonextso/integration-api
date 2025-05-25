import express from "express";
import ShopifyNebimOrderController from "../controllers/ShopifyNebimOrderController.js";
import ValidatorMiddleware from "../middlewares/ValidatorMiddleware.js";

const router = express.Router();

router.get("/sync", ValidatorMiddleware.validateDatesFromQuery ,ShopifyNebimOrderController.sync);

export default router;