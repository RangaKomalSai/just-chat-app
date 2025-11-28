import { X, Settings, Users } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useState } from "react";
import EditGroupModal from "./EditGroupModal";

const ChatHeader = () => {
  const { selectedChat, setSelectedChat } = useChatStore();
  const { onlineUsers, authUser } = useAuthStore();
  const [isEditGroupOpen, setIsEditGroupOpen] = useState(false);

  if (!selectedChat) return null;

  // Check if current user is admin
  const isAdmin =
    selectedChat.type === "group" &&
    selectedChat.participants.some(
      (p) => p.userId._id === authUser._id && p.role === "admin"
    );

  // Get display info based on chat type
  const getDisplayInfo = () => {
    if (selectedChat.type === "group") {
      return {
        name: selectedChat.name,
        picture: selectedChat.groupPicture || "/avatar.png",
        subtitle: `${selectedChat.participants.length} members`,
      };
    } else {
      // DM chat - find the other user
      const otherUser = selectedChat.participants.find(
        (p) => p.userId._id !== authUser._id
      )?.userId;

      const isOnline = otherUser ? onlineUsers.includes(otherUser._id) : false;

      return {
        name: otherUser?.fullName || "Unknown User",
        picture: otherUser?.profilePic || "/avatar.png",
        subtitle: isOnline ? "Online" : "Offline",
        isOnline,
      };
    }
  };

  const displayInfo = getDisplayInfo();

  return (
    <>
      <div className="p-2.5 border-b border-base-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="avatar">
              <div className="size-10 rounded-full relative">
                <img src={displayInfo.picture} alt={displayInfo.name} />
                {selectedChat.type === "group" && (
                  <span
                    className="absolute bottom-0 right-0 size-4 bg-primary 
                    rounded-full ring-2 ring-base-100 flex items-center justify-center"
                  >
                    <Users className="size-2.5 text-primary-content" />
                  </span>
                )}
                {selectedChat.type === "dm" && displayInfo.isOnline && (
                  <span
                    className="absolute bottom-0 right-0 size-3 bg-green-500 
                    rounded-full ring-2 ring-base-100"
                  />
                )}
              </div>
            </div>

            {/* Chat info */}
            <div>
              <h3 className="font-medium">{displayInfo.name}</h3>
              <p className="text-sm text-base-content/70">
                {displayInfo.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Edit group button (only for group admins) */}
            {isAdmin && (
              <button
                onClick={() => setIsEditGroupOpen(true)}
                className="btn btn-sm btn-circle btn-ghost"
                title="Group Settings"
              >
                <Settings size={18} />
              </button>
            )}

            {/* Close button */}
            <button
              onClick={() => setSelectedChat(null)}
              className="btn btn-sm btn-circle btn-ghost"
            >
              <X />
            </button>
          </div>
        </div>
      </div>

      {selectedChat.type === "group" && (
        <EditGroupModal
          isOpen={isEditGroupOpen}
          onClose={() => setIsEditGroupOpen(false)}
          chat={selectedChat}
        />
      )}
    </>
  );
};
export default ChatHeader;
