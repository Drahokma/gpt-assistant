import { createClient } from "redis";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";

if (!process.env.REDIS_URL) {
  throw new Error("Please add the REDIS_URL to your environment variables.");
}

export function connectToRedis() {
  const clientPromise = createClient({ url });



  console.log("Redis connection successful:", url);
  return { clientPromise };
}
