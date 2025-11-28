import express from "express";
import {
  generatePresignedUrl,
  generateDownloadUrl,
  getFileStats,
} from "../controllers/file.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Generate presigned URL for uploading files
router.post("/presign", protectRoute, generatePresignedUrl);

// Generate presigned URL for downloading files (if needed)
router.get("/download/:fileKey", protectRoute, generateDownloadUrl);

// Get file upload statistics
router.get("/stats", protectRoute, getFileStats);

export default router;
