import express from "express";
import ShopifyNebimProductController from "../controllers/ShopifyNebimProductController.js";
import ValidatorMiddleware from "../middlewares/ValidatorMiddleware.js";

const router = express.Router();

router.post("/sync_details", ValidatorMiddleware.validateDatesFromQuery, ShopifyNebimProductController.syncDetails);
router.post("/sync_inventory", ValidatorMiddleware.validateDatesFromQuery, ShopifyNebimProductController.syncInventory);
router.post("/sync_find_in_store", ValidatorMiddleware.validateDatesFromQuery, ShopifyNebimProductController.syncFindInStore);
router.post("/sync_market_prices", ValidatorMiddleware.validateDatesFromQuery, ShopifyNebimProductController.syncMarketPrices);
router.post("/sync_market_content", ValidatorMiddleware.validateDatesFromQuery, ShopifyNebimProductController.syncMarketContent);

export default router;