import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["dm", "group"],
      required: true,
    },
    participants: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["admin", "member"],
          default: "member",
        },
      },
    ],
    name: {
      type: String,
      // Required for group chats, optional for DMs
      required: function () {
        return this.type === "group";
      },
    },
    groupPicture: {
      type: String,
      default: "",
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
  },
  { timestamps: true }
);

// Index for faster lookups
chatSchema.index({ "participants.userId": 1 });
chatSchema.index({ type: 1 });

const Chat = mongoose.model("Chat", chatSchema);

export default Chat;
