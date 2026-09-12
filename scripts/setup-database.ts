import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

config({ path: ".env.local" });

async function main() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is not configured");
	const connectionUrl = new URL(url);
	connectionUrl.pathname = "/";
	const connection = await mysql.createConnection({ uri: connectionUrl.toString(), multipleStatements: true });
	const sql = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
	await connection.query(sql);
	const [columns] = await connection.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'fincoach' AND TABLE_NAME = 'accounts' AND COLUMN_NAME = 'account_number'");
	if (Array.isArray(columns) && columns.length === 0) await connection.query("ALTER TABLE fincoach.accounts ADD COLUMN account_number VARCHAR(32) NULL");
	const [indexes] = await connection.query("SHOW INDEX FROM fincoach.accounts WHERE Key_name = 'accounts_user_number_uq'");
	if (Array.isArray(indexes) && indexes.length === 0) await connection.query("ALTER TABLE fincoach.accounts ADD UNIQUE KEY accounts_user_number_uq (user_id, account_number)");

	// Ensure statement_uploads status enum includes 'uploaded'
	try {
		await connection.query("ALTER TABLE fincoach.statement_uploads MODIFY COLUMN status ENUM('uploaded','processing','review','imported','failed') NOT NULL DEFAULT 'uploaded'");
	} catch {}

	// Ensure transactions table has source, upload_id, and confidence
	const [txSourceCol] = await connection.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'fincoach' AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'source'");
	if (Array.isArray(txSourceCol) && txSourceCol.length === 0) {
		await connection.query("ALTER TABLE fincoach.transactions ADD COLUMN source VARCHAR(24) NOT NULL DEFAULT 'manual'");
	}
	const [txUploadCol] = await connection.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'fincoach' AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'upload_id'");
	if (Array.isArray(txUploadCol) && txUploadCol.length === 0) {
		await connection.query("ALTER TABLE fincoach.transactions ADD COLUMN upload_id CHAR(36) NULL");
	}
	const [txConfCol] = await connection.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'fincoach' AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'confidence'");
	if (Array.isArray(txConfCol) && txConfCol.length === 0) {
		await connection.query("ALTER TABLE fincoach.transactions ADD COLUMN confidence DECIMAL(5,2) NULL");
	}

	await connection.end();
	console.log("FinCoach database schema is ready.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });