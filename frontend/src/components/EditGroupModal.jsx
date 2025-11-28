import { useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { X, Image, UserPlus, UserMinus } from "lucide-react";
import toast from "react-hot-toast";

const EditGroupModal = ({ isOpen, onClose, chat }) => {
  const { users, updateGroupChat } = useChatStore();
  const { authUser } = useAuthStore();
  const [groupName, setGroupName] = useState(chat?.name || "");
  const [groupPicture, setGroupPicture] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [membersToAdd, setMembersToAdd] = useState([]);
  const [membersToRemove, setMembersToRemove] = useState([]);
  const [isUpdating, setIsUpdating] = useState(false);

  if (!chat || chat.type !== "group") return null;

  const currentMemberIds = chat.participants.map((p) => p.userId._id);
  const availableUsers = users.filter(
    (user) => !currentMemberIds.includes(user._id)
  );

  const filteredUsers = availableUsers.filter((user) =>
    user.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setGroupPicture(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const toggleAddMember = (userId) => {
    setMembersToAdd((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleRemoveMember = (userId) => {
    setMembersToRemove((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleUpdateGroup = async (e) => {
    e.preventDefault();

    const updateData = {};

    if (groupName !== chat.name) {
      updateData.name = groupName;
    }

    if (groupPicture) {
      updateData.groupPicture = groupPicture;
    }

    if (membersToAdd.length > 0) {
      updateData.addParticipants = membersToAdd;
    }

    if (membersToRemove.length > 0) {
      updateData.removeParticipants = membersToRemove;
    }

    if (Object.keys(updateData).length === 0) {
      toast.error("No changes to save");
      return;
    }

    setIsUpdating(true);
    try {
      await updateGroupChat(chat._id, updateData);

      // Reset form
      setGroupPicture(null);
      setMembersToAdd([]);
      setMembersToRemove([]);
      setSearchQuery("");
      onClose();
    } catch (error) {
      // Error already handled in store
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-base-100 rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-base-300">
          <h2 className="text-xl font-semibold">Edit Group</h2>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost"
            disabled={isUpdating}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleUpdateGroup}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Group Picture */}
            <div className="flex items-center gap-4">
              <div className="avatar">
                <div className="w-20 h-20 rounded-full bg-base-300 flex items-center justify-center overflow-hidden">
                  <img
                    src={groupPicture || chat.groupPicture || "/avatar.png"}
                    alt="Group"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <label className="btn btn-sm btn-outline">
                <Image size={16} />
                Change Photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
              </label>
            </div>

            {/* Group Name */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Group Name
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                placeholder="Enter group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={50}
              />
            </div>

            {/* Current Members */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Current Members ({chat.participants.length})
              </label>
              <div className="space-y-2 max-h-40 overflow-y-auto border border-base-300 rounded-lg p-2">
                {chat.participants.map((participant) => {
                  const isMe = participant.userId._id === authUser._id;
                  const isAdmin = participant.role === "admin";

                  return (
                    <div
                      key={participant.userId._id}
                      className="flex items-center gap-3 p-2 bg-base-200 rounded-lg"
                    >
                      <img
                        src={participant.userId.profilePic || "/avatar.png"}
                        alt={participant.userId.fullName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {participant.userId.fullName}
                          {isMe && " (You)"}
                        </p>
                        <p className="text-xs text-base-content/60">
                          {isAdmin ? "Admin" : "Member"}
                        </p>
                      </div>
                      {!isMe && !isAdmin && (
                        <button
                          type="button"
                          onClick={() =>
                            toggleRemoveMember(participant.userId._id)
                          }
                          className={`btn btn-sm btn-circle ${
                            membersToRemove.includes(participant.userId._id)
                              ? "btn-error"
                              : "btn-ghost"
                          }`}
                        >
                          <UserMinus size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add Members */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Add Members ({membersToAdd.length} selected)
              </label>
              <input
                type="text"
                className="input input-bordered w-full mb-3"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <div className="space-y-2 max-h-40 overflow-y-auto border border-base-300 rounded-lg p-2">
                {filteredUsers.length === 0 ? (
                  <p className="text-center text-base-content/50 py-4">
                    {availableUsers.length === 0
                      ? "All users are members"
                      : "No users found"}
                  </p>
                ) : (
                  filteredUsers.map((user) => (
                    <label
                      key={user._id}
                      className="flex items-center gap-3 p-2 hover:bg-base-300 rounded-lg cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={membersToAdd.includes(user._id)}
                        onChange={() => toggleAddMember(user._id)}
                      />
                      <img
                        src={user.profilePic || "/avatar.png"}
                        alt={user.fullName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{user.fullName}</p>
                        <p className="text-sm text-base-content/60 truncate">
                          {user.email}
                        </p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-base-300 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost flex-1"
              disabled={isUpdating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <span className="loading loading-spinner"></span>
                  Updating...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditGroupModal;
