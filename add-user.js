// usage: npm run add-user -- rahul rahul@123
import mysql from "mysql2/promise";
import { cfg, DB_NAME } from "./db.js";

const [id, pass] = process.argv.slice(2);
if (!id || !pass) { console.log("Usage: npm run add-user -- <loginId> <password>"); process.exit(1); }
const db = await mysql.createConnection({ ...cfg, database: DB_NAME });
await db.query(
  "INSERT INTO users (login_id, password) VALUES (?,?) ON DUPLICATE KEY UPDATE password = VALUES(password)",
  [id, pass]);
console.log("Saved user", id);
await db.end();
