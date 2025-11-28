import s3Service from "../lib/s3.js";

/**
 * Generate presigned URL for file upload
 * POST /api/files/presign
 */
export const generatePresignedUrl = async (req, res) => {
  try {
    const { fileName, contentType } = req.body;

    if (!fileName || !contentType) {
      return res.status(400).json({
        error: "fileName and contentType are required",
      });
    }

    // Validate file size (optional - can be enforced on S3 bucket policy)
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    if (req.body.fileSize && req.body.fileSize > maxFileSize) {
      return res.status(400).json({
        error: "File size exceeds 10MB limit",
      });
    }

    // Get file metadata
    const metadata = s3Service.getFileMetadata(fileName, contentType);

    // Generate presigned URL
    const { uploadUrl, fileUrl, fileKey, expiresAt } =
      await s3Service.generatePresignedUploadUrl(fileName, contentType);

    res.status(200).json({
      uploadUrl,
      fileUrl,
      fileKey,
      expiresAt,
      metadata,
      instructions: {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
        },
        note: "Upload the file directly to uploadUrl using PUT request",
      },
    });
  } catch (error) {
    console.error("Error in generatePresignedUrl:", error);
    res.status(500).json({ error: "Failed to generate presigned URL" });
  }
};

/**
 * Generate presigned URL for file download
 * GET /api/files/download/:fileKey
 */
export const generateDownloadUrl = async (req, res) => {
  try {
    const { fileKey } = req.params;

    if (!fileKey) {
      return res.status(400).json({ error: "File key is required" });
    }

    const fileName = req.query.fileName;

    const downloadUrl = await s3Service.generatePresignedDownloadUrl(
      decodeURIComponent(fileKey),
      3600,
      fileName
    );

    res.status(200).json({
      downloadUrl,
      expiresIn: 3600, // 1 hour
    });
  } catch (error) {
    console.error("Error in generateDownloadUrl:", error);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
};

/**
 * Get file upload statistics
 * GET /api/files/stats
 */
export const getFileStats = async (req, res) => {
  try {
    // This would typically query your database for file upload counts
    // For now, return a placeholder
    res.status(200).json({
      totalFiles: 0,
      message: "File statistics endpoint - integrate with your analytics",
    });
  } catch (error) {
    console.error("Error in getFileStats:", error);
    res.status(500).json({ error: "Failed to get file statistics" });
  }
};
