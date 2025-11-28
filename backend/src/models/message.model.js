import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
    },
    image: {
      type: String,
    },
    // File attachments (S3 or other storage)
    file: {
      url: {
        type: String,
      },
      name: {
        type: String,
      },
      size: {
        type: Number,
      },
      type: {
        type: String, // MIME type
      },
      storage: {
        type: String,
        enum: ["s3", "cloudinary", "local"],
        default: "cloudinary",
      },
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
    },
    deliveryStatus: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ["sent", "delivered", "seen"],
          default: "sent",
        },
        deliveredAt: {
          type: Date,
        },
        seenAt: {
          type: Date,
        },
      },
    ],
  },
  { timestamps: true }
);

// Index for faster message queries by chat
messageSchema.index({ chatId: 1, createdAt: -1 });
// Index for finding undelivered messages for a user
messageSchema.index({ "deliveryStatus.userId": 1, "deliveryStatus.status": 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
