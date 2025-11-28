import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";
import { performance } from "perf_hooks";
import fs from "fs";

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5001/api";
const TEST_FILE_COUNT = parseInt(process.env.TEST_FILE_COUNT) || 500;
const CONCURRENCY = parseInt(process.env.CONCURRENCY) || 10;

// You'll need a valid access token - get one by logging in
const ACCESS_TOKEN =
  process.env.TEST_ACCESS_TOKEN ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTI1NTljYmVmYzBiNmE2ZTc4YzFkOTUiLCJpYXQiOjE3NjQxMTY5MzYsImV4cCI6MTc2NDExNzgzNn0.tVNS_6SgnN3pB-U1dHr04Kk_ncIP-qXMRiLxJPM_ruw";

class S3LoadTester {
  constructor() {
    this.results = {
      totalFiles: 0,
      successful: 0,
      failed: 0,
      totalTime: 0,
      avgPresignTime: 0,
      avgUploadTime: 0,
      presignTimes: [],
      uploadTimes: [],
      errors: [],
    };
  }

  /**
   * Generate a dummy file buffer for testing
   */
  generateTestFile(sizeKB = 30) {
    const buffer = crypto.randomBytes(sizeKB * 1024);
    return {
      buffer,
      name: `test-file-${Date.now()}-${crypto
        .randomBytes(4)
        .toString("hex")}.txt`,
      type: "text/plain",
      size: buffer.length,
    };
  }

  /**
   * Get presigned URL from backend
   */
  async getPresignedUrl(file) {
    const startTime = performance.now();

    const response = await axios.post(
      `${API_BASE_URL}/files/presign`,
      {
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      },
      {
        headers: {
          Cookie: `accessToken=${ACCESS_TOKEN}`,
        },
        withCredentials: true,
      }
    );

    const endTime = performance.now();
    const presignTime = endTime - startTime;

    return {
      ...response.data,
      presignTime,
    };
  }

  /**
   * Upload file to S3 using presigned URL
   */
  async uploadToS3(uploadUrl, file) {
    const startTime = performance.now();

    await axios.put(uploadUrl, file.buffer, {
      headers: {
        "Content-Type": file.type,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const endTime = performance.now();
    return endTime - startTime;
  }

  /**
   * Upload a single file (presign + upload)
   */
  async uploadFile(fileIndex) {
    try {
      const file = this.generateTestFile(100); // 100KB test file

      console.log(
        `[${fileIndex + 1}/${TEST_FILE_COUNT}] Uploading ${file.name}...`
      );

      // Get presigned URL
      const { uploadUrl, fileUrl, presignTime } = await this.getPresignedUrl(
        file
      );

      // Upload to S3
      const uploadTime = await this.uploadToS3(uploadUrl, file);

      this.results.successful++;
      this.results.presignTimes.push(presignTime);
      this.results.uploadTimes.push(uploadTime);

      console.log(
        `[${
          fileIndex + 1
        }/${TEST_FILE_COUNT}]  Success (Presign: ${presignTime.toFixed(
          2
        )}ms, Upload: ${uploadTime.toFixed(2)}ms)`
      );

      return {
        success: true,
        fileUrl,
        presignTime,
        uploadTime,
      };
    } catch (error) {
      this.results.failed++;
      this.results.errors.push({
        fileIndex,
        error: error.message,
      });

      console.error(
        `[${fileIndex + 1}/${TEST_FILE_COUNT}]  Failed: ${error.message}`
      );

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Run load test with concurrency control
   */
  async runLoadTest() {
    console.log("\n Starting S3 Load Test");
    console.log(`Total files: ${TEST_FILE_COUNT}`);
    console.log(`Concurrency: ${CONCURRENCY}`);
    console.log(`API URL: ${API_BASE_URL}\n`);

    const startTime = performance.now();

    // Create batches for concurrent uploads
    const batches = [];
    for (let i = 0; i < TEST_FILE_COUNT; i += CONCURRENCY) {
      const batch = [];
      for (let j = i; j < Math.min(i + CONCURRENCY, TEST_FILE_COUNT); j++) {
        batch.push(this.uploadFile(j));
      }
      batches.push(batch);
    }

    // Execute batches
    for (const batch of batches) {
      await Promise.all(batch);
    }

    const endTime = performance.now();
    this.results.totalTime = endTime - startTime;

    this.printResults();
  }

  /**
   * Print test results
   */
  printResults() {
    console.log("\n" + "=".repeat(60));
    console.log("LOAD TEST RESULTS");
    console.log("=".repeat(60));

    console.log(`\nStatistics:`);
    console.log(`  Total Files:     ${TEST_FILE_COUNT}`);
    console.log(`   Successful:   ${this.results.successful}`);
    console.log(`   Failed:       ${this.results.failed}`);
    console.log(
      `  Success Rate:    ${(
        (this.results.successful / TEST_FILE_COUNT) *
        100
      ).toFixed(2)}%`
    );

    console.log(`\n Performance:`);
    console.log(
      `  Total Time:      ${(this.results.totalTime / 1000).toFixed(2)}s`
    );
    console.log(
      `  Throughput:      ${(
        TEST_FILE_COUNT /
        (this.results.totalTime / 1000)
      ).toFixed(2)} files/sec`
    );

    if (this.results.presignTimes.length > 0) {
      const avgPresign =
        this.results.presignTimes.reduce((a, b) => a + b, 0) /
        this.results.presignTimes.length;
      const minPresign = Math.min(...this.results.presignTimes);
      const maxPresign = Math.max(...this.results.presignTimes);

      console.log(`\n Presign URL Generation:`);
      console.log(`  Average:         ${avgPresign.toFixed(2)}ms`);
      console.log(`  Min:             ${minPresign.toFixed(2)}ms`);
      console.log(`  Max:             ${maxPresign.toFixed(2)}ms`);
    }

    if (this.results.uploadTimes.length > 0) {
      const avgUpload =
        this.results.uploadTimes.reduce((a, b) => a + b, 0) /
        this.results.uploadTimes.length;
      const minUpload = Math.min(...this.results.uploadTimes);
      const maxUpload = Math.max(...this.results.uploadTimes);

      console.log(`\n S3 Upload:`);
      console.log(`  Average:         ${avgUpload.toFixed(2)}ms`);
      console.log(`  Min:             ${minUpload.toFixed(2)}ms`);
      console.log(`  Max:             ${maxUpload.toFixed(2)}ms`);
    }

    if (this.results.errors.length > 0 && this.results.errors.length <= 10) {
      console.log(`\n Errors:`);
      this.results.errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. File #${err.fileIndex}: ${err.error}`);
      });
    }

    console.log("\n" + "=".repeat(60));
    console.log(
      ` Test completed successfully! ${this.results.successful}/${TEST_FILE_COUNT} files uploaded.`
    );
    console.log("=".repeat(60) + "\n");

    // Write results to file
    this.saveResults();
  }
  /**
   * Save results to JSON file
   */
  saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `load-test-results-${timestamp}.json`;

    // Safely compute stats (avoid division by zero / NaN)
    const presignCount = this.results.presignTimes.length;
    const uploadCount = this.results.uploadTimes.length;

    const presignAvg =
      presignCount > 0
        ? this.results.presignTimes.reduce((a, b) => a + b, 0) / presignCount
        : 0;
    const uploadAvg =
      uploadCount > 0
        ? this.results.uploadTimes.reduce((a, b) => a + b, 0) / uploadCount
        : 0;

    const summary = {
      testConfig: {
        totalFiles: TEST_FILE_COUNT,
        concurrency: CONCURRENCY,
        apiBaseUrl: API_BASE_URL,
        timestamp: new Date().toISOString(),
      },
      results: {
        totalFiles: TEST_FILE_COUNT,
        successful: this.results.successful,
        failed: this.results.failed,
        successRate:
          TEST_FILE_COUNT > 0
            ? (this.results.successful / TEST_FILE_COUNT) * 100
            : 0,
        totalTimeSeconds: this.results.totalTime / 1000,
        throughput:
          this.results.totalTime > 0
            ? TEST_FILE_COUNT / (this.results.totalTime / 1000)
            : 0,
        presignStats: {
          average: presignAvg,
          min: presignCount > 0 ? Math.min(...this.results.presignTimes) : 0,
          max: presignCount > 0 ? Math.max(...this.results.presignTimes) : 0,
        },
        uploadStats: {
          average: uploadAvg,
          min: uploadCount > 0 ? Math.min(...this.results.uploadTimes) : 0,
          max: uploadCount > 0 ? Math.max(...this.results.uploadTimes) : 0,
        },
      },
      errors: this.results.errors,
    };

    fs.writeFileSync(filename, JSON.stringify(summary, null, 2));
    console.log(`Results saved to: ${filename}\n`);
  }
}

// Run the test
if (!ACCESS_TOKEN) {
  console.error(" ERROR: TEST_ACCESS_TOKEN environment variable is required!");
  console.log(
    "   Please set your access token: export TEST_ACCESS_TOKEN='your_token_here'"
  );
  process.exit(1);
}

const tester = new S3LoadTester();
tester.runLoadTest().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
