import { config } from "dotenv";
config({ path: ".env.local" });
import mysql, { type Pool } from "mysql2/promise";

declare global {
  var fincoachDb: Pool | undefined;
}

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return mysql.createPool({ uri: url, connectionLimit: 10, waitForConnections: true, decimalNumbers: true });
}

export const db = globalThis.fincoachDb ?? createPool();
if (process.env.NODE_ENV !== "production") globalThis.fincoachDb = db;