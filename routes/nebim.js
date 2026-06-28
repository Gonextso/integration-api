import express from "express";
import NebimConnectionController from "../controllers/NebimConnectionController.js";
import InputValidationController from "../controllers/InputValidationController.js";
import CustomerSetupController from "../controllers/CustomerSetupController.js";
import ProductSetupController from "../controllers/ProductSetupController.js";
import OrderSetupController from "../controllers/OrderSetupController.js";

const router = express.Router();

router.post("/check", NebimConnectionController.check);
router.post("/input-validation", InputValidationController.run);
router.post("/customer/setup-test", CustomerSetupController.run);
router.post("/product/setup-test", ProductSetupController.run);
router.post("/order/setup-test", OrderSetupController.run);

export default router;