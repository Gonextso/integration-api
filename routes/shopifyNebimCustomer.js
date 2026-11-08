import express from "express";
import ShopifyNebimCustomerController from "../controllers/ShopifyNebimCustomerController.js";
import ValidatorMiddleware from "../middlewares/ValidatorMiddleware.js";

const router = express.Router();

router.post("/consent/:communitaionType", ShopifyNebimCustomerController.updateConsent);
router.post("/sync_consents", ValidatorMiddleware.validateDatesFromQuery, ShopifyNebimCustomerController.syncConsents);

export default router;
