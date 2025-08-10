import express from "express";
import ShopifyNebimCustomerController from "../controllers/ShopifyNebimCustomerController.js";

const router = express.Router();

router.post("/consent/:communitaionType", ShopifyNebimCustomerController.updateConsent);

export default router;