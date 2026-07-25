// utils/redisClient.js
const Redis = require("ioredis");

const redisUrl = process.env.REDIS_URL;
let redis = null;

if (redisUrl) {
  try {
    const isTls = redisUrl.startsWith("rediss://");
    const options = {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        return delay;
      }
    };
    if (isTls) {
      options.tls = { rejectUnauthorized: false };
    }
    redis = new Redis(redisUrl, options);

    redis.on("connect", () => {
      console.log("✅ Successfully connected to Redis (Upstash)");
    });

    redis.on("error", (err) => {
      console.warn("⚠️ Redis Connection Warning:", err.message);
    });
  } catch (err) {
    console.warn("⚠️ Failed to initialize Redis client:", err.message);
    redis = null;
  }
} else {
  console.warn("⚠️ REDIS_URL not found in environment. Caching will degrade gracefully (cache disabled).");
}

/**
 * Get item from Redis cache (automatically JSON parsed)
 */
async function getCache(key) {
  try {
    if (!redis) return null;
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data);
  } catch (err) {
    console.warn(`⚠️ Redis GET error for key "${key}":`, err.message);
    return null;
  }
}

/**
 * Set item in Redis cache (automatically JSON stringified) with TTL in seconds
 */
async function setCache(key, value, ttlSeconds) {
  try {
    if (!redis) return false;
    const payload = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await redis.set(key, payload, "EX", ttlSeconds);
    } else {
      await redis.set(key, payload);
    }
    return true;
  } catch (err) {
    console.warn(`⚠️ Redis SET error for key "${key}":`, err.message);
    return false;
  }
}

/**
 * Delete single key from Redis
 */
async function delCache(key) {
  try {
    if (!redis) return false;
    const result = await redis.del(key);
    return result > 0;
  } catch (err) {
    console.warn(`⚠️ Redis DEL error for key "${key}":`, err.message);
    return false;
  }
}

/**
 * Clear all keys matching a pattern (e.g. "lesson_*", "audio_*", "img_*", "doubt_*")
 */
async function clearCacheByPattern(pattern) {
  try {
    if (!redis) return 0;
    let cursor = "0";
    let count = 0;
    do {
      const reply = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = reply[0];
      const keys = reply[1];
      if (keys && keys.length > 0) {
        await redis.del(...keys);
        count += keys.length;
      }
    } while (cursor !== "0");
    return count;
  } catch (err) {
    console.warn(`⚠️ Redis SCAN/DEL error for pattern "${pattern}":`, err.message);
    return 0;
  }
}

/**
 * Count all keys matching a pattern
 */
async function countCacheByPattern(pattern) {
  try {
    if (!redis) return 0;
    let cursor = "0";
    let count = 0;
    do {
      const reply = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = reply[0];
      if (reply[1]) {
        count += reply[1].length;
      }
    } while (cursor !== "0");
    return count;
  } catch (err) {
    console.warn(`⚠️ Redis SCAN count error for pattern "${pattern}":`, err.message);
    return 0;
  }
}

module.exports = {
  redis,
  getCache,
  setCache,
  delCache,
  clearCacheByPattern,
  countCacheByPattern
};
