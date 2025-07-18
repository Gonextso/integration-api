import express from "express";
import ShopifyNebimOrderController from "../controllers/ShopifyNebimOrderController.js";
import ValidatorMiddleware from "../middlewares/ValidatorMiddleware.js";

const router = express.Router();

router.post("/sync", ValidatorMiddleware.validateDatesFromQuery, ShopifyNebimOrderController.sync);
router.get("/sync_failed", ShopifyNebimOrderController.getSyncFailedOrders);
router.post("/sync_failed", ValidatorMiddleware.isRequestBodyExists, ShopifyNebimOrderController.syncFailedOrders);
router.post("/sync_order_status", ValidatorMiddleware.validateDatesFromQuery, ShopifyNebimOrderController.syncOrderStatus);

export default router;