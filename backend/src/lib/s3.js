import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

class S3Service {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.bucketName = process.env.AWS_S3_BUCKET;
    this.presignExpirySeconds = 300; // 5 minutes for upload
  }

  /**
   * Generate a unique file key with optional folder structure
   */
  generateFileKey(fileName, folder = "chat-files") {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString("hex");
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    return `${folder}/${timestamp}-${randomString}-${sanitizedFileName}`;
  }

  /**
   * Generate presigned URL for uploading a file to S3
   * Returns both the upload URL and the final file URL
   */
  async generatePresignedUploadUrl(fileName, contentType, expiresIn = 300) {
    try {
      const fileKey = this.generateFileKey(fileName);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        ContentType: contentType,
      });

      // Generate presigned URL for PUT operation
      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      // Generate the public URL (or use CloudFront if configured)
      const fileUrl = `https://${this.bucketName}.s3.${
        process.env.AWS_REGION || "us-east-1"
      }.amazonaws.com/${fileKey}`;

      return {
        uploadUrl,
        fileUrl,
        fileKey,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      };
    } catch (error) {
      console.error("Error generating presigned upload URL:", error);
      throw new Error("Failed to generate upload URL");
    }
  }

  /**
   * Generate presigned URL for downloading/viewing a file from S3
   */
  async generatePresignedDownloadUrl(
    fileKey,
    expiresIn = 3600,
    filename = null
  ) {
    try {
      // If a filename is provided, set ResponseContentDisposition so the
      // browser will download the file as an attachment with the given name.
      let responseContentDisposition;
      if (filename) {
        // Basic sanitization to avoid injection of quotes
        const safeName = String(filename).replace(/\"/g, "");
        responseContentDisposition = `attachment; filename="${safeName}"`;
      }

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        ...(responseContentDisposition && {
          ResponseContentDisposition: responseContentDisposition,
        }),
      });

      const downloadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      return downloadUrl;
    } catch (error) {
      console.error("Error generating presigned download URL:", error);
      throw new Error("Failed to generate download URL");
    }
  }

  /**
   * Extract file key from S3 URL
   */
  extractFileKeyFromUrl(s3Url) {
    try {
      const url = new URL(s3Url);
      // Remove leading slash
      return url.pathname.substring(1);
    } catch (error) {
      console.error("Error extracting file key:", error);
      return null;
    }
  }

  /**
   * Check if URL is an S3 URL
   */
  isS3Url(url) {
    if (!url) return false;
    return (
      url.includes("s3.amazonaws.com") || url.includes(`${this.bucketName}.s3`)
    );
  }

  /**
   * Get file metadata
   */
  getFileMetadata(fileName, contentType) {
    const extension = fileName.split(".").pop().toLowerCase();
    const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(
      extension
    );
    const isVideo = ["mp4", "webm", "mov", "avi"].includes(extension);
    const isDocument = ["pdf", "doc", "docx", "txt", "csv"].includes(extension);

    return {
      extension,
      isImage,
      isVideo,
      isDocument,
      mimeType: contentType,
    };
  }
}

// Singleton instance
const s3Service = new S3Service();

export default s3Service;
