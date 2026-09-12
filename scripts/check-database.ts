import { config } from "dotenv";
import mysql from "mysql2/promise";

config({ path: ".env.local" });

async function main() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is not configured");
	const connection = await mysql.createConnection({ uri: url });
	const [rows] = await connection.query("SELECT DATABASE() AS databaseName, COUNT(*) AS userCount FROM users");
	console.log(rows);
	await connection.end();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });