import express from "express";
import NebimConnectionController from "../controllers/NebimConnectionController.js";

const router = express.Router();

router.get("/check", NebimConnectionController.check);

export default router;