import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Chat from "../models/chat.model.js";

import cloudinary from "../lib/cloudinary.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import redisClient from "../lib/redisClient.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({
      _id: { $ne: loggedInUserId },
    }).select("-password");

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: chatId } = req.params;
    const myId = req.user._id;

    // Verify user is participant in this chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    const isParticipant = chat.participants.some(
      (p) => p.userId.toString() === myId.toString()
    );

    if (!isParticipant) {
      return res
        .status(403)
        .json({ error: "Not authorized to view this chat" });
    }

    const messages = await Message.find({ chatId })
      .populate("senderId", "fullName profilePic")
      .sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image, file } = req.body;
    const { id: chatId } = req.params;
    const senderId = req.user._id;

    // Verify chat exists and user is participant
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    const isParticipant = chat.participants.some(
      (p) => p.userId.toString() === senderId.toString()
    );

    if (!isParticipant) {
      return res
        .status(403)
        .json({ error: "Not authorized to send messages to this chat" });
    }

    let imageUrl;
    let fileData;

    // Handle image upload (legacy Cloudinary support)
    if (image) {
      // Upload base64 image to cloudinary
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    // Handle file attachment (S3 or Cloudinary)
    if (file && file.url) {
      fileData = {
        url: file.url,
        name: file.name,
        size: file.size,
        type: file.type,
        storage: file.storage || "s3",
      };
    }

    // Determine recipients (all participants except sender)
    const recipients = chat.participants
      .map((p) => p.userId.toString())
      .filter((id) => id !== senderId.toString());

    // Initialize delivery status for each recipient
    const deliveryStatus = recipients.map((recipientId) => ({
      userId: recipientId,
      status: "sent",
    }));

    const newMessage = new Message({
      chatId,
      senderId,
      text,
      image: imageUrl,
      file: fileData,
      status: "sent",
      deliveryStatus,
    });

    await newMessage.save();

    // Publish message event to Redis Stream for analytics pipeline
    try {
      await redisClient.addToStream("chat:messages", {
        messageId: newMessage._id.toString(),
        chatId: chatId.toString(),
        senderId: senderId.toString(),
        timestamp: new Date().toISOString(),
        hasImage: imageUrl ? "true" : "false",
        hasFile: fileData ? "true" : "false",
        fileType: fileData?.type || "none",
      });
    } catch (streamError) {
      console.error("Failed to publish to Redis Stream:", streamError);
      // Don't fail the request if stream publish fails
    }

    // Update chat's lastMessage
    chat.lastMessage = newMessage._id;
    chat.updatedAt = new Date();
    await chat.save();

    // Populate sender info before emitting
    await newMessage.populate("senderId", "fullName profilePic");

    // Emit to recipients and update delivery status
    for (const recipientId of recipients) {
      const recipientSocketId = await getReceiverSocketId(recipientId);

      if (recipientSocketId) {
        // Recipient is online - emit message and mark as delivered
        io.to(recipientSocketId).emit("newMessage", newMessage);

        // Update delivery status to delivered
        await Message.updateOne(
          { _id: newMessage._id, "deliveryStatus.userId": recipientId },
          {
            $set: {
              "deliveryStatus.$.status": "delivered",
              "deliveryStatus.$.deliveredAt": new Date(),
            },
          }
        );
      }
      // If offline, status remains "sent" - will be delivered on reconnect
    }

    // Update overall message status if at least one recipient got it
    const onlineRecipientChecks = await Promise.all(
      recipients.map((id) => getReceiverSocketId(id))
    );
    const onlineRecipients = onlineRecipientChecks.filter(Boolean);
    if (onlineRecipients.length > 0) {
      newMessage.status = "delivered";
      await newMessage.save();
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
