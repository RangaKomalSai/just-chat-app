import { Server } from "socket.io";
import http from "http";
import express from "express";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import redisClient from "./redisClient.js";
import { activeSocketsGuage } from "../monitoring/metrics.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  },
});

// Setup Redis adapter for Socket.IO (enables Pub/Sub across instances)
export async function setupSocketIO() {
  try {
    await redisClient.connect();

    // Configure Socket.IO to use Redis adapter
    io.adapter(
      createAdapter(redisClient.getPubClient(), redisClient.getSubClient())
    );
    console.log("Socket.IO Redis adapter configured");
  } catch (error) {
    console.error("Failed to setup Socket.IO Redis adapter:", error);
    throw error;
  }
}

export async function getReceiverSocketId(userId) {
  return await redisClient.getUserSocketId(userId);
}

io.on("connection", async (socket) => {
  activeSocketsGuage.inc();
  console.log("A user connected", socket.id);

  // Authenticate using access token from query params
  const accessToken = socket.handshake.query.accessToken;

  if (!accessToken) {
    // console.log("No access token provided, disconnecting");
    socket.disconnect();
    return;
  }

  try {
    // Verify access token
    const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // Store userId on socket for later use
    socket.userId = userId;
    // Store user online status in Redis
    await redisClient.setUserOnline(userId, socket.id);

    // Join all chat rooms the user is part of
    try {
      const userChats = await Chat.find({
        "participants.userId": userId,
      }).select("_id");

      userChats.forEach((chat) => {
        socket.join(`chat:${chat._id}`);
        console.log(`User ${userId} joined room chat:${chat._id}`);
      });

      // Query and deliver missed messages
      const missedMessages = await Message.find({
        "deliveryStatus.userId": userId,
        "deliveryStatus.status": "sent",
      })
        .populate("senderId", "fullName profilePic")
        .sort({ createdAt: 1 });

      if (missedMessages.length > 0) {
        // console.log(
        //   `Delivering ${missedMessages.length} missed messages to user ${userId}`
        // );

        // Emit missed messages
        socket.emit("missedMessages", missedMessages);

        // Update delivery status to delivered
        const messageIds = missedMessages.map((msg) => msg._id);
        await Message.updateMany(
          {
            _id: { $in: messageIds },
            "deliveryStatus.userId": userId,
          },
          {
            $set: {
              "deliveryStatus.$.status": "delivered",
              "deliveryStatus.$.deliveredAt": new Date(),
            },
          }
        );

        // Update overall message status to delivered
        for (const message of missedMessages) {
          const allDelivered = message.deliveryStatus.every(
            (ds) => ds.userId.toString() === userId || ds.status === "delivered"
          );

          if (allDelivered) {
            await Message.updateOne(
              { _id: message._id },
              { $set: { status: "delivered" } }
            );
          }
        }
      }
    } catch (error) {
      console.error("Error handling user connection:", error);
    }

    // Broadcast online users to all clients
    const onlineUserIds = await redisClient.getOnlineUserIds();
    io.emit("getOnlineUsers", onlineUserIds);

    // Handle joining a new chat room (for newly created chats)
    socket.on("joinChat", (chatId) => {
      socket.join(`chat:${chatId}`);
      console.log(`User ${userId} joined room chat:${chatId}`);
    });

    // Handle leaving a chat room
    socket.on("leaveChat", (chatId) => {
      socket.leave(`chat:${chatId}`);
      console.log(`User ${userId} left room chat:${chatId}`);
    });

    // Handle message seen acknowledgment
    socket.on("messageSeen", async ({ messageId, chatId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;

        // Update delivery status for this user to seen
        await Message.updateOne(
          { _id: messageId, "deliveryStatus.userId": userId },
          {
            $set: {
              "deliveryStatus.$.status": "seen",
              "deliveryStatus.$.seenAt": new Date(),
            },
          }
        );

        // Check if all recipients have seen the message
        const updatedMessage = await Message.findById(messageId);
        const allSeen = updatedMessage.deliveryStatus.every(
          (ds) => ds.status === "seen"
        );

        if (allSeen) {
          updatedMessage.status = "seen";
          await updatedMessage.save();
        }

        // Notify sender about seen status
        io.to(`chat:${chatId}`).emit("messageStatusUpdate", {
          messageId,
          userId,
          status: "seen",
        });
      } catch (error) {
        console.error("Error updating message seen status:", error);
      }
    });

    socket.on("disconnect", async () => {
      activeSocketsGuage.dec();
      console.log("A user disconnected", socket.id);

      // Remove user from Redis online users
      if (userId) {
        await redisClient.setUserOffline(userId);
      }

      // Broadcast updated online users list
      const onlineUserIds = await redisClient.getOnlineUserIds();
      io.emit("getOnlineUsers", onlineUserIds);
    });
  } catch (error) {
    console.error("Socket authentication failed:", error.message);
    socket.disconnect();
  }
});

export { io, app, server };
