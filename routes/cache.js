import express from "express";
import CacheController from "../controllers/CacheController.js";

const router = express.Router();

router.get("/get", CacheController.getCacheByDbName);
router.delete("/delete", CacheController.deleteCacheByDbName);

export default router;
