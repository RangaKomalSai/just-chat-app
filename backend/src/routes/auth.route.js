import express from "express";
import {
  checkAuth,
  login,
  logout,
  logoutAll,
  refreshAccessToken,
  signup,
  updateProfile,
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.post("/logout-all", protectRoute, logoutAll);

// Refresh token endpoint - no auth middleware needed (uses refresh token)
router.post("/refresh", refreshAccessToken);

router.put("/update-profile", protectRoute, updateProfile);

router.get("/check", protectRoute, checkAuth);

export default router;
