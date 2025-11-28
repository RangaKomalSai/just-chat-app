import Chat from "../models/chat.model.js";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import cloudinary from "../lib/cloudinary.js";

// Get all chats (DM + Groups) for the logged-in user
export const getChats = async (req, res) => {
  try {
    const userId = req.user._id;

    const chats = await Chat.find({
      "participants.userId": userId,
    })
      .populate("participants.userId", "fullName email profilePic")
      .populate("lastMessage")
      .sort({ updatedAt: -1 });

    res.status(200).json(chats);
  } catch (error) {
    console.error("Error in getChats: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Create a new group chat
export const createGroupChat = async (req, res) => {
  try {
    const { name, participantIds, groupPicture } = req.body;
    const creatorId = req.user._id;

    if (!name || !participantIds || participantIds.length === 0) {
      return res.status(400).json({
        message: "Group name and participants are required",
      });
    }

    // Verify all participants exist
    const users = await User.find({ _id: { $in: participantIds } });
    if (users.length !== participantIds.length) {
      return res.status(400).json({ message: "Invalid participant IDs" });
    }

    let groupPictureUrl = "";
    if (groupPicture) {
      const uploadResponse = await cloudinary.uploader.upload(groupPicture);
      groupPictureUrl = uploadResponse.secure_url;
    }

    // Build participants array with creator as admin
    const participants = [
      { userId: creatorId, role: "admin" },
      ...participantIds
        .filter((id) => id.toString() !== creatorId.toString())
        .map((id) => ({ userId: id, role: "member" })),
    ];

    const newGroupChat = new Chat({
      type: "group",
      name,
      participants,
      groupPicture: groupPictureUrl,
    });

    await newGroupChat.save();

    const populatedChat = await Chat.findById(newGroupChat._id).populate(
      "participants.userId",
      "fullName email profilePic"
    );

    res.status(201).json(populatedChat);
  } catch (error) {
    console.error("Error in createGroupChat: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update group chat (rename, change picture, add/remove members)
export const updateGroupChat = async (req, res) => {
  try {
    const { id: chatId } = req.params;
    const { name, groupPicture, addParticipants, removeParticipants } =
      req.body;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    if (chat.type !== "group") {
      return res.status(400).json({ message: "Can only update group chats" });
    }

    // Check if user is admin
    const userParticipant = chat.participants.find(
      (p) => p.userId.toString() === userId.toString()
    );

    if (!userParticipant || userParticipant.role !== "admin") {
      return res.status(403).json({
        message: "Only group admins can update the group",
      });
    }

    // Update name
    if (name) {
      chat.name = name;
    }

    // Update group picture
    if (groupPicture) {
      const uploadResponse = await cloudinary.uploader.upload(groupPicture);
      chat.groupPicture = uploadResponse.secure_url;
    }

    // Add participants
    if (addParticipants && addParticipants.length > 0) {
      const existingIds = chat.participants.map((p) => p.userId.toString());
      const newParticipants = addParticipants
        .filter((id) => !existingIds.includes(id.toString()))
        .map((id) => ({ userId: id, role: "member" }));

      chat.participants.push(...newParticipants);
    }

    // Remove participants
    if (removeParticipants && removeParticipants.length > 0) {
      chat.participants = chat.participants.filter(
        (p) => !removeParticipants.includes(p.userId.toString())
      );
    }

    await chat.save();

    const updatedChat = await Chat.findById(chatId)
      .populate("participants.userId", "fullName email profilePic")
      .populate("lastMessage");

    res.status(200).json(updatedChat);
  } catch (error) {
    console.error("Error in updateGroupChat: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get or create a DM chat between two users
export const getOrCreateDMChat = async (req, res) => {
  try {
    const { userId: otherUserId } = req.params;
    const currentUserId = req.user._id;

    if (currentUserId.toString() === otherUserId) {
      return res
        .status(400)
        .json({ message: "Cannot create DM with yourself" });
    }

    // Check if DM already exists
    let chat = await Chat.findOne({
      type: "dm",
      "participants.userId": { $all: [currentUserId, otherUserId] },
    })
      .populate("participants.userId", "fullName email profilePic")
      .populate("lastMessage");

    if (!chat) {
      // Create new DM chat
      chat = new Chat({
        type: "dm",
        participants: [
          { userId: currentUserId, role: "member" },
          { userId: otherUserId, role: "member" },
        ],
      });

      await chat.save();

      chat = await Chat.findById(chat._id).populate(
        "participants.userId",
        "fullName email profilePic"
      );
    }

    res.status(200).json(chat);
  } catch (error) {
    console.error("Error in getOrCreateDMChat: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
