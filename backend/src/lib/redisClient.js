import { createClient } from "redis";

class RedisClient {
  constructor() {
    this.client = null;
    this.pubClient = null;
    this.subClient = null;
  }

  async connect() {
    try {
      // Main Redis client for general operations
      this.client = createClient({
        url: process.env.REDIS_URL || "redis://localhost:6379",
      });

      // Pub/Sub clients for Socket.IO adapter
      this.pubClient = this.client.duplicate();
      this.subClient = this.client.duplicate();

      // Connect all clients
      await this.client.connect();
      await this.pubClient.connect();
      await this.subClient.connect();

      console.log("Redis connected successfully");

      // Error handlers
      this.client.on("error", (err) =>
        console.error("Redis Client Error:", err)
      );
      this.pubClient.on("error", (err) =>
        console.error("Redis Pub Client Error:", err)
      );
      this.subClient.on("error", (err) =>
        console.error("Redis Sub Client Error:", err)
      );
    } catch (error) {
      console.error("Redis connection failed:", error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.client) await this.client.quit();
      if (this.pubClient) await this.pubClient.quit();
      if (this.subClient) await this.subClient.quit();
      console.log("Redis disconnected");
    } catch (error) {
      console.error("Error disconnecting Redis:", error);
    }
  }

  getClient() {
    if (!this.client) {
      throw new Error("Redis client not connected. Call connect() first.");
    }
    return this.client;
  }

  getPubClient() {
    if (!this.pubClient) {
      throw new Error("Redis pub client not connected. Call connect() first.");
    }
    return this.pubClient;
  }

  getSubClient() {
    if (!this.subClient) {
      throw new Error("Redis sub client not connected. Call connect() first.");
    }
    return this.subClient;
  }

  // Helper methods for online users management
  async setUserOnline(userId, socketId) {
    await this.client.hSet("online_users", userId, socketId);
  }

  async setUserOffline(userId) {
    await this.client.hDel("online_users", userId);
  }

  async getUserSocketId(userId) {
    return await this.client.hGet("online_users", userId);
  }

  async getAllOnlineUsers() {
    return await this.client.hGetAll("online_users");
  }

  async getOnlineUserIds() {
    return await this.client.hKeys("online_users");
  }

  async isUserOnline(userId) {
    return await this.client.hExists("online_users", userId);
  }

  // Redis Streams methods for chat events pipeline
  async addToStream(streamKey, data) {
    return await this.client.xAdd(streamKey, "*", data);
  }

  async readFromStream(streamKey, lastId = "0", count = 10, block = 0) {
    const results = await this.client.xRead(
      { key: streamKey, id: lastId },
      { COUNT: count, BLOCK: block }
    );
    return results;
  }

  async getStreamLength(streamKey) {
    return await this.client.xLen(streamKey);
  }

  // Analytics helper methods
  async incrementChatMessageCount(chatId) {
    return await this.client.hIncrBy(
      "chat:analytics:message_counts",
      chatId,
      1
    );
  }

  async getChatMessageCount(chatId) {
    const count = await this.client.hGet(
      "chat:analytics:message_counts",
      chatId
    );
    return parseInt(count) || 0;
  }

  async getAllChatMessageCounts() {
    return await this.client.hGetAll("chat:analytics:message_counts");
  }
}

// Singleton instance
const redisClient = new RedisClient();

export default redisClient;
