import { useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { Image, Send, X, File } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";

const MessageInput = () => {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const { sendMessage } = useChatStore();

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSize) {
      toast.error("File size exceeds 10MB limit");
      return;
    }

    // Handle all files (including images) via S3
    setSelectedFile(file);
    
    // Show preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
    
    toast.success(`File selected: ${file.name}`);
  };

  const removeImage = () => {
    setImagePreview(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadFileToS3 = async (file) => {
    try {
      // Step 1: Get presigned URL from backend
      const presignResponse = await axiosInstance.post("/files/presign", {
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      });

      const { uploadUrl, fileUrl } = presignResponse.data;

      // Step 2: Upload file directly to S3
      await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      return {
        url: fileUrl,
        name: file.name,
        size: file.size,
        type: file.type,
        storage: "s3",
      };
    } catch (error) {
      console.error("S3 upload failed:", error);
      throw error;
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() && !selectedFile) return;

    setIsUploading(true);

    try {
      let fileData = null;

      // Upload file to S3 if selected (includes images)
      if (selectedFile) {
        toast.loading(`Uploading ${selectedFile.name}...`, { id: "upload" });
        fileData = await uploadFileToS3(selectedFile);
        toast.success("File uploaded successfully!", { id: "upload" });
      }

      await sendMessage({
        text: text.trim(),
        file: fileData, // All files via S3 (including images)
      });

      // Clear form
      setText("");
      setImagePreview(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message", { id: "upload" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-4 w-full">
      {selectedFile && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative">
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Preview"
                className="w-20 h-20 object-cover rounded-lg border border-zinc-700"
              />
            ) : (
              <div className="w-20 h-20 flex items-center justify-center rounded-lg border border-zinc-700 bg-base-200">
                <File size={32} className="text-zinc-400" />
              </div>
            )}
            <button
              onClick={removeImage}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-base-300
              flex items-center justify-center"
              type="button"
            >
              <X className="size-3" />
            </button>
          </div>
          <div className="text-sm">
            <p className="font-medium">{selectedFile.name}</p>
            <p className="text-zinc-400">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="flex items-center gap-2">
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            className="w-full input input-bordered rounded-lg input-sm sm:input-md"
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isUploading}
          />
          <input
            type="file"
            accept="*/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImageChange}
          />

          <button
            type="button"
            className={`hidden sm:flex btn btn-circle
                     ${selectedFile ? "text-emerald-500" : "text-zinc-400"}`}
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Image size={20} />
          </button>
        </div>
        <button
          type="submit"
          className="btn btn-sm btn-circle"
          disabled={
            (!text.trim() && !selectedFile) || isUploading
          }
        >
          {isUploading ? (
            <span className="loading loading-spinner loading-sm"></span>
          ) : (
            <Send size={22} />
          )}
        </button>
      </form>
    </div>
  );
};
export default MessageInput;
