import { create } from "zustand";
import { axiosInstance } from "../lib/axios.js";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

const BASE_URL =
  import.meta.env.MODE === "development" ? "http://localhost:5001" : "/";

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,

  checkAuth: async () => {
    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });
      get().connectSocket();
    } catch (error) {
      console.log("Error in Auth:");
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  refreshToken: async () => {
    try {
      const res = await axiosInstance.post("/auth/refresh");
      const newAccessToken = res.data.accessToken;

      // Update authUser with new access token for Socket.IO
      const currentUser = get().authUser;
      if (currentUser && newAccessToken) {
        set({ authUser: { ...currentUser, accessToken: newAccessToken } });
      }

      return newAccessToken;
    } catch (error) {
      console.log("Failed to refresh token");
      set({ authUser: null });
      return null;
    }
  },

  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/signup", data);
      set({ authUser: res.data });
      toast.success("Account created successfully");
      get().connectSocket();
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isSigningUp: false });
    }
  },

  login: async (data) => {
    set({ isLoggingIn: true });
    try {
      const res = await axiosInstance.post("/auth/login", data);
      set({ authUser: res.data });
      toast.success("Logged in successfully");

      get().connectSocket();
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isLoggingIn: false });
    }
  },

  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      set({ authUser: null });
      toast.success("Logged out successfully");
      get().disconnectSocket();
    } catch (error) {
      toast.error(error.response.data.message);
    }
  },

  updateProfile: async (data, options = {}) => {
    const showToast = options.showToast !== false;
    set({ isUpdatingProfile: true });
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      set({ authUser: res.data });
      if (showToast) toast.success("Profile updated successfully");
      return res.data;
    } catch (error) {
      console.log("error in update profile:");
      if (showToast)
        toast.error(
          error.response?.data?.message || "Failed to update profile"
        );
      throw error;
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

  connectSocket: () => {
    const { authUser } = get();
    if (!authUser || get().socket?.connected) return;

    // Use access token for Socket.IO authentication
    const accessToken = authUser.accessToken;

    const socket = io(BASE_URL, {
      query: {
        accessToken: accessToken,
      },
      auth: {
        token: accessToken,
      },
    });
    socket.connect();

    set({ socket: socket });

    socket.on("getOnlineUsers", (userIds) => {
      set({ onlineUsers: userIds });
    });

    // Socket will auto-join chat rooms on the server side
    // Listen for join confirmations if needed for debugging
    socket.on("connect", () => {
      console.log("Socket connected:");
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected");
    });

    // Handle authentication errors
    socket.on("connect_error", async (error) => {
      console.log("Socket connection error");
      // If token expired, try to refresh and reconnect
      if (error.message.includes("jwt")) {
        const newToken = await get().refreshToken();
        if (newToken) {
          // Update authUser with new token
          set({ authUser: { ...authUser, accessToken: newToken } });
          // Reconnect with new token
          get().disconnectSocket();
          get().connectSocket();
        }
      }
    });
  },
  disconnectSocket: () => {
    if (get().socket?.connected) get().socket.disconnect();
  },
}));
