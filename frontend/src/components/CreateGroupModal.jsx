import { useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { X, Users as UsersIcon, Image } from "lucide-react";
import toast from "react-hot-toast";

const CreateGroupModal = ({ isOpen, onClose }) => {
  const { users, createGroupChat } = useChatStore();
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupPicture, setGroupPicture] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const filteredUsers = users.filter((user) =>
    user.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleUserSelection = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

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

  const handleCreateGroup = async (e) => {
    e.preventDefault();

    if (selectedUsers.length === 0) {
      toast.error("Please select at least one member");
      return;
    }

    // If only 1 user selected, validate group name is not needed
    if (selectedUsers.length > 1 && !groupName.trim()) {
      toast.error("Please enter a group name");
      return;
    }

    setIsCreating(true);
    try {
      await createGroupChat({
        name: groupName,
        participantIds: selectedUsers,
        groupPicture: groupPicture || "",
      });

      // Reset form
      setGroupName("");
      setSelectedUsers([]);
      setGroupPicture(null);
      setSearchQuery("");
      onClose();
    } catch (error) {
      // Error already handled in store
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-base-100 rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-base-300">
          <h2 className="text-xl font-semibold">Create Group</h2>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost"
            disabled={isCreating}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleCreateGroup}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Group Picture */}
            <div className="flex items-center gap-4">
              <div className="avatar">
                <div className="w-20 h-20 rounded-full bg-base-300 flex items-center justify-center overflow-hidden">
                  {groupPicture ? (
                    <img
                      src={groupPicture}
                      alt="Group"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UsersIcon size={32} className="text-base-content/50" />
                  )}
                </div>
              </div>
              <label className="btn btn-sm btn-outline">
                <Image size={16} />
                Upload Photo
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

            {/* Members Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Add Members ({selectedUsers.length} selected)
              </label>
              <input
                type="text"
                className="input input-bordered w-full mb-3"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <div className="space-y-2 max-h-60 overflow-y-auto border border-base-300 rounded-lg p-2">
                {filteredUsers.length === 0 ? (
                  <p className="text-center text-base-content/50 py-4">
                    No users found
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
                        checked={selectedUsers.includes(user._id)}
                        onChange={() => toggleUserSelection(user._id)}
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
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={
                isCreating ||
                selectedUsers.length === 0 ||
                (selectedUsers.length > 1 && !groupName.trim())
              }
            >
              {isCreating ? (
                <>
                  <span className="loading loading-spinner"></span>
                  Creating...
                </>
              ) : (
                "Create Group"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGroupModal;
