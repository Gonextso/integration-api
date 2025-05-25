import express from "express";
import DevelopmentController from "../controllers/DevelopmentController.js";

const router = express.Router();

router.get("/get_all_companies", DevelopmentController.getAllCompanies);

export default router;