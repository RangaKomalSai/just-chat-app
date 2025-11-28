import dotenv from "dotenv";
import redisClient from "../lib/redisClient.js";
import { connectDB } from "../lib/db.js";

dotenv.config();

const STREAM_KEY = "chat:messages";
const CONSUMER_GROUP = "analytics-group";
const CONSUMER_NAME = `analytics-worker-${process.pid}`;

class AnalyticsWorker {
  constructor() {
    this.isRunning = false;
    this.lastId = "0"; // Start from beginning, or use "$" for new messages only
  }

  async initialize() {
    try {
      console.log("Initializing Analytics Worker...");

      // Connect to Redis
      await redisClient.connect();

      // Connect to MongoDB (if needed for advanced analytics)
      await connectDB();

      // Try to create consumer group (ignore error if it already exists)
      try {
        await redisClient
          .getClient()
          .xGroupCreate(STREAM_KEY, CONSUMER_GROUP, "0", {
            MKSTREAM: true,
          });
        console.log(`Created consumer group: ${CONSUMER_GROUP}`);
      } catch (error) {
        if (error.message.includes("BUSYGROUP")) {
          console.log(`Consumer group already exists: ${CONSUMER_GROUP}`);
        } else {
          throw error;
        }
      }

      console.log("Analytics Worker initialized");
    } catch (error) {
      console.error("Failed to initialize worker:", error);
      throw error;
    }
  }

  async processMessage(messageData) {
    try {
      const { messageId, chatId, senderId, timestamp, hasImage } = messageData;

      console.log(`Processing message: ${messageId} in chat: ${chatId}`);

      // Increment chat message count
      const newCount = await redisClient.incrementChatMessageCount(chatId);

      // Log analytics
      console.log(`   Chat ${chatId} now has ${newCount} messages`);
      console.log(`   Sent by: ${senderId}`);
      console.log(`   Has image: ${hasImage}`);
      console.log(`   Timestamp: ${timestamp}`);

      // You can add more analytics here:
      // - Track hourly message volume
      // - Track most active users
      // - Track image vs text message ratios
      // - Generate real-time metrics for dashboards

      return true;
    } catch (error) {
      console.error("Error processing message:", error);
      return false;
    }
  }

  async start() {
    this.isRunning = true;
    console.log("Analytics Worker started");
    console.log(`   Consumer: ${CONSUMER_NAME}`);
    console.log(`   Stream: ${STREAM_KEY}`);
    console.log("   Waiting for messages...\n");

    while (this.isRunning) {
      try {
        // Use XREADGROUP to consume messages with consumer group
        const client = redisClient.getClient();
        const results = await client.xReadGroup(
          CONSUMER_GROUP,
          CONSUMER_NAME,
          [{ key: STREAM_KEY, id: ">" }], // ">" means only new messages
          {
            COUNT: 10, // Process up to 10 messages at a time
            BLOCK: 5000, // Block for 5 seconds waiting for new messages
          }
        );

        if (results && results.length > 0) {
          for (const stream of results) {
            for (const message of stream.messages) {
              const { id, message: data } = message;

              // Process the message
              const success = await this.processMessage(data);

              if (success) {
                // Acknowledge the message
                await client.xAck(STREAM_KEY, CONSUMER_GROUP, id);
              }
            }
          }
        }
      } catch (error) {
        if (error.message.includes("NOGROUP")) {
          console.error("Consumer group does not exist. Reinitializing...");
          await this.initialize();
        } else {
          console.error("Error reading from stream:", error);
          // Wait a bit before retrying
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  }

  async stop() {
    console.log("\nStopping Analytics Worker...");
    this.isRunning = false;

    try {
      await redisClient.disconnect();
      console.log("Worker stopped gracefully");
      process.exit(0);
    } catch (error) {
      console.error("Error stopping worker:", error);
      process.exit(1);
    }
  }

  async getStatistics() {
    try {
      const streamLength = await redisClient.getStreamLength(STREAM_KEY);
      const chatCounts = await redisClient.getAllChatMessageCounts();

      console.log("\nAnalytics Statistics:");
      console.log(`   Total events in stream: ${streamLength}`);
      console.log(`   Message counts per chat:`);

      Object.entries(chatCounts).forEach(([chatId, count]) => {
        console.log(`      Chat ${chatId}: ${count} messages`);
      });
    } catch (error) {
      console.error("Error getting statistics:", error);
    }
  }
}

// Initialize and start worker
const worker = new AnalyticsWorker();

// Handle graceful shutdown
process.on("SIGINT", () => worker.stop());
process.on("SIGTERM", () => worker.stop());

// Start the worker
(async () => {
  try {
    await worker.initialize();
    await worker.start();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
})();

// Display statistics every 30 seconds
setInterval(() => worker.getStatistics(), 30000);

export default worker;
