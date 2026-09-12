import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/require-user";
import { processStatementJob } from "@/lib/scan/job-runner";


const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg"]);

function validateMagicBytes(buffer: Buffer): "application/pdf" | "image/png" | "image/jpeg" | null {
  if (buffer.length < 8) return null;
  // PDF: %PDF-
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d) {
    return "application/pdf";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

export async function GET() {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const [rows] = await db.query(
    `SELECT 
      u.id, 
      u.original_name AS originalName, 
      u.size_bytes AS sizeBytes, 
      u.mime_type AS mimeType, 
      u.status, 
      u.bank_name AS bankName, 
      u.account_number AS accountNumber, 
      u.account_holder AS accountHolder, 
      u.period_start AS periodStart, 
      u.period_end AS periodEnd, 
      u.closing_balance AS closingBalance, 
      u.extracted_count AS extractedCount, 
      u.error_message AS errorMessage, 
      u.created_at AS createdAt,
      j.id AS jobId,
      j.current_step AS currentStep,
      j.step_index AS stepIndex,
      j.total_steps AS totalSteps,
      j.progress_percent AS progressPercent,
      j.status AS jobStatus
    FROM statement_uploads u
    LEFT JOIN statement_processing_jobs j ON j.upload_id = u.id
    WHERE u.user_id = ?
    ORDER BY u.created_at DESC
    LIMIT 20`,
    [userId]
  );

  return NextResponse.json({ uploads: rows });
}

export async function POST(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Please select a bank statement file to upload." }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File size exceeds the 20 MB limit." }, { status: 400 });
    }

    const originalName = file.name.trim();
    const lastDotIndex = originalName.lastIndexOf(".");
    if (lastDotIndex === -1) {
      return NextResponse.json({ error: "File must have a valid extension (.pdf, .png, .jpg, .jpeg)." }, { status: 400 });
    }

    const extension = originalName.slice(lastDotIndex).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json({ error: "Only PDF, PNG, JPG, and JPEG bank statements are accepted." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const verifiedMimeType = validateMagicBytes(buffer);
    if (!verifiedMimeType) {
      return NextResponse.json({ error: "File content does not match a valid PDF or image format." }, { status: 400 });
    }

    // Verify extension matches detected format
    if (verifiedMimeType === "application/pdf" && extension !== ".pdf") {
      return NextResponse.json({ error: "File content is PDF but extension is not .pdf" }, { status: 400 });
    }
    if (verifiedMimeType === "image/png" && extension !== ".png") {
      return NextResponse.json({ error: "File content is PNG but extension is not .png" }, { status: 400 });
    }
    if (verifiedMimeType === "image/jpeg" && extension !== ".jpg" && extension !== ".jpeg") {
      return NextResponse.json({ error: "File content is JPEG but extension is not .jpg/.jpeg" }, { status: 400 });
    }

    const uploadId = randomUUID();
    const jobId = randomUUID();
    const storedName = `${uploadId}${extension}`;
    const userDir = join(process.cwd(), ".data", "statements", userId);

    await mkdir(userDir, { recursive: true });
    const filePath = join(userDir, storedName);
    await writeFile(filePath, buffer, { mode: 0o600 }); // strictly non-executable

    // Persist statement upload record
    await db.query(
      `INSERT INTO statement_uploads (
        id, user_id, original_name, stored_name, mime_type, size_bytes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'uploaded', NOW(3), NOW(3))`,
      [uploadId, userId, originalName, storedName, verifiedMimeType, file.size]
    );

    // Persist processing job record
    await db.query(
      `INSERT INTO statement_processing_jobs (
        id, upload_id, user_id, status, current_step, step_index, total_steps, progress_percent, created_at, updated_at
      ) VALUES (?, ?, ?, 'queued', 'Statement uploaded', 1, 8, 12, NOW(3), NOW(3))`,
      [jobId, uploadId, userId]
    );

    // Asynchronously trigger job execution without blocking response
    processStatementJob(uploadId, userId).catch((err) => {
      console.error("Async statement processing job error:", err);
    });

    return NextResponse.json(
      {
        ok: true,
        uploadId,
        jobId,
        originalName,
        sizeBytes: file.size,
        mimeType: verifiedMimeType,
        status: "processing",
        currentStep: "Statement uploaded",
        progressPercent: 12,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Statement upload failed:", error);
    return NextResponse.json({ error: "Failed to securely save bank statement." }, { status: 500 });
  }
}
