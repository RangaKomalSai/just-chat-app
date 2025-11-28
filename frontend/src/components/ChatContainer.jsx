import { FileText, Download } from "lucide-react";
import { useEffect, useRef } from "react";

import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { formatMessageTime } from "../lib/utils";
import { Check, CheckCheck } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";

const ChatContainer = () => {
  const {
    messages,
    getMessages,
    isMessagesLoading,
    selectedChat,
    subscribeToMessages,
    unsubscribeFromMessages,
  } = useChatStore();
  const { authUser, socket } = useAuthStore();
  const messageEndRef = useRef(null);

  // Helper function to extract file key from S3 URL
  const extractFileKey = (url) => {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.substring(1); // Remove leading slash
    } catch (error) {
      console.error("Error extracting file key:", error);
      return null;
    }
  };

  // Helper function to handle file download
  const handleDownload = async (fileUrl, fileName) => {
    try {
      toast.loading("Generating download link...", { id: "download" });

      // Extract file key from URL
      const fileKey = extractFileKey(fileUrl);
      if (!fileKey) {
        throw new Error("Invalid file URL");
      }

      // Get presigned download URL from backend (pass filename to force download name)
      const response = await axiosInstance.get(
        `/files/download/${encodeURIComponent(
          fileKey
        )}?fileName=${encodeURIComponent(fileName || "")}`
      );
      const { downloadUrl } = response.data;

      // Download file using presigned URL
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName || "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Download started", { id: "download" });
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download file", { id: "download" });
    }
  };

  useEffect(() => {
    if (!selectedChat) return;

    getMessages(selectedChat._id);
    subscribeToMessages();

    return () => unsubscribeFromMessages();
  }, [
    selectedChat?._id,
    getMessages,
    subscribeToMessages,
    unsubscribeFromMessages,
  ]);

  useEffect(() => {
    if (messageEndRef.current && messages) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }

    // Mark messages as seen when viewing them
    if (messages.length > 0 && selectedChat && socket) {
      const unseenMessages = messages.filter(
        (msg) => msg.senderId._id !== authUser._id && msg.status !== "seen"
      );

      unseenMessages.forEach((msg) => {
        socket.emit("messageSeen", {
          messageId: msg._id,
          chatId: selectedChat._id,
        });
      });
    }
  }, [messages, selectedChat, socket, authUser]);

  // Helper to render message status icon
  const renderMessageStatus = (message) => {
    if (!message.status) return null;

    switch (message.status) {
      case "sent":
        return <Check size={14} className="inline ml-1 opacity-50" />;
      case "delivered":
        return <CheckCheck size={14} className="inline ml-1 opacity-50" />;
      case "seen":
        return <CheckCheck size={14} className="inline ml-1 text-blue-500" />;
      default:
        return null;
    }
  };

  if (isMessagesLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-auto">
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <ChatHeader />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => {
          const isSentByMe = message.senderId._id === authUser._id;

          return (
            <div
              key={message._id}
              className={`chat ${isSentByMe ? "chat-end" : "chat-start"}`}
              ref={messageEndRef}
            >
              <div className="chat-image avatar">
                <div className="size-10 rounded-full border">
                  <img
                    src={message.senderId.profilePic || "/avatar.png"}
                    alt="profile pic"
                  />
                </div>
              </div>
              <div className="chat-header mb-1">
                {selectedChat.type === "group" && !isSentByMe && (
                  <span className="text-sm font-medium mr-2">
                    {message.senderId.fullName}
                  </span>
                )}
                <time className="text-xs opacity-50 ml-1">
                  {formatMessageTime(message.createdAt)}
                </time>
                {isSentByMe && renderMessageStatus(message)}
              </div>
              <div className="chat-bubble flex flex-col">
                {message.image && (
                  <img
                    src={message.image}
                    alt="Attachment"
                    className="sm:max-w-[200px] rounded-md mb-2"
                  />
                )}
                {message.file && message.file.url && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-base-200 mb-2">
                    <FileText size={24} className="text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {message.file.name}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {(message.file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        handleDownload(message.file.url, message.file.name)
                      }
                      className="btn btn-circle btn-sm"
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                )}
                {message.text && <p>{message.text}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <MessageInput />
    </div>
  );
};
export default ChatContainer;
