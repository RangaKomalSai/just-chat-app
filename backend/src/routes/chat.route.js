import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getChats,
  createGroupChat,
  updateGroupChat,
  getOrCreateDMChat,
} from "../controllers/chat.controller.js";

const router = express.Router();

router.get("/", protectRoute, getChats);
router.post("/group", protectRoute, createGroupChat);
router.patch("/:id", protectRoute, updateGroupChat);
router.get("/dm/:userId", protectRoute, getOrCreateDMChat);

export default router;
