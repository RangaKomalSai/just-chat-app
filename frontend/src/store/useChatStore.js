import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  messages: [],
  chats: [],
  users: [],
  selectedChat: null,
  isChatsLoading: false,
  isUsersLoading: false,
  isMessagesLoading: false,
  unreadCounts: {}, // { chatId: count }

  // Get all chats (DM + groups)
  getChats: async () => {
    set({ isChatsLoading: true });
    try {
      const res = await axiosInstance.get("/chats");
      set({ chats: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load chats");
    } finally {
      set({ isChatsLoading: false });
    }
  },

  // Get all users for creating groups/DMs
  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load users");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  // Get or create DM chat
  getOrCreateDMChat: async (userId) => {
    try {
      const res = await axiosInstance.get(`/chats/dm/${userId}`);
      set({ selectedChat: res.data });

      // Join the chat room
      const socket = useAuthStore.getState().socket;
      if (socket) {
        socket.emit("joinChat", res.data._id);
      }

      // Refresh chats list
      get().getChats();
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create chat");
    }
  },

  // Create group chat or DM
  createGroupChat: async (groupData) => {
    try {
      // If only 1 participant, create/get DM instead
      if (groupData.participantIds.length === 1) {
        return await get().getOrCreateDMChat(groupData.participantIds[0]);
      }

      // Otherwise create group
      const res = await axiosInstance.post("/chats/group", groupData);

      // Join the new chat room
      const socket = useAuthStore.getState().socket;
      if (socket) {
        socket.emit("joinChat", res.data._id);
      }

      set({ chats: [res.data, ...get().chats], selectedChat: res.data });
      toast.success("Group created successfully");
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create group");
      throw error;
    }
  },

  // Update group chat
  updateGroupChat: async (chatId, updateData) => {
    try {
      const res = await axiosInstance.patch(`/chats/${chatId}`, updateData);

      // Update in chats list
      set({
        chats: get().chats.map((chat) =>
          chat._id === chatId ? res.data : chat
        ),
        selectedChat:
          get().selectedChat?._id === chatId ? res.data : get().selectedChat,
      });

      toast.success("Group updated successfully");
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update group");
      throw error;
    }
  },

  // Get messages for a chat
  getMessages: async (chatId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${chatId}`);
      set({ messages: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load messages");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  // Send message to chat
  sendMessage: async (messageData) => {
    const { selectedChat, messages } = get();
    if (!selectedChat) return;

    try {
      const res = await axiosInstance.post(
        `/messages/send/${selectedChat._id}`,
        messageData
      );
      set({ messages: [...messages, res.data] });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send message");
    }
  },

  // Subscribe to new messages
  subscribeToMessages: () => {
    const { selectedChat } = get();
    if (!selectedChat) return;

    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.on("newMessage", (newMessage) => {
      const { selectedChat, messages, unreadCounts } = get();
      const authUser = useAuthStore.getState().authUser;

      // Only add message if it's for the currently selected chat
      if (newMessage.chatId === selectedChat?._id) {
        set({ messages: [...messages, newMessage] });
      } else if (newMessage.senderId !== authUser._id) {
        // Increment unread count for other chats
        set({
          unreadCounts: {
            ...unreadCounts,
            [newMessage.chatId]: (unreadCounts[newMessage.chatId] || 0) + 1,
          },
        });
      }

      // Update the chat's lastMessage in the chats list
      set({
        chats: get().chats.map((chat) =>
          chat._id === newMessage.chatId
            ? {
                ...chat,
                lastMessage: newMessage,
                updatedAt: newMessage.createdAt,
              }
            : chat
        ),
      });
    });

    // Listen for missed messages
    socket.on("missedMessages", (missedMessages) => {
      console.log("Received missed messages:", missedMessages.length);

      const { selectedChat, messages, unreadCounts } = get();
      const authUser = useAuthStore.getState().authUser;

      // Count unread messages by chat
      const newUnreadCounts = { ...unreadCounts };
      missedMessages.forEach((msg) => {
        if (msg.senderId !== authUser._id && msg.chatId !== selectedChat?._id) {
          newUnreadCounts[msg.chatId] = (newUnreadCounts[msg.chatId] || 0) + 1;
        }
      });
      set({ unreadCounts: newUnreadCounts });

      // Add missed messages to the current chat if they belong to it
      if (selectedChat && missedMessages.length > 0) {
        const chatMissedMessages = missedMessages.filter(
          (msg) => msg.chatId === selectedChat._id
        );

        if (chatMissedMessages.length > 0) {
          // Merge with existing messages, avoiding duplicates
          const existingIds = new Set(messages.map((m) => m._id));
          const newMessages = chatMissedMessages.filter(
            (m) => !existingIds.has(m._id)
          );

          if (newMessages.length > 0) {
            set({
              messages: [...messages, ...newMessages].sort(
                (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
              ),
            });
          }
        }
      }

      // Update chats list with missed messages
      missedMessages.forEach((msg) => {
        set({
          chats: get().chats.map((chat) =>
            chat._id === msg.chatId
              ? {
                  ...chat,
                  lastMessage: msg,
                  updatedAt: msg.createdAt,
                }
              : chat
          ),
        });
      });
    });

    // Listen for message status updates
    socket.on("messageStatusUpdate", ({ messageId, userId, status }) => {
      const { messages } = get();

      set({
        messages: messages.map((msg) =>
          msg._id === messageId ? { ...msg, status } : msg
        ),
      });
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) {
      socket.off("newMessage");
      socket.off("missedMessages");
      socket.off("messageStatusUpdate");
    }
  },

  setSelectedChat: (chat) => {
    const socket = useAuthStore.getState().socket;
    const { selectedChat, unreadCounts } = get();

    // Leave previous chat room
    if (selectedChat && socket) {
      socket.emit("leaveChat", selectedChat._id);
    }

    // Join new chat room
    if (chat && socket) {
      socket.emit("joinChat", chat._id);

      // Clear unread count for this chat
      const newUnreadCounts = { ...unreadCounts };
      delete newUnreadCounts[chat._id];
      set({ unreadCounts: newUnreadCounts });
    }

    set({ selectedChat: chat });
  },

  // Legacy support - will be removed
  setSelectedUser: (user) => {
    if (user) {
      get().getOrCreateDMChat(user._id);
    } else {
      set({ selectedChat: null });
    }
  },
}));
