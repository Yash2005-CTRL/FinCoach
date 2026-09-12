import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";

config({ path: ".env.local" });

async function main() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is not configured");
	const connection = await mysql.createConnection({ uri: url });
	const accountId = randomUUID();
	await connection.execute("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)", [randomUUID(), "Arjun Mehta", "demo@fincoach.app", await bcrypt.hash("FincoachDemo123!", 12)]);
	const [users] = await connection.query("SELECT id FROM users WHERE email = ? LIMIT 1", ["demo@fincoach.app"]);
	const actualUserId = (users as Array<{ id: string }>)[0].id;
	await connection.execute("INSERT IGNORE INTO accounts (id, user_id, name, type, institution, balance) VALUES (?, ?, ?, ?, ?, ?)", [accountId, actualUserId, "HDFC Savings", "savings", "HDFC Bank", 842650]);
	await connection.execute("INSERT IGNORE INTO goals (id, user_id, name, target_amount, current_amount, target_date, priority) VALUES (?, ?, ?, ?, ?, ?, ?)", [randomUUID(), actualUserId, "Emergency fund", 150000, 87000, "2026-12-31", "high"]);
	await connection.end();
	console.log("Seeded demo user: demo@fincoach.app / FincoachDemo123!");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });