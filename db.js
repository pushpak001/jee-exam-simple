import "dotenv/config";
import fs from "fs";

const e = process.env;
export const DB_NAME = e.DB_NAME || "jee_exam";
if (!/^\w+$/.test(DB_NAME)) throw new Error("DB_NAME may contain only letters, numbers and _");

export const cfg = {
  host: e.DB_HOST,
  port: Number(e.DB_PORT || 3306),
  user: e.DB_USER,
  password: e.DB_PASS || "",
  ssl: String(e.DB_SSL).toLowerCase() === "true"
    ? (e.DB_CA_FILE ? { ca: fs.readFileSync(e.DB_CA_FILE) } : { rejectUnauthorized: false })
    : undefined,
};
