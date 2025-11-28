import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";

import path from "path";

import { connectDB } from "./lib/db.js";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import chatRoutes from "./routes/chat.route.js";
import fileRoutes from "./routes/file.route.js";
import { app, server, setupSocketIO } from "./lib/socket.js";
import { httpRequestsTotal, registry } from "./monitoring/metrics.js";

dotenv.config();

const PORT = process.env.PORT || 5001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const __dirname = path.resolve();

// Trust proxy - important for deployment behind Nginx/load balancers
app.set("trust proxy", 1);

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use((req, res, next) => {
  httpRequestsTotal.inc();
  next();
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/files", fileRoutes);

// Start server with Redis and Socket.IO setup
const startServer = async () => {
  try {
    await setupSocketIO();
    await connectDB();

    server.listen(PORT, () => {
      console.log("Server is running on PORT:" + PORT);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
