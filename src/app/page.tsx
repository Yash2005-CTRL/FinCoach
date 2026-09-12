"use client";

import { FormEvent, useEffect, useLayoutEffect, useState } from "react";
import {
  AlertCircle, ArrowUpRight, Bell, Bot, CheckCircle2, Coins, CreditCard, Eye, EyeOff, FileScan, FileText, Landmark, LayoutDashboard, LockKeyhole, LogOut, Menu, Mic, MicOff, Pencil, PiggyBank,
  Moon, Plus, ReceiptIndianRupee, RefreshCw, Search, Send, Sparkles, Sun, Target, Trash2, TrendingUp, Upload, UserRound, Volume2, X,
} from "lucide-react";


const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Financial Scan", icon: FileScan },
  { label: "Transactions", icon: ReceiptIndianRupee },
  { label: "Accounts", icon: Landmark },
  { label: "Goals", icon: Target },
  { label: "Market Analysis", icon: TrendingUp },
];



type DashboardData = {
  user: { name: string; email?: string };
  snapshot: { totalAssets: number; totalIncome: number; monthlyIncome: number; monthlyExpenses: number; monthlySavings: number; requiredGoalSavings: number; availableToSpend: number };
  health: { score: number; savingsRate: number; goalProgress: number; assets: number };
  spending: { category: string; amount: number }[];
  cashFlow: { month: string; income: number; expenses: number }[];
  goals: { id: string; name: string; targetAmount: number; currentAmount: number; targetDate: string; priority: string }[];
};

const formatINR = (amount: number) => `${String.fromCodePoint(0x20b9)}${Math.round(amount).toLocaleString("en-IN")}`;
const formatDateTime = (value: unknown) => {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};
type SpeechRecognizer = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  function toggleListening() {
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setSupported(false);
      setErrorMessage("Voice input requires HTTPS or localhost");
      return;
    }
    const speechWindow = window as Window & { SpeechRecognition?: new () => SpeechRecognizer; webkitSpeechRecognition?: new () => SpeechRecognizer };
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor) { setSupported(false); setErrorMessage("Voice input is not supported in this browser"); return; }
    if (listening) { setListening(false); return; }
    setErrorMessage("");
    const recognizer = new Constructor();
    recognizer.lang = "en-IN";
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    recognizer.onresult = (event) => { onText(event.results[0][0].transcript); setListening(false); };
    recognizer.onerror = () => { setListening(false); setSupported(false); setErrorMessage("Allow microphone access and try again"); };
    recognizer.onend = () => setListening(false);
    recognizer.start();
    setListening(true);
  }

  const label = errorMessage || (supported ? "Use voice input" : "Voice input is unavailable");
  return <button className={listening ? "voice-button listening" : "voice-button"} type="button" onClick={toggleListening} aria-label={label} title={label}>{listening ? <MicOff size={16} /> : <Mic size={16} />}</button>;
}

function PasswordInput({ value, onChange, minLength = 8, placeholder = "Password" }: { value: string; onChange: (value: string) => void; minLength?: number; placeholder?: string }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="password-field-wrap">
      <input
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        minLength={minLength}
        placeholder={placeholder}
        required
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShowPassword((current) => !current)}
        aria-label={showPassword ? "Hide password" : "Show password"}
        title={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

type UploadedStatement = {
  id: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
  status: "uploaded" | "processing" | "review" | "imported" | "failed";
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  closingBalance: number | null;
  extractedCount: number;
  errorMessage: string | null;
  createdAt: string;
  currentStep: string | null;
  progressPercent: number | null;
};

type ExtractedTransactionItem = {
  id: string;
  occurredAt: string;
  description: string;
  merchant?: string;
  reference?: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  category: string;
  confidence: number;
  balance?: number;
  duplicateStatus: "new" | "possible_duplicate" | "keep_existing" | "imported";
  selected: number | boolean;
};

type ScanAnalysis = {
  summary: string;
  insight: string;
  totals: { transactionCount: number; income: number; expenses: number; net: number; savingsRate: number | null };
  categories: { category: string; amount: number; share: number }[];
  recurring: { merchant: string; category: string; count: number; averageAmount: number; totalAmount: number; annualized: number }[];
  leaks: { merchant: string; category: string; count: number; averageAmount: number; annualized: number; reason: string }[];
  topExpense: { description: string; amount: number; category: string } | null;
};

function StatementScanPanel({ onScanCompleted }: { onScanCompleted?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploads, setUploads] = useState<UploadedStatement[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(true);

  // Active scan state
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [activeScan, setActiveScan] = useState<UploadedStatement | null>(null);
  const [transactions, setTransactions] = useState<ExtractedTransactionItem[]>([]);
  const [analysis, setAnalysis] = useState<ScanAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [createAccount, setCreateAccount] = useState(true);

  async function loadUploads() {
    try {
      const res = await fetch("/api/scans", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUploads(data.uploads ?? []);
      }
    } catch {} finally {
      setLoadingUploads(false);
    }
  }

  async function loadAnalysis(scanId: string) {
    setAnalysisLoading(true);
    try {
      const res = await fetch(`/api/scans/${scanId}/analysis`, { cache: "no-store" });
      if (res.ok) setAnalysis(await res.json());
      else setAnalysis(null);
    } catch {
      setAnalysis(null);
    } finally {
      setAnalysisLoading(false);
    }
  }

  useEffect(() => {
    loadUploads();
  }, []);

  // Poll active scan status when processing
  useEffect(() => {
    if (!activeScanId) return;
    const scanId = activeScanId;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/scans/${scanId}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) window.setTimeout(poll, 3000);
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        setActiveScan(data.upload);
        setTransactions(data.transactions ?? []);
        if (data.upload?.status === "review") void loadAnalysis(scanId);

        // Keep polling if queued or processing
        if (data.upload?.status === "processing" || data.upload?.status === "uploaded") {
          setTimeout(poll, 1500);
        }
      } catch {
        if (!cancelled) window.setTimeout(poll, 3000);
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [activeScanId]);

  function handleFileSelection(selected: File | null) {
    setError("");
    setMessage("");
    if (!selected) {
      setFile(null);
      return;
    }
    const ext = selected.name.slice(selected.name.lastIndexOf(".")).toLowerCase();
    const validExts = [".pdf", ".png", ".jpg", ".jpeg"];
    if (!validExts.includes(ext)) {
      setError("Please select a valid PDF or image file (PDF, PNG, JPG, JPEG).");
      setFile(null);
      return;
    }
    if (selected.size > 20 * 1024 * 1024) {
      setError("File exceeds 20 MB size limit.");
      setFile(null);
      return;
    }
    setFile(selected);
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please choose or drop a bank statement first.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/scans", {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to upload statement.");
        return;
      }

      setMessage(`Statement "${data.originalName}" uploaded. Processing your financial data...`);
      setFile(null);
      setActiveScanId(data.uploadId);
      await loadUploads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error during upload.");
    } finally {
      setUploading(false);
    }
  }

  async function startReview(scanId: string) {
    setError("");
    setMessage("");
    setActiveScanId(scanId);
    try {
      const res = await fetch(`/api/scans/${scanId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveScan(data.upload);
        setTransactions(data.transactions ?? []);
        if (data.upload.status === "review") void loadAnalysis(scanId);
      }
    } catch {}
  }

  function updateTxField(id: string, key: keyof ExtractedTransactionItem, val: any) {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [key]: key === "confidence" ? Number(val) : val } : t))
    );
  }

  function approveAllHighConfidence() {
    setTransactions((prev) =>
      prev.map((t) => ({ ...t, selected: t.confidence >= 70 && t.duplicateStatus !== "possible_duplicate" ? 1 : t.selected }))
    );
  }

  function selectAll(val: boolean) {
    setTransactions((prev) => prev.map((t) => ({ ...t, selected: val ? 1 : 0 })));
  }

  async function saveReviewEdits() {
    if (!activeScanId) return;
    setSavingReview(true);
    try {
      const res = await fetch(`/api/scans/${activeScanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions }),
      });
      if (res.ok) {
        setMessage("Review adjustments saved.");
      } else {
        setError("Failed to save changes.");
      }
    } catch {
      setError("Error saving adjustments.");
    } finally {
      setSavingReview(false);
    }
  }

  async function importVerifiedTransactions() {
    if (!activeScanId) return;
    setImporting(true);
    setError("");
    setMessage("");

    // Save current edits first
    await saveReviewEdits();

    try {
      const res = await fetch(`/api/scans/${activeScanId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createAccount }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to import verified transactions.");
        return;
      }

      setMessage(data.message ?? "Transactions imported successfully!");
      await loadUploads();
      if (onScanCompleted) onScanCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error during transaction import.");
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(uploadId: string, name: string) {
    if (!window.confirm(`Delete uploaded statement "${name}"?`)) return;
    try {
      const res = await fetch(`/api/scans/${uploadId}`, { method: "DELETE" });
      if (res.ok) {
        setUploads((prev) => prev.filter((u) => u.id !== uploadId));
        if (activeScanId === uploadId) {
          setActiveScanId(null);
          setActiveScan(null);
          setTransactions([]);
          setAnalysis(null);
        }
        setMessage("Statement deleted.");
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Unable to delete statement.");
      }
    } catch {
      setError("Could not delete statement.");
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const selectedCount = transactions.filter((t) => Boolean(t.selected)).length;
  const duplicateCount = transactions.filter((t) => t.duplicateStatus === "possible_duplicate").length;

  return (
    <section className="scan-panel">
      <div className="scan-heading">
        <div className="scan-icon">
          <FileScan size={22} />
        </div>
        <div>
          <p className="eyebrow">FinCoach Financial Scan</p>
          <h2>Scan My Finances</h2>
          <p>
            Upload your bank statement (PDF, PNG, JPG) to uncover spending trends, detect recurring leaks, and power AI-driven insights.
          </p>
        </div>
      </div>

      {/* 1. Real Progress Processing State */}
      {activeScan && (activeScan.status === "processing" || activeScan.status === "uploaded") && (
        <div className="scan-processing" style={{ background: "white", padding: "24px", borderRadius: "10px", marginTop: "16px", border: "1px solid #dce9df" }}>
          <div className="scan-spinner" />
          <strong style={{ fontSize: "16px" }}>Analyzing your finances...</strong>
          <p style={{ color: "var(--muted)", fontSize: "12px" }}>
            {activeScan.currentStep ?? "Reading and normalizing statement data securely..."}
          </p>

          <div style={{ width: "100%", maxWidth: "420px", background: "#edf3ee", height: "8px", borderRadius: "6px", overflow: "hidden", margin: "14px 0" }}>
            <div
              style={{
                width: `${activeScan.progressPercent ?? 20}%`,
                height: "100%",
                background: "var(--green)",
                transition: "width 0.4s ease",
              }}
            />
          </div>

          <div className="scan-steps">
            <span className="complete"><CheckCircle2 size={14} /> Statement uploaded</span>
            <span className={(activeScan.progressPercent ?? 0) >= 30 ? "complete" : ""}>
              <CheckCircle2 size={14} /> Bank & account detected
            </span>
            <span className={(activeScan.progressPercent ?? 0) >= 45 ? "complete" : ""}>
              <CheckCircle2 size={14} /> Transactions extracted
            </span>
            <span className={(activeScan.progressPercent ?? 0) >= 60 ? "complete" : ""}>
              <CheckCircle2 size={14} /> Normalized & tagged
            </span>
            <span className={(activeScan.progressPercent ?? 0) >= 75 ? "complete" : ""}>
              <CheckCircle2 size={14} /> AI categorized
            </span>
            <span className={(activeScan.progressPercent ?? 0) >= 90 ? "complete" : ""}>
              <CheckCircle2 size={14} /> Duplicate check
            </span>
          </div>
        </div>
      )}

      {/* 2. Verification Review Screen */}
      {activeScan && activeScan.status === "review" && (
        <div className="scan-review" style={{ background: "white", padding: "20px", borderRadius: "10px", marginTop: "16px", border: "1px solid #dce9df" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
              <div className="scan-review-summary">
                <div>
                  <strong>{transactions.length}</strong>
                  <small>transactions found</small>
                </div>
                <div>
                  <strong>{activeScan.bankName ?? "Bank Detected"}</strong>
                  <small>{activeScan.accountNumber ? `A/c: ${activeScan.accountNumber}` : "General Statement"}</small>
                </div>
                {activeScan.periodStart && (
                  <div>
                    <strong>{new Date(activeScan.periodStart).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} - {activeScan.periodEnd ? new Date(activeScan.periodEnd).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) : ""}</strong>
                    <small>Statement period</small>
                  </div>
                )}
              </div>
              <button className="text-button" type="button" onClick={() => { setActiveScanId(null); setActiveScan(null); }}>
                Back to Uploads
              </button>
            </div>
            {analysisLoading && <p style={{ color: "var(--muted)", fontSize: "11px" }}>Building your spending insights...</p>}
            {analysis && (
              <div style={{ background: "#f4faf6", border: "1px solid #d7eade", borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                  <div>
                    <p className="eyebrow" style={{ marginBottom: "4px" }}>Statement Intelligence</p>
                    <strong style={{ fontSize: "14px" }}>{analysis.insight}</strong>
                    <p style={{ color: "var(--muted)", fontSize: "11px", margin: "6px 0 0" }}>{analysis.summary}</p>
                  </div>
                  {analysis.totals.savingsRate !== null && <strong style={{ color: "var(--green)", whiteSpace: "nowrap" }}>{analysis.totals.savingsRate}% observed savings</strong>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", marginTop: "12px" }}>
                  <div><small>Income</small><strong style={{ display: "block" }}>{formatINR(analysis.totals.income)}</strong></div>
                  <div><small>Expenses</small><strong style={{ display: "block" }}>{formatINR(analysis.totals.expenses)}</strong></div>
                  <div><small>Top category</small><strong style={{ display: "block" }}>{analysis.categories[0]?.category ?? "Not detected"}</strong></div>
                  <div><small>Repeat patterns</small><strong style={{ display: "block" }}>{analysis.recurring.length}</strong></div>
                </div>
                {analysis.leaks.length > 0 && (
                  <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #d7eade" }}>
                    <small style={{ color: "var(--green-dark)", fontWeight: 700 }}>Potential recurring leaks</small>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
                      {analysis.leaks.map((leak) => <span key={leak.merchant} style={{ background: "white", border: "1px solid #d7eade", borderRadius: "5px", padding: "6px 8px", fontSize: "10px" }}>{leak.merchant} / {formatINR(leak.averageAmount)} x {leak.count}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", margin: "12px 0" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button className="outline-button" type="button" onClick={approveAllHighConfidence} style={{ fontSize: "11px", padding: "6px 10px" }}>
                <CheckCircle2 size={13} color="var(--green)" /> Approve High Confidence (&gt;= 70%)
              </button>
              <button className="text-button" type="button" onClick={() => selectAll(true)} style={{ fontSize: "11px" }}>
                Select All
              </button>
              <button className="text-button" type="button" onClick={() => selectAll(false)} style={{ fontSize: "11px" }}>
                Deselect All
              </button>
            </div>

            {activeScan.accountNumber && (
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--ink)", fontWeight: 600, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={createAccount}
                  onChange={(e) => setCreateAccount(e.target.checked)}
                />
                Add detected {activeScan.bankName ?? ""} account to FinCoach if new
              </label>
            )}
          </div>

          {duplicateCount > 0 && (
            <div style={{ background: "#fff9e9", border: "1px solid #f0dfb8", borderRadius: "6px", padding: "8px 12px", fontSize: "11px", color: "#8d713a", display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
              <AlertCircle size={15} />
              <span>
                <strong>{duplicateCount} possible duplicate transactions detected</strong> (matched against your saved history). They have been left unselected to protect your accounts.
              </span>
            </div>
          )}

          <div className="scan-table-wrap">
            <table className="scan-table">
              <thead>
                <tr>
                  <th style={{ width: "35px" }}>Import</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className={tx.confidence < 70 ? "low-confidence" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(tx.selected)}
                        onChange={(e) => updateTxField(tx.id, "selected", e.target.checked ? 1 : 0)}
                      />
                    </td>
                    <td>{formatDateTime(tx.occurredAt)}</td>
                                        <td>{formatDateTime(tx.occurredAt)}</td>
                    <td>
                      <input
                        style={{ width: "100%", minWidth: "160px" }}
                        value={tx.description}
                        onChange={(e) => updateTxField(tx.id, "description", e.target.value)}
                      />
                    </td>
                    <td>
                      <strong>{formatINR(Number(tx.amount))}</strong>
                    </td>
                    <td>
                      <select
                        value={tx.type}
                        onChange={(e) => updateTxField(tx.id, "type", e.target.value)}
                      >
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                        <option value="transfer">Transfer</option>
                      </select>
                    </td>
                    <td>
                      <input
                        value={tx.category}
                        onChange={(e) => updateTxField(tx.id, "category", e.target.value)}
                      />
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: tx.confidence >= 70 ? "#e8f4ec" : "#fff3df",
                          color: tx.confidence >= 70 ? "var(--green)" : "#ad7d2e",
                        }}
                      >
                        {Math.round(tx.confidence)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="scan-review-footer" style={{ marginTop: "16px" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {selectedCount} of {transactions.length} transactions selected for import
              </p>
              {message && <small style={{ color: "var(--green-dark)" }}>{message}</small>}
              {error && <small style={{ color: "#a75e50" }}>{error}</small>}
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                className="outline-button"
                type="button"
                disabled={savingReview}
                onClick={saveReviewEdits}
              >
                {savingReview ? "Saving..." : "Save Edits"}
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={importing || selectedCount === 0}
                onClick={importVerifiedTransactions}
              >
                <CheckCircle2 size={16} />
                {importing ? "Importing to Workspace..." : `Import ${selectedCount} Verified Transactions`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Upload Dropzone (When not actively reviewing) */}
      {(!activeScan || activeScan.status === "imported" || activeScan.status === "failed") && (
        <form onSubmit={handleUpload}>
          <label
            className={`scan-dropzone ${isDragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files?.[0]) {
                handleFileSelection(e.dataTransfer.files[0]);
              }
            }}
          >
            <Upload size={24} />
            <strong>{file ? file.name : "Choose or drag & drop a bank statement"}</strong>
            <small>
              {file
                ? `${formatFileSize(file.size)} - Ready to upload`
                : "Supports PDF, JPG, JPEG, PNG - Maximum 20 MB - Stored privately"}
            </small>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={(e) => handleFileSelection(e.target.files?.[0] ?? null)}
            />
          </label>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button className="primary-button scan-submit" type="submit" disabled={uploading || !file}>
              <FileScan size={16} />
              {uploading ? "Securing and uploading..." : "Upload Bank Statement"}
            </button>
            {file && !uploading && (
              <button className="text-button" type="button" onClick={() => setFile(null)}>
                Cancel
              </button>
            )}
          </div>

          {error && (
            <p className="scan-message error" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <AlertCircle size={14} /> {error}
            </p>
          )}
          {message && (
            <p className="scan-message" style={{ color: "var(--green-dark)", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> {message}
            </p>
          )}
        </form>
      )}

      {activeScan?.status === "failed" && (
        <p className="scan-message error" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <AlertCircle size={14} /> {activeScan.errorMessage ?? "We could not extract transactions from this image. Try a clearer crop of the statement table."}
        </p>
      )}

      {/* 4. Uploaded Statements History List */}
      {uploads.length > 0 && (
        <div style={{ marginTop: "20px", borderTop: "1px solid #dce9df", paddingTop: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <strong style={{ fontSize: "11px", color: "var(--ink)", fontWeight: 700 }}>
              Uploaded Statements ({uploads.length})
            </strong>
            <small style={{ color: "var(--muted)", fontSize: "9px" }}>Associated with your workspace</small>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {uploads.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "white",
                  border: "1px solid #dce9df",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "6px",
                      background: "#e8f2ec",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--green)",
                    }}
                  >
                    <FileText size={15} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "11px" }}>{item.bankName ? `${item.bankName} Statement` : item.originalName}</strong>
                    <small style={{ color: "var(--muted)", fontSize: "9px" }}>
                      {item.accountNumber ? `A/c: ${item.accountNumber} - ` : ""}
                      {formatFileSize(item.sizeBytes)} - Uploaded {new Date(item.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                    </small>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: "12px",
                      background: item.status === "imported" ? "#e6f2e9" : item.status === "review" ? "#fff3df" : item.status === "failed" ? "#fff0ed" : "#f1f5f1",
                      color: item.status === "imported" ? "var(--green)" : item.status === "review" ? "#ad7d2e" : item.status === "failed" ? "#a75e50" : "#5d7967",
                      textTransform: "capitalize",
                    }}
                  >
                    {item.status === "review" ? "Ready for Review" : item.status}
                  </span>
                  {item.status === "review" && (
                    <button
                      className="primary-button"
                      type="button"
                      style={{ padding: "5px 9px", fontSize: "10px" }}
                      onClick={() => startReview(item.id)}
                    >
                      Review & Import
                    </button>
                  )}
                  <button
                    className="icon-button danger-button"
                    type="button"
                    onClick={() => handleDelete(item.id, item.originalName)}
                    title="Delete statement"
                    aria-label={`Delete ${item.originalName}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}



function LegacyInsightPanel() {
  const [intel, setIntel] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/intelligence", { cache: "no-store" })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setIntel(data.intel ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="section-workspace" style={{ textAlign: "center", padding: "60px 20px" }}>
        <div className="scan-spinner" style={{ margin: "0 auto 16px" }} />
        <strong>Analyzing your financial data...</strong>
        <p style={{ color: "var(--muted)", fontSize: "11px" }}>Computing patterns, recurring leaks, and forecasts.</p>
      </div>
    );
  }

  if (!intel) {
    return (
      <div className="section-workspace">
        <div className="empty-panel">
          No financial scan data available yet. Please upload a bank statement to generate financial insights.
        </div>
      </div>
    );
  }

  const { healthScore, nextBestMove, moneyLeaks, recurringPayments, unusualTransactions, cashFlowForecast, budgetSuggestions } = intel;

  return (
    <div className="section-workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Comprehensive Financial Intelligence</p>
          <p className="subheading">
            Deep algorithmic analysis of your income, spending leaks, recurring commitments, and health factors.
          </p>
        </div>
      </div>

      {/* 1. Next Best Move Banner */}
      <section className="gps-banner" style={{ marginBottom: "20px" }}>
        <div className="gps-icon">
          <Sparkles size={20} />
        </div>
        <div className="gps-copy">
          <p className="eyebrow">Priority Recommended Action</p>
          <h2>{nextBestMove.title}</h2>
          <p>{nextBestMove.whyFinCoachRecommendsThis}</p>
          <p style={{ marginTop: "4px" }}>
            <strong>Estimated Impact:</strong> {nextBestMove.impactEstimate}
          </p>
        </div>
      </section>

      {/* 2. Health Breakdown & 30-Day Forecast Grid */}
      <div className="main-grid" style={{ marginBottom: "20px" }}>
        {/* Health Score Deep Breakdown */}
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Health Score Factors</p>
              <h2>Financial Health: {healthScore.score}/100</h2>
            </div>
            <span className="health-status">{healthScore.summary}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {healthScore.factors.map((factor: any, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  background: factor.positive ? "#f2f8f4" : "#fff5f2",
                  border: `1px solid ${factor.positive ? "#d4e9da" : "#f8d7cf"}`,
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
              >
                <div>
                  <strong style={{ color: factor.positive ? "var(--green-dark)" : "#a75e50" }}>
                    {factor.positive ? `+${factor.points}` : `${factor.points}`} pts - {factor.label}
                  </strong>
                  <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: "10px" }}>{factor.explanation}</p>
                </div>
                <span style={{ fontWeight: 700, color: factor.positive ? "var(--green)" : "#a75e50" }}>
                  {factor.positive ? "Positive" : "Improvement"}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 30-Day Cash Flow Forecast */}
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">30-Day Outlook</p>
              <h2>Cash Flow Forecast</h2>
            </div>
            <span className="health-status">Algorithmic Projection</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #edf1ed", paddingBottom: "8px" }}>
              <span style={{ color: "var(--muted)" }}>Projected Monthly Income</span>
              <strong style={{ color: "var(--green-dark)" }}>{formatINR(cashFlowForecast.projectedIncome)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #edf1ed", paddingBottom: "8px" }}>
              <span style={{ color: "var(--muted)" }}>Fixed Recurring Commitments</span>
              <strong>{formatINR(cashFlowForecast.recurringCommitments)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #edf1ed", paddingBottom: "8px" }}>
              <span style={{ color: "var(--muted)" }}>Estimated Discretionary Outflow</span>
              <strong>{formatINR(cashFlowForecast.estimatedDiscretionarySpend)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "4px" }}>
              <strong style={{ fontSize: "12px" }}>Projected 30-Day Surplus</strong>
              <strong style={{ fontSize: "14px", color: cashFlowForecast.projectedSurplus >= 0 ? "var(--green)" : "#a75e50" }}>
                {formatINR(cashFlowForecast.projectedSurplus)}
              </strong>
            </div>
          </div>

          <p style={{ color: "var(--muted)", fontSize: "9px", marginTop: "16px", fontStyle: "italic" }}>
            {cashFlowForecast.disclaimer}
          </p>
        </section>
      </div>

      {/* 3. Money Leaks Detector */}
      <section className="panel" style={{ marginBottom: "20px" }}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">Money Leak Detector</p>
            <h2>Potentially Reducible Outflows</h2>
          </div>
          <span className="health-status" style={{ background: "#fff5f2", color: "#a75e50" }}>
            {moneyLeaks.length} Leaks Detected
          </span>
        </div>

        {moneyLeaks.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
            {moneyLeaks.map((leak: any) => (
              <div
                key={leak.id}
                style={{
                  background: "#fffbfb",
                  border: "1px solid #f2ded9",
                  borderRadius: "8px",
                  padding: "14px",
                  fontSize: "11px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <strong>{leak.merchant}</strong>
                  <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "10px", background: "#f8e6e2", color: "#a75e50", fontWeight: 700 }}>
                    {leak.reducibleTag}
                  </span>
                </div>
                <p style={{ color: "var(--muted)", fontSize: "10px", margin: "0 0 10px", lineHeight: "1.4" }}>
                  {leak.reason}
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #f5e4e0", paddingTop: "8px" }}>
                  <span>Annual Saving Potential:</span>
                  <strong style={{ color: "var(--green)" }}>{formatINR(leak.annualizedReduction)}/yr</strong>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "11px" }}>
            No prominent subscription or money leaks detected in your current transaction history.
          </p>
        )}
      </section>

      {/* 4. Recurring Payments Audit */}
      <section className="panel" style={{ marginBottom: "20px" }}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">Recurring Commitments</p>
            <h2>Detected Subscriptions & Bills</h2>
          </div>
          <span className="health-status">{recurringPayments.length} Active Services</span>
        </div>

        {recurringPayments.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
            {recurringPayments.map((rec: any, idx: number) => (
              <div
                key={idx}
                style={{
                  background: "white",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  fontSize: "11px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <strong>{rec.merchant}</strong>
                  <b>{formatINR(rec.averageAmount)}/{rec.frequency === "monthly" ? "mo" : "period"}</b>
                </div>
                <small style={{ color: "var(--muted)", display: "block", marginBottom: "6px" }}>
                  {rec.count} observed payments - Next expected {rec.nextExpectedDate}
                </small>
                <small style={{ color: "var(--ink)", fontWeight: 600 }}>
                  Annualized Commitment: {formatINR(rec.annualizedCost)}
                </small>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "11px" }}>No recurring commitments detected yet.</p>
        )}
      </section>

      {/* 5. Statistically Unusual Transactions */}
      {unusualTransactions.length > 0 && (
        <section className="panel" style={{ marginBottom: "20px" }}>
          <div className="panel-header">
            <div>
              <p className="eyebrow">Anomaly Detection</p>
              <h2>Unusual Transactions</h2>
            </div>
            <span className="health-status" style={{ background: "#fff9e9", color: "#8d713a" }}>
              {unusualTransactions.length} Statistical Outliers
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {unusualTransactions.map((tx: any) => (
              <div
                key={tx.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "#fffdf9",
                  border: "1px solid #f0e6cf",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
              >
                <div>
                  <strong>{tx.description}</strong>
                  <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: "10px" }}>{tx.reason}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <b style={{ color: "#a75e50" }}>{formatINR(tx.amount)}</b>
                  <small style={{ display: "block", color: "var(--muted)", fontSize: "9px" }}>{formatDateTime(tx.occurredAt)}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. Smart Budget Recommendations */}
      {budgetSuggestions.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Spending Optimization</p>
              <h2>Suggested Category Budgets</h2>
            </div>
            <span className="health-status">Based on 90-Day Rolling Averages</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
            {budgetSuggestions.map((b: any) => (
              <div
                key={b.category}
                style={{
                  background: "white",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  fontSize: "11px",
                }}
              >
                <strong>{b.category}</strong>
                <div style={{ display: "flex", justifyContent: "space-between", margin: "6px 0", color: "var(--muted)" }}>
                  <span>Current 30d Avg:</span>
                  <span>{formatINR(b.currentMonthlyAvg)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "var(--green-dark)" }}>
                  <span>Suggested Limit:</span>
                  <span>{formatINR(b.suggestedBudget)}</span>
                </div>
                <small style={{ color: "var(--green)", display: "block", marginTop: "4px" }}>
                  Potential Monthly Saving: {formatINR(b.potentialMonthlySavings)}
                </small>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function IntelligencePanel({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/intelligence?refresh=${refreshKey}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.ok) setData(await response.json());
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading || !data) return null;

  const nextMove = data.intel?.nextBestMove?.whyFinCoachRecommendsThis ?? data.nextMove;
  const nextMoveTitle = data.intel?.nextBestMove?.title ?? "Your Next Best Move";
  const moneyLeaks = data.intel?.moneyLeaks ?? [];
  const budgetSuggestions = data.intel?.budgetSuggestions ?? [];
  const avoidableTransactions = data.intel?.avoidableTransactions ?? [];
  const savingIdeas = [
    ...avoidableTransactions.map((item: any) => ({
      key: `avoidable-${item.id}`,
      title: `Pause before repeating ${item.description}`,
      detail: `${item.reason} Recorded on ${item.occurredAt}.`,
      impact: formatINR(Number(item.amount)),
    })),
    ...moneyLeaks.slice(0, 2).map((item: any) => ({
      key: `leak-${item.id}`,
      title: `Review ${item.merchant}`,
      detail: item.reason,
      impact: `Up to ${formatINR(Number(item.annualizedReduction))}/year`,
    })),
    ...budgetSuggestions.slice(0, 2).map((item: any) => ({
      key: `budget-${item.category}`,
      title: `Set a ${item.category} spending limit`,
      detail: `Your recent pace is ${formatINR(Number(item.currentMonthlyAvg))}/month. Try staying near ${formatINR(Number(item.suggestedBudget))}.`,
      impact: `Save about ${formatINR(Number(item.potentialMonthlySavings))}/month`,
    })),
  ];

  return (
    <section className="intelligence-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">FinCoach Intelligence Engine</p>
          <p className="intelligence-intro">A simple recommendation based on your recent income, spending, and goals.</p>
          <h2>{nextMoveTitle}</h2>
        </div>
        <span className="health-status">Based on your data</span>
      </div>

      <p className="next-move">{nextMove}</p>

      <div className="intelligence-grid">
        <div>
          <small>Spent in the last 30 days</small>
          <strong>{formatINR(data.summary.expenses)}</strong>
        </div>
        <div>
          <small>Typical expense per transaction</small>
          <strong>{formatINR(data.summary.averageExpense)}</strong>
        </div>
        <div>
          <small>Estimated money left after spending</small>
          <strong>{formatINR(data.forecast.next30Days)}</strong>
        </div>
      </div>

      <div className="insight-section saving-ideas">
        <p className="eyebrow">How you can save more</p>
        {savingIdeas.length > 0 ? savingIdeas.map((idea: { key: string; title: string; detail: string; impact: string }) => (
          <div className="insight-row" key={idea.key}>
            <span>
              {idea.title}
              <small>{idea.detail}</small>
            </span>
            <b>{idea.impact}</b>
          </div>
        )) : (
          <p className="forecast-note">No clear saving leak detected yet. Keep adding categorized transactions so FinCoach can find patterns and suggest a realistic spending limit.</p>
        )}
      </div>

      <p className="forecast-note">{data.forecast.disclaimer}</p>
    </section>
  );
}

function SectionView({ section, onRefresh, targetId }: { section: string; onRefresh: () => void; targetId?: string }) {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [balanceUnlocked, setBalanceUnlocked] = useState(false);
  const [balancePassword, setBalancePassword] = useState("");
  const [balanceError, setBalanceError] = useState("");
  const [checkingBalance, setCheckingBalance] = useState(false);

  useEffect(() => {
    const endpoint = section === "Transactions" ? "/api/transactions" : section === "Accounts" ? "/api/accounts" : section === "Goals" ? "/api/goals" : null;
    if (!endpoint) return;
    fetch(endpoint).then(async (response) => { if (response.ok) { const data = await response.json(); setRecords(data[section.toLowerCase()] ?? data.transactions ?? data.accounts ?? data.goals ?? []); } });
    if (section === "Transactions") fetch("/api/accounts").then(async (response) => { if (response.ok) setAccounts((await response.json()).accounts); });
  }, [section]);

  useEffect(() => {
    if (!targetId || !records.length) return;
    const timer = window.setTimeout(() => document.querySelector(`[data-record-id="${targetId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    return () => window.clearTimeout(timer);
  }, [targetId, records]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const baseEndpoint = section === "Transactions" ? "/api/transactions" : section === "Accounts" ? "/api/accounts" : "/api/goals";
    const endpoint = editingId ? `${baseEndpoint}?id=${encodeURIComponent(editingId)}` : baseEndpoint;
    const response = await fetch(endpoint, { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setMessage(response.ok ? `${section.slice(0, -1)} saved successfully.` : (await response.json()).error ?? "Could not save this record.");
    if (response.ok) { setFormOpen(false); setEditingId(null); onRefresh(); }
  }

  async function unlockBalances(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckingBalance(true);
    setBalanceError("");
    try {
      const response = await fetch("/api/accounts/balances", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: balancePassword }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setBalanceError(data.error ?? "Incorrect password. Your balances are still protected.");
        return;
      }
      setRecords(data.accounts ?? []);
      setBalanceUnlocked(true);
      setBalancePassword("");
    } catch {
      setBalanceError("Unable to verify your password right now.");
    } finally {
      setCheckingBalance(false);
    }
  }

  function editRecord(record: Record<string, unknown>) {
    if (section === "Accounts" && !balanceUnlocked) {
      setBalanceError("Unlock account balances before editing an account.");
      return;
    }
    setEditingId(String(record.id));
    setFormOpen(true);
    setMessage("");
  }

  async function deleteRecord(record: Record<string, unknown>) {
    const label = String(record.description ?? record.name ?? "record");
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    const endpoint = section === "Transactions" ? "/api/transactions" : section === "Accounts" ? "/api/accounts" : "/api/goals";
    const response = await fetch(`${endpoint}?id=${encodeURIComponent(String(record.id))}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? `${section.slice(0, -1)} deleted.` : data.error ?? "Could not delete this record.");
    if (response.ok) { setRecords((current) => current.filter((item) => String(item.id) !== String(record.id))); onRefresh(); }
  }

  const editingRecord = records.find((record) => String(record.id) === editingId);
  const value = (key: string, fallback = "") => editingRecord?.[key] === undefined || editingRecord?.[key] === null ? fallback : String(editingRecord[key]);
  const dateValue = editingRecord?.targetDate ? new Date(String(editingRecord.targetDate)).toISOString().slice(0, 10) : value("targetDate").slice(0, 10);

  return <div className="section-workspace"><div className="section-heading"><div><p className="eyebrow">Live workspace</p><h1>{section}</h1><p className="subheading">Manage saved {section.toLowerCase()} data connected to your FinCoach account.</p></div><button className="primary-button" onClick={() => setFormOpen(!formOpen)}><Plus size={17} /> {formOpen ? "Close form" : `Add ${section.slice(0, -1).toLowerCase()}`}</button></div>
    {section === "Accounts" && (
      <div className="account-security-banner">
        <span><LockKeyhole size={15} /> Account balances are password protected.</span>
        <button className="text-button" type="button" onClick={() => { setBalanceError(""); setBalancePassword(""); setEditingId(null); setBalanceUnlocked(false); setRecords((current) => current.map((account) => { const next = { ...account }; delete next.balance; return next; })); }}> {balanceUnlocked ? <><EyeOff size={14} /> Hide balances</> : <><Eye size={14} /> Check balances</>}</button>
      </div>
    )}
    {section === "Accounts" && !balanceUnlocked && <form className="balance-unlock" onSubmit={unlockBalances}><div><strong>Verify your password to view balances</strong><small>Your account details stay hidden until you confirm your identity.</small></div><PasswordInput value={balancePassword} onChange={setBalancePassword} placeholder="Password" /><button className="primary-button" type="submit" disabled={checkingBalance}>{checkingBalance ? "Checking..." : "Unlock"}</button>{balanceError && <p className="balance-error">{balanceError}</p>}</form>}
    {formOpen && <form className="entry-form" onSubmit={submit}>{section === "Transactions" && <><select name="type" defaultValue={value("type", "expense")}><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option></select><input name="amount" type="number" min="1" step="0.01" placeholder="Amount" defaultValue={value("amount")} required /><input name="description" placeholder="Description" defaultValue={value("description")} required /><input name="category" placeholder="Category" defaultValue={value("category")} required /><select name="accountId" defaultValue={value("accountId")} required><option value="">Choose account</option>{accounts.map((account) => <option key={String(account.id)} value={String(account.id)}>{String(account.name)}{account.accountNumber ? ` • ${String(account.accountNumber)}` : ""}</option>)}</select></>}{section === "Accounts" && <><input name="name" placeholder="Account name" defaultValue={value("name")} required /><input name="accountNumber" placeholder="Account number (optional)" defaultValue={value("accountNumber")} minLength={4} maxLength={32} /><select name="type" defaultValue={value("type", "savings")}><option value="savings">Savings</option><option value="current">Current</option><option value="cash">Cash</option><option value="investment">Investment</option></select><input name="institution" placeholder="Institution" defaultValue={value("institution")} /><input name="balance" type="number" step="0.01" placeholder="Current balance" defaultValue={value("balance")} required /><input name="currency" defaultValue={value("currency", "INR")} maxLength={3} required /></>}{section === "Goals" && <><input name="name" placeholder="Goal name" defaultValue={value("name")} required /><input name="targetAmount" type="number" min="1" step="0.01" placeholder="Target amount" defaultValue={value("targetAmount")} required /><input name="currentAmount" type="number" min="0" step="0.01" placeholder="Current amount" defaultValue={value("currentAmount", "0")} required /><input name="targetDate" type="date" defaultValue={dateValue} required /><select name="priority" defaultValue={value("priority", "medium")}><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></select></>}<button className="primary-button" type="submit">{editingId ? "Update" : "Save"}</button></form>}
    {message && <p className="form-message">{message}</p>}
    <div className="records-list">{records.length ? records.map((record, index) => <div className={String(record.id) === targetId ? "record-row search-target" : "record-row"} data-record-id={String(record.id ?? index)} key={String(record.id ?? index)}><div><div style={{ display: "flex", alignItems: "center", gap: "6px" }}><strong>{String(record.description ?? record.name ?? record.category)}</strong>{record.source === "statement" && <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "8px", background: "#e8f2ec", color: "var(--green-dark)", fontWeight: 700 }}>Statement</span>}{typeof record.confidence === "number" && <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "8px", background: "#f1f5f1", color: "var(--muted)" }}>{Math.round(record.confidence)}% AI</span>}</div><small>{String(record.merchant ?? record.institution ?? record.accountNumber ?? record.type ?? "")}{record.source ? ` • ${String(record.source)}` : ""}</small></div><b>{section === "Accounts" && !balanceUnlocked ? "Protected" : formatINR(Number(record.amount ?? record.balance ?? record.currentAmount ?? 0))}</b><div className="record-actions"><button className="icon-button" type="button" onClick={() => editRecord(record)} aria-label={`Edit ${String(record.name ?? record.description ?? "record")}`} title="Edit"><Pencil size={15} /></button><button className="icon-button danger-button" type="button" onClick={() => deleteRecord(record)} aria-label={`Delete ${String(record.name ?? record.description ?? "record")}`} title="Delete"><Trash2 size={15} /></button></div></div>) : <div className="empty-panel">No {section.toLowerCase()} yet. Use the button above to add your first record.</div>}</div>
  </div>;
}


function MarketView() {
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [quote, setQuote] = useState<{ symbol: string; exchange: string; currency: string; price: number; change: number; changePercent: number; asOf: string; disclaimer: string; history: { time: string; price: number }[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [chartRange, setChartRange] = useState("1y");
  const [stocks, setStocks] = useState<{ symbol: string; currency: string; price: number | null; change: number | null; changePercent: number | null; unavailable?: boolean }[]>([]);

  async function loadQuoteForRange(range: string) {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&range=${range}`);
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Unable to load quote");
    else setQuote(data);
    setLoading(false);
  }

  async function loadQuote(event?: FormEvent) {
    event?.preventDefault();
    await loadQuoteForRange(chartRange);
  }

  useEffect(() => {
    fetch("/api/market?symbol=RELIANCE.NS&range=1y")
      .then(async (response) => {
        const data = await response.json();
        if (response.ok) setQuote(data);
        else setError(data.error ?? "Unable to load quote");
      })
      .catch(() => setError("Unable to load quote"))
      .finally(() => setLoading(false));
    fetch("/api/market?trending=true")
      .then(async (response) => { if (response.ok) setStocks((await response.json()).quotes); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const quoteCard = document.querySelector(".quote-card");
    if (!quoteCard || !quote?.history?.length) return;
    quoteCard.querySelector(".stock-graph")?.remove();
    const prices = quote.history.map((point) => point.price);
    const minimum = Math.min(...prices);
    const spread = Math.max(...prices) - minimum || 1;
    const pointList = prices.map((price, index) => `${(index / Math.max(1, prices.length - 1)) * 640},${190 - ((price - minimum) / spread) * 160}`);
    const points = pointList.join(" ");
    const lastPoint = pointList[pointList.length - 1];
    const graph = document.createElement("div");
    graph.className = "stock-graph";
    graph.innerHTML = `<div class="stock-graph-meta"><span>Price history</span><b class="stock-graph-live"><i></i> LIVE</b></div><div class="stock-chart-tabs">${[["1d", "1D"], ["5d", "5D"], ["1mo", "1M"], ["6mo", "6M"], ["1y", "1Y"], ["5y", "5Y"], ["max", "MAX"]].map(([value, label]) => `<button type="button" data-range="${value}" class="${value === chartRange ? "selected" : ""}">${label}</button>`).join("")}</div><div class="stock-graph-wrap"><svg viewBox="0 0 640 220" preserveAspectRatio="none" role="img" aria-label="Stock price history graph"><path class="stock-graph-grid" d="M0 30H640 M0 110H640 M0 190H640"></path><polygon class="stock-graph-area" points="${points} 640,210 0,210"></polygon><polyline points="${points}" fill="none" stroke="${quote.changePercent >= 0 ? "#16C7B6" : "#F59E0B"}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline><line class="stock-graph-crosshair" x1="0" y1="20" x2="0" y2="210"></line><circle class="stock-graph-point" cx="${lastPoint.split(",")[0]}" cy="${lastPoint.split(",")[1]}" r="6"></circle><rect class="stock-graph-hit-area" x="0" y="0" width="640" height="220"></rect></svg><div class="stock-graph-tooltip" hidden></div></div><div class="stock-graph-axis"><span>${new Date(quote.history[0].time).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span><span>${new Date(quote.history[quote.history.length - 1].time).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span></div>`;
    const graphWrap = graph.querySelector<HTMLElement>(".stock-graph-wrap");
    const hitArea = graph.querySelector<SVGRectElement>(".stock-graph-hit-area");
    const crosshair = graph.querySelector<SVGLineElement>(".stock-graph-crosshair");
    const tooltip = graph.querySelector<HTMLElement>(".stock-graph-tooltip");
    hitArea?.addEventListener("pointermove", (event) => {
      if (!graphWrap || !crosshair || !tooltip) return;
      const bounds = hitArea.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      const pointIndex = Math.round(position * (quote.history.length - 1));
      const point = quote.history[pointIndex];
      const pointPosition = pointList[pointIndex].split(",");
      crosshair.setAttribute("x1", pointPosition[0]);
      crosshair.setAttribute("x2", pointPosition[0]);
      tooltip.hidden = false;
      tooltip.style.left = `${Math.max(8, Math.min(bounds.width - 150, position * bounds.width - 75))}px`;
      tooltip.innerHTML = `<strong>${quote.currency} ${point.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong><span>${new Date(point.time).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>`;
    });
    hitArea?.addEventListener("pointerleave", () => { if (tooltip) tooltip.hidden = true; });
    graph.querySelectorAll<HTMLButtonElement>("[data-range]").forEach((button) => button.addEventListener("click", () => { const nextRange = button.dataset.range ?? "1y"; setChartRange(nextRange); void loadQuoteForRange(nextRange); }));
    quoteCard.appendChild(graph);
  }, [quote]);

  return <div className="section-workspace"><div className="section-heading"><div><p className="eyebrow">Live informational market data</p><h1>Market Analysis</h1><p className="subheading">Track a curated set of widely traded Indian and US stocks, or look up another symbol. Prices may be delayed.</p></div></div><form className="market-search" onSubmit={loadQuote}><input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="Symbol, e.g. RELIANCE.NS or AAPL" aria-label="Stock symbol" /><button className="primary-button" type="submit"><Search size={16} /> {loading ? "Loading" : "Get quote"}</button></form>{error && <p className="auth-error">{error}</p>}{quote && <div className="quote-card"><div><p className="eyebrow">{quote.exchange}</p><h2>{quote.symbol}</h2><small>As of {new Date(quote.asOf).toLocaleString("en-IN")}</small></div><div className="quote-price"><strong>{quote.currency} {quote.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong><span className={quote.change >= 0 ? "quote-up" : "quote-down"}>{quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)</span></div></div>}<div className="trending-header"><div><p className="eyebrow">Trending watchlist</p><h2>Live prices</h2></div><span className="health-status">{stocks.length} symbols • refreshes every 5 min</span></div><div className="stock-grid">{stocks.length ? stocks.map((stock) => <div className={stock.unavailable ? "stock-row stock-unavailable" : "stock-row"} key={stock.symbol}><strong>{stock.symbol}</strong>{stock.unavailable ? <><b>Unavailable</b><span>Try again later</span></> : <><b>{stock.currency} {stock.price?.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</b><span className={(stock.change ?? 0) >= 0 ? "quote-up" : "quote-down"}>{(stock.change ?? 0) >= 0 ? "+" : ""}{(stock.changePercent ?? 0).toFixed(2)}%</span></>}</div>) : <p className="muted">Live stock prices are currently unavailable.</p>}</div><p className="market-disclaimer">{quote?.disclaimer ?? "Market data is provided for education and information only."}</p></div>;
}

type SearchResult = { id: string; kind: string; title: string; detail: string; amount?: number };

const searchableFeatures = [
  { section: "Overview", title: "Overview", keywords: ["overview", "dashboard", "home", "summary"], detail: "View your financial dashboard" },
  { section: "Financial Scan", title: "Financial Scan", keywords: ["financial scan", "scan", "statement", "upload"], detail: "Upload and review a bank statement" },
  { section: "Transactions", title: "Transactions", keywords: ["transactions", "transaction", "expenses", "income", "records"], detail: "View and manage transactions" },
  { section: "Accounts", title: "Accounts", keywords: ["accounts", "account", "bank", "balance"], detail: "View connected accounts and balances" },
  { section: "Goals", title: "Goals", keywords: ["goals", "goal", "targets", "savings"], detail: "Track financial goals" },
  { section: "Market Analysis", title: "Market Analysis", keywords: ["market analysis", "market", "stocks", "stock", "investing"], detail: "View market data and stock quotes" },
];

function SearchBar({ onNavigate }: { onNavigate: (result: SearchResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  async function searchQuery(rawQuery: string) {
    if (rawQuery.trim().length < 2) return;
    setSearching(true);
    setSearchError("");
    const normalizedQuery = rawQuery.trim().toLowerCase();
    const featureResults: SearchResult[] = searchableFeatures
      .filter((feature) => feature.keywords.some((keyword) => keyword.includes(normalizedQuery) || normalizedQuery.includes(keyword)))
      .map((feature) => ({ id: `feature:${feature.section}`, kind: "Feature", title: feature.title, detail: feature.detail }));
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResults(featureResults);
        if (featureResults.length === 0) setSearchError(response.status === 401 ? "Please sign in again" : data.error ?? "Search is unavailable");
        return;
      }
      setResults([...featureResults, ...(data.results ?? [])]);
    } catch {
      setResults(featureResults);
      if (featureResults.length === 0) setSearchError("Search is unavailable");
    } finally {
      setSearching(false);
    }
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    await searchQuery(query);
  }
  function handleVoiceText(text: string) {
    setQuery(text);
    setResults([]);
    setSearchError("");
    void searchQuery(text);
  }
  return <form className="search-bar" onSubmit={search} aria-label="Search saved FinCoach data"><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setResults([]); setSearchError(""); }} placeholder="Search transactions, accounts, goals" aria-label="Search transactions, accounts, and goals" /><VoiceButton onText={handleVoiceText} /><button className="search-submit" type="submit" aria-label="Search" disabled={searching}><Search size={15} /></button>{results.length > 0 && <select className="search-results-select" defaultValue="" onChange={(event) => { const result = results.find((item) => item.id === event.target.value); if (result) onNavigate(result); }} aria-label="Choose a search result"><option value="">{results.length} result{results.length === 1 ? "" : "s"}</option>{results.map((result) => <option key={`${result.kind}-${result.id}`} value={result.id}>{result.kind}: {result.title}</option>)}</select>}{searching && <span className="search-status">Searching...</span>}{!searching && !searchError && query.trim().length >= 2 && results.length === 0 && <span className="search-status">No matches</span>}{searchError && <span className="search-status">{searchError}</span>}</form>;
}

function FinXResponse({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").replace(/\s*#{1,6}\s*/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;

  const clean = (value: string) => value
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*{1,3}/g, "")
    .trim();

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    if (line.includes("|") && index + 1 < lines.length && lines[index + 1].includes("|")) {
      const tableRows: string[][] = [];
      while (index < lines.length && lines[index].trim().includes("|")) {
        const cells = lines[index].split("|").map((cell) => clean(cell));
        if (cells[0] === "") cells.shift();
        if (cells[cells.length - 1] === "") cells.pop();
        if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) tableRows.push(cells);
        index += 1;
      }
      if (tableRows.length) {
        blocks.push(<div className="finx-table-wrap" key={`table-${index}`}><table className="finx-table"><thead><tr>{tableRows[0].map((cell, cellIndex) => <th key={cellIndex}>{cell}</th>)}</tr></thead><tbody>{tableRows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{tableRows[0].map((_, cellIndex) => <td key={cellIndex}>{row[cellIndex] ?? "-"}</td>)}</tr>)}</tbody></table></div>);
        continue;
      }
    }

    const heading = /^#{1,6}\s/.test(line) || /^(URGENT|WATCH|UPCOMING|HEALTHY|ANSWER|EVIDENCE|IMPACT|RECOMMENDATION|NEXT ACTIONS?|CURRENT BASELINE|SIMULATED RESULT|OPTIONS|STATUS|TARGET|PROGRESS|DECISION|STRENGTH|BIGGEST RISK|TOP AREAS|WHAT CHANGED|OUTLOOK)(?:\s*:|$)/i.test(line);
    const numbered = /^\d+[.)]\s+/.test(line);
    const bullet = /^[-*•]\s+/.test(line);
    const content = clean(line).replace(/^\d+[.)]\s+/, "").replace(/^[-*•]\s+/, "");
    blocks.push(<div className={heading ? "finx-response-heading" : numbered ? "finx-response-step" : bullet ? "finx-response-bullet" : "finx-response-line"} key={`line-${index}`}>{numbered && <b>{line.match(/^\d+/)?.[0]}.</b>}<span>{content}</span></div>);
    index += 1;
  }

  return <div className="finx-response">{blocks}</div>;
}

const OUT_OF_DOMAIN_FINX_MESSAGE = "I can only help with FinCoach features and personal finance topics, such as budgeting, saving, spending, transactions, goals, debt, investing basics, and your financial health.";

function isAllowedFinXQuestion(question: string) {
  const financeOrAppTopic = /personal finance|financial|money|budget|saving|savings|spending|expense|income|salary|cash flow|debt|loan|emi|interest|invest|investment|stock|mutual fund|sip|tax|insurance|net worth|wealth|bank|account|transaction|merchant|subscription|recurring payment|payment|goal|financial health|fincoach|finx|dashboard|financial scan|statement|upload|scan|notification|profile/i;
  const unrelatedTopic = /\b(code|coding|program|programming|c\+\+|cpp|python|javascript|java|recursion|algorithm|homework|assignment|essay|recipe|sports|movie|music|politics|celebrity|game|gaming)\b/i;
  const conversation = /^(hi|hii|hiii|hello|hey|heya|good morning|good afternoon|good evening|thanks|thank you|thx|appreciate it|who are you|what are you|what can you do|how can you help|help|bye|goodbye|see you|talk later)\b/i;
  return conversation.test(question.trim()) || (financeOrAppTopic.test(question) && !unrelatedTopic.test(question));
}

function FinXPanel({ onClose }: { onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([{ role: "assistant", text: "Hi, I'm FinX. Ask me about budgeting, saving, debt, investing basics, or your transaction history." }]);
  const [loading, setLoading] = useState(false);

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    setQuestion("");
    if (!isAllowedFinXQuestion(trimmed)) {
      setMessages((current) => [...current, { role: "assistant", text: OUT_OF_DOMAIN_FINX_MESSAGE }]);
      return;
    }
    setLoading(true);
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: trimmed }) });
    const data = await response.json().catch(() => ({}));
    setMessages((current) => [...current, { role: "assistant", text: response.ok ? data.answer : data.error ?? "FinX could not answer right now." }]);
    setLoading(false);
  }

  function speak(text: string) {
    if ("speechSynthesis" in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)); }
  }

  return <div className="chat-panel"><div className="chat-heading"><div><strong><Bot size={17} /> FinX</strong><small>Practical money guidance</small></div><button className="icon-button" onClick={onClose} aria-label="Close FinX"><X size={16} /></button></div><div className="chat-messages">{messages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>{message.role === "assistant" ? <FinXResponse text={message.text} /> : <span>{message.text}</span>}{message.role === "assistant" && <button className="speak-button" type="button" onClick={() => speak(message.text)} aria-label="Read FinX response aloud" title="Read aloud"><Volume2 size={13} /></button>}</div>)}{loading && <div className="chat-message assistant"><span>FinX is thinking...</span></div>}</div><form className="chat-form" onSubmit={ask}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask FinX a money question" aria-label="Ask FinX" /><VoiceButton onText={setQuestion} /><button type="submit" aria-label="Send question"><Send size={16} /></button></form><small className="chat-disclaimer">General education only. Do not share passwords, PINs, or OTPs.</small></div>;
}

function CashFlowChart({ data }: { data: DashboardData["cashFlow"] }) {
  const [range, setRange] = useState<4 | 6>(4);
  const visibleData = Array.from({ length: range }, (_, index) => {
    const monthDate = new Date();
    monthDate.setDate(1);
    monthDate.setMonth(monthDate.getMonth() - (range - 1 - index));
    const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    return data.find((item) => item.month === month) ?? { month, income: 0, expenses: 0 };
  });
  const maxValue = Math.max(1, ...visibleData.flatMap((item) => [Number(item.income), Number(item.expenses)]));
  return <><div className="chart-controls"><span>Income and expenses</span><div><button className={range === 4 ? "selected" : ""} type="button" onClick={() => setRange(4)}>4M</button><button className={range === 6 ? "selected" : ""} type="button" onClick={() => setRange(6)}>6M</button></div></div><div className="cashflow-chart" aria-label={`${range} month income and expenses chart`}>{visibleData.map((item) => <div className="cashflow-column" key={item.month}><div className="cashflow-bars"><span className="income-bar" style={{ height: `${Math.max(4, Number(item.income) / maxValue * 100)}%` }} title={`Income ${formatINR(Number(item.income))}`} /><span className="expense-bar" style={{ height: `${Math.max(4, Number(item.expenses) / maxValue * 100)}%` }} title={`Expenses ${formatINR(Number(item.expenses))}`} /></div><small>{new Date(`${item.month}-01`).toLocaleDateString("en-IN", { month: "short" })}</small></div>)}</div></>;
}

function SpendingChart({ items }: { items: DashboardData["spending"] }) {
  const total = items.reduce((sum, item) => sum + Number(item.amount), 0);
  const segments = items.reduce<{ parts: string[]; offset: number }>((result, item, index) => { const nextOffset = result.offset + (total ? Number(item.amount) / total * 360 : 0); result.parts.push(`${["#277b5d", "#e9826e", "#7668a9", "#c58b4e", "#5c86a4"][index % 5]} ${result.offset}deg ${nextOffset}deg`); return { parts: result.parts, offset: nextOffset }; }, { parts: [], offset: 0 }).parts.join(", ");
  return <div className="spending-chart-wrap"><div className="spending-donut" style={{ background: segments ? `conic-gradient(${segments})` : "#e8efea" }}><div><strong>{formatINR(total)}</strong><small>Total spent</small></div></div><div className="spending-legend">{items.length ? items.map((item, index) => <div key={item.category}><i style={{ background: ["#277b5d", "#e9826e", "#7668a9", "#c58b4e", "#5c86a4"][index % 5] }} /><span>{item.category}</span><b>{formatINR(Number(item.amount))}</b></div>) : <p className="muted">No spending yet.</p>}</div></div>;
}

function HealthChart({ health }: { health: DashboardData["health"] }) {
  const healthColor = health.score < 50 ? "#d96b5f" : "var(--green)";
  return <div className="health-chart"><div className="health-ring" style={{ background: `conic-gradient(${healthColor} ${health.score * 3.6}deg, #e8efea 0deg)` }}><div><strong style={{ color: health.score < 50 ? healthColor : undefined }}>{health.score}</strong><small>/100</small></div></div><div className="health-breakdown"><div><span>Savings rate</span><b>{health.savingsRate}%</b></div><div><span>Goal progress</span><b>{health.goalProgress}%</b></div><div><span>Asset position</span><b>{health.assets}/100</b></div></div></div>;
}

function normalizeUiText(text: string) {
  return text
    .replace(/Hi, I[^.]*?m FinX\./i, "Hi, I'm FinX.")
    .replace(/illustrative .*?7,500\/g\./i, "illustrative INR 7,500/g.")
    .replace(/[\u0080-\u009f\u00a0-\u00ff]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function DigitalGoldPanel({ onClose }: { onClose?: () => void }) {
  const [amount, setAmount] = useState("1000");
  const [provider, setProvider] = useState("SafeGold");
  const [confirmed, setConfirmed] = useState(false);
  const gramEstimate = Number(amount) > 0 ? Number(amount) / 7500 : 0;
  return <section className="digital-gold-panel"><div className="digital-gold-heading"><div className="gold-icon"><Coins size={20} /></div><div><p className="eyebrow">Build a small hedge</p><h2>Buy digital gold</h2></div>{onClose && <button className="icon-button" type="button" onClick={onClose} aria-label="Close digital gold panel"><X size={16} /></button>}</div>{confirmed ? <div className="gold-confirmation"><strong>Purchase plan ready</strong><p>{formatINR(Number(amount))} through {provider}, approximately {gramEstimate.toFixed(3)}g at an illustrative ₹7,500/g.</p><small>Continue with the provider&apos;s regulated checkout to complete the purchase.</small><button className="text-button" type="button" onClick={() => setConfirmed(false)}>Change plan</button></div> : <><p className="digital-gold-copy">Set an amount and choose a provider to prepare a digital-gold purchase plan.</p><label className="gold-label">Investment amount<input type="number" min="100" step="100" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label className="gold-label">Provider<select value={provider} onChange={(event) => setProvider(event.target.value)}><option>SafeGold</option><option>MMTC-PAMP</option><option>Augmont</option></select></label><button className="primary-button gold-action" type="button" onClick={() => setConfirmed(true)}><Coins size={16} /> Prepare purchase</button><small className="gold-disclaimer">Prices, taxes, storage, and provider availability must be confirmed at checkout. This is not investment advice.</small></>}</section>;
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<{ title: string; detail: string }[]>([]);
  useEffect(() => { fetch("/api/notifications").then(async (response) => { if (response.ok) setItems((await response.json()).notifications); }); }, []);
  return <div className="popover notification-popover"><div className="popover-heading"><strong>Notifications</strong><button onClick={onClose} aria-label="Close notifications"><X size={16} /></button></div>{items.length ? items.map((item) => <div className="notification-row" key={item.title}><Bell size={15} /><div><strong>{item.title}</strong><p>{item.detail}</p></div></div>) : <p className="popover-empty">You&apos;re all caught up.</p>}</div>;
}

function ProfilePanel({ user, onSaved, onLogout }: { user: DashboardData["user"]; onSaved: (name: string) => void; onLogout: () => void }) {
  const [name, setName] = useState(user.name);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setAvatarUrl(window.localStorage.getItem("fincoach-profile-picture") ?? ""); }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) { setMessage(data.error ?? "Unable to save profile"); return; }
    onSaved(data.user.name);
    setMessage("Profile saved");
  }

  function navigate(section: string) { window.dispatchEvent(new CustomEvent("fincoach:navigate", { detail: section })); }
  function openChat() { window.dispatchEvent(new CustomEvent("fincoach:open-chat")); }

  function selectAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") { setAvatarUrl(reader.result); window.localStorage.setItem("fincoach-profile-picture", reader.result); window.dispatchEvent(new CustomEvent("fincoach:avatar-updated", { detail: reader.result })); } };
    reader.readAsDataURL(file);
  }

  function removeAvatar() { setAvatarUrl(""); window.localStorage.removeItem("fincoach-profile-picture"); window.dispatchEvent(new CustomEvent("fincoach:avatar-updated", { detail: "" })); }

  return <div className="popover profile-popover"><div className="popover-heading"><strong>Your profile</strong><UserRound size={16} /></div><div className="profile-photo-row"><button className={avatarUrl ? "profile-photo profile-photo-clickable" : "profile-photo"} type="button" onClick={() => avatarUrl && setPreviewOpen(true)} aria-label={avatarUrl ? "Enlarge profile picture" : "Profile initials"}>{avatarUrl ? <img src={avatarUrl} alt="Profile" /> : <span>{user.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>}</button><div><strong>Profile picture</strong><small>{avatarUrl ? "Click photo to enlarge" : "Stored on this device"}</small></div><label className="profile-photo-upload"><Upload size={14} /> {avatarUrl ? "Change" : "Add"}<input type="file" accept="image/*" onChange={selectAvatar} /></label>{avatarUrl && <button className="profile-photo-remove" type="button" onClick={removeAvatar} aria-label="Remove profile picture" title="Remove profile picture"><Trash2 size={14} /></button>}</div><form onSubmit={saveProfile}><label>Name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required /></label><p className="profile-email">{user.email}</p><button className="primary-button profile-save" type="submit">{saving ? "Saving..." : "Save name"}</button></form>{message && <small className="profile-message">{message}</small>}<div className="profile-quick-access"><small>Quick access</small><button type="button" onClick={() => navigate("Overview")}><LayoutDashboard size={14} /> Overview</button><button type="button" onClick={() => navigate("Goals")}><Target size={14} /> Goals</button><button type="button" onClick={() => navigate("Financial Scan")}><FileScan size={14} /> Financial Scan</button><button type="button" onClick={() => navigate("Market Analysis")}><TrendingUp size={14} /> Market Analysis</button><button type="button" onClick={openChat}><Bot size={14} /> Open FinX</button></div><button className="logout-button" type="button" onClick={onLogout}><LogOut size={15} /> Log out</button>{previewOpen && <div className="profile-preview-backdrop" role="dialog" aria-modal="true" aria-label="Enlarged profile picture" onClick={() => setPreviewOpen(false)}><div className="profile-preview" onClick={(event) => event.stopPropagation()}><button className="profile-preview-close" type="button" onClick={() => setPreviewOpen(false)} aria-label="Close enlarged profile picture"><X size={18} /></button><img src={avatarUrl} alt="Enlarged profile" /></div></div>}</div>;
}

function AuthPage({ onAuthenticated }: { onAuthenticated: (dashboard: DashboardData) => void }) {
  const [loginEmail, setLoginEmail] = useState("demo@fincoach.app");
  const [loginPassword, setLoginPassword] = useState("FincoachDemo123!");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [signupError, setSignupError] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [submitting, setSubmitting] = useState<"login" | "signup" | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("fincoach-theme");
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
  }, []);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".auth-shell");
    if (!shell) return;
    shell.classList.toggle("light-mode", theme === "light");
  }, [theme]);

  async function authenticate(mode: "login" | "signup", event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(mode);
    setLoginError("");
    setSignupError("");
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
    const body = mode === "login"
      ? { email: loginEmail, password: loginPassword }
      : { name: signupName, email: signupEmail, password: signupPassword };
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (mode === "login") setLoginError(result.error ?? "Unable to sign in");
        else setSignupError(result.error ?? "Unable to create account");
        return;
      }
      const dashboardResponse = await fetch("/api/dashboard", { cache: "no-store" });
      if (!dashboardResponse.ok) {
        setLoginError("Signed in, but your workspace could not be loaded.");
        return;
      }
      onAuthenticated(await dashboardResponse.json());
    } catch {
      if (mode === "login") setLoginError("Network error. Please try again.");
      else setSignupError("Network error. Please try again.");
    } finally {
      setSubmitting(null);
    }
  }

  function requestPasswordReset(event: FormEvent) {
    event.preventDefault();
    setForgotMessage(loginEmail.trim() ? "Password reset email delivery is not configured in this local build." : "Enter your email above first, then try again.");
  }

  return <main className="auth-shell"><div className="market-visual" aria-hidden="true"><div className="market-grid" /><div className="market-bars">{Array.from({ length: 7 }, (_, index) => <i key={index} style={{ "--bar-height": `${35 + index * 8}%` } as React.CSSProperties} />)}</div><div className="market-trend" /></div><div className="auth-layout"><div className="auth-intro"><div className="auth-brand"><div className="brand-mark"><Sparkles size={18} /></div><span>Fin<span>Coach</span></span></div><p className="eyebrow">Private financial workspace</p><h1>Your money, in focus.</h1><p>Track your financial picture, uncover spending patterns, and make your next decision with more clarity.</p><div className="auth-feature-list"><span><CheckCircle2 size={15} /> Secure personal workspace</span><span><CheckCircle2 size={15} /> AI-powered financial insights</span><span><CheckCircle2 size={15} /> Screenshot statement scanning</span></div></div><div className="auth-columns"><form className="auth-card auth-form-card" onSubmit={(event) => { void authenticate("login", event); }}><p className="eyebrow">Returning member</p><h2>Welcome back.</h2><p>Sign in to view your live financial dashboard.</p><label>Email<input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} required /></label><label>Password<PasswordInput value={loginPassword} onChange={setLoginPassword} minLength={8} /></label><div className="auth-form-row"><button className="auth-forgot" type="button" onClick={requestPasswordReset}>Forgot password?</button>{forgotMessage && <small>{forgotMessage}</small>}</div>{loginError && <div className="auth-error">{loginError}</div>}<button className="primary-button" type="submit" disabled={submitting !== null}>{submitting === "login" ? "Signing in..." : "Sign in"} <ArrowUpRight size={16} /></button><small className="auth-note">Demo access is prefilled for local development.</small></form><form className="auth-card auth-form-card auth-signup-card" onSubmit={(event) => { void authenticate("signup", event); }}><p className="eyebrow">New to FinCoach</p><h2>Create your workspace.</h2><p>Start tracking your finances with your personal account.</p><label>Name<input type="text" value={signupName} onChange={(event) => setSignupName(event.target.value)} minLength={2} maxLength={120} required /></label><label>Email<input type="email" value={signupEmail} onChange={(event) => setSignupEmail(event.target.value)} required /></label><label>Password<input type="password" value={signupPassword} onChange={(event) => setSignupPassword(event.target.value)} minLength={8} required /></label>{signupError && <div className="auth-error">{signupError}</div>}<button className="primary-button" type="submit" disabled={submitting !== null}>{submitting === "signup" ? "Creating..." : "Create account"} <ArrowUpRight size={16} /></button><small className="auth-note">Your data stays in your private workspace.</small></form></div></div></main>;
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("Overview");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [searchTarget, setSearchTarget] = useState<{ section: string; id: string } | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("demo@fincoach.app");
  const [password, setPassword] = useState("FincoachDemo123!");
  const [authError, setAuthError] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [refreshing, setRefreshing] = useState(false);
  const [intelligenceRefreshKey, setIntelligenceRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsToSync, setSecondsToSync] = useState(60);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useLayoutEffect(() => {
    const normalizeTextNodes = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent ?? "";
        const normalized = normalizeUiText(text);
        if (normalized !== text) node.textContent = normalized;
      }
    };
    normalizeTextNodes(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          const text = mutation.target.textContent ?? "";
          const normalized = normalizeUiText(text);
          if (normalized !== text) mutation.target.textContent = normalized;
        } else {
          for (const node of Array.from(mutation.addedNodes)) normalizeTextNodes(node);
        }
      }
    });
    observer.observe(document.body, { characterData: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function loadDashboard() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (!response.ok) return false;
      setDashboard(await response.json());
      setLastUpdated(new Date());
      setSecondsToSync(60);
      return true;
    } catch {
      return false;
    } finally { setRefreshing(false); }
  }

  function refreshFinancialData() {
    setIntelligenceRefreshKey((value) => value + 1);
    void loadDashboard();
  }

  function navigateToSearchResult(result: SearchResult) {
    const section = result.kind === "Feature"
      ? result.id.replace("feature:", "")
      : result.kind === "Transaction" ? "Transactions" : result.kind === "Account" ? "Accounts" : "Goals";
    setSearchTarget({ section, id: result.id });
    setActiveSection(section);
  }

  useEffect(() => {
    let cancelled = false;
    const initialClockTimer = window.setTimeout(() => { if (!cancelled) setCurrentTime(new Date()); }, 0);
    void loadDashboard().finally(() => {
      if (!cancelled) { setLoading(false); setSecondsToSync(60); }
    });
    const countdownTimer = window.setInterval(() => { if (!cancelled) setSecondsToSync((value) => value <= 1 ? 60 : value - 1); }, 1000);
    const clockTimer = window.setInterval(() => { if (!cancelled) setCurrentTime(new Date()); }, 60000);
    return () => { cancelled = true; window.clearTimeout(initialClockTimer); window.clearInterval(countdownTimer); window.clearInterval(clockTimer); };
  }, []);

  useEffect(() => {
    if (!dashboard) return;
    const refreshTimer = window.setInterval(() => { void loadDashboard(); }, 60000);
    return () => window.clearInterval(refreshTimer);
  }, [dashboard]);

  useEffect(() => {
    setAvatarUrl(window.localStorage.getItem("fincoach-profile-picture") ?? "");
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("fincoach-theme");
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
  }, []);

  useEffect(() => {
    if (dashboard) return;
    const shell = document.querySelector<HTMLElement>(".auth-shell");
    if (!shell) return;
    shell.classList.toggle("light-mode", theme === "light");
    const brand = shell.querySelector<HTMLElement>(".auth-brand");
    if (!brand) return;
    let toggle = brand.querySelector<HTMLButtonElement>(".login-theme-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.className = "login-theme-toggle";
      toggle.type = "button";
      toggle.addEventListener("click", toggleTheme);
      brand.appendChild(toggle);
    }
    toggle.textContent = theme === "dark" ? "☀" : "☾";
    toggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    toggle.title = theme === "dark" ? "Light mode" : "Dark mode";
    return () => toggle?.remove();
  }, [dashboard, theme]);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem("fincoach-theme", next);
      return next;
    });
  }


  useEffect(() => {
    const handleAvatarUpdate = (event: Event) => {
      setAvatarUrl((event as CustomEvent<string>).detail ?? "");
    };
    window.addEventListener("fincoach:avatar-updated", handleAvatarUpdate);
    return () => window.removeEventListener("fincoach:avatar-updated", handleAvatarUpdate);
  }, []);

  function updateAvatar(url: string) {
    setAvatarUrl(url);
    if (url) window.localStorage.setItem("fincoach-profile-picture", url);
    else window.localStorage.removeItem("fincoach-profile-picture");
  }

  useEffect(() => {
    const navigate = (event: Event) => { setActiveSection((event as CustomEvent<string>).detail); setProfileOpen(false); };
    const openChat = () => { setChatOpen(true); setProfileOpen(false); };
    window.addEventListener("fincoach:navigate", navigate);
    window.addEventListener("fincoach:open-chat", openChat);
    return () => { window.removeEventListener("fincoach:navigate", navigate); window.removeEventListener("fincoach:open-chat", openChat); };
  }, []);

  useEffect(() => {
    if (!dashboard) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8%" });
    const registerTargets = (root: ParentNode) => root.querySelectorAll<HTMLElement>(".metric-card, .sync-banner, .section-heading, .records-list, .quote-card, .stock-grid, .scan-panel, .entry-form").forEach((target) => {
      if (target.classList.contains("scroll-reveal")) return;
      target.classList.add("scroll-reveal");
      observer.observe(target);
    });
    registerTargets(document);
    const mutations = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => { if (node instanceof HTMLElement) registerTargets(node); })));
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, [activeSection, dashboard]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const endpoint = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    const body = authMode === "signup" ? { name, email, password } : { email, password };
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setAuthError(body.error ?? "Unable to sign in");
      return;
    }
    await loadDashboard();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setDashboard(null);
    setProfileOpen(false);
    setActiveSection("Overview");
  }

  if (loading) return <main className="auth-shell"><div className="market-visual" aria-hidden="true"><div className="market-grid" /><div className="market-bars">{Array.from({ length: 7 }, (_, index) => <i key={index} style={{ "--bar-height": `${35 + index * 8}%` } as React.CSSProperties} />)}</div><div className="market-trend" /></div><div className="auth-card"><div className="brand-mark"><Sparkles size={18} /></div><h1>Loading your money picture...</h1><p>Connecting securely to FinCoach.</p></div></main>;

  if (!dashboard) return <main className="auth-shell"><div className="market-visual" aria-hidden="true"><div className="market-grid" /><div className="market-bars">{Array.from({ length: 7 }, (_, index) => <i key={index} style={{ "--bar-height": `${35 + index * 8}%` } as React.CSSProperties} />)}</div><div className="market-trend" /></div><form className="auth-card" onSubmit={handleLogin}><div className="auth-brand"><div className="brand-mark"><Sparkles size={18} /></div><span>Fin<span>Coach</span></span></div><p className="eyebrow">Private financial workspace</p><h1>{authMode === "login" ? "Welcome back." : "Create your workspace."}</h1><p>{authMode === "login" ? "Sign in to view your live financial dashboard." : "Use your personal email to start tracking your finances."}</p>{authMode === "signup" && <label>Name<input type="text" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required /></label>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<PasswordInput value={password} onChange={setPassword} minLength={8} /></label>{authError && <div className="auth-error">{authError}</div>}<button className="primary-button" type="submit">{authMode === "login" ? "Sign in" : "Create account"} <ArrowUpRight size={16} /></button><button className="auth-switch" type="button" onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}>{authMode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button>{authMode === "login" && <small>Demo access is prefilled for local development.</small>}</form></main>;

  const { snapshot } = dashboard;
  const greeting = currentTime
    ? currentTime.getHours() < 12 ? "Good morning" : currentTime.getHours() < 18 ? "Good afternoon" : "Good evening"
    : "Hello";
  const dateLabel = currentTime?.toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const timeLabel = currentTime?.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return (
    <main className={theme === "light" ? "app-shell light-mode" : "app-shell"}>
      <section className="content-area">
        <header className="topbar"><div className="topbar-brand"><div className="brand-mark"><Sparkles size={18} strokeWidth={2.5} /></div><span>Fin<span>Coach</span></span></div><div className="topbar-actions"><button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button><span className="live-status"><i /> Live{lastUpdated ? ` • ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span><button className={refreshing ? "icon-button refresh-button spinning" : "icon-button refresh-button"} onClick={() => { void loadDashboard(); }} aria-label="Refresh dashboard" title="Refresh dashboard"><RefreshCw size={16} /></button><SearchBar onNavigate={navigateToSearchResult} /><button className="icon-button notification-button" onClick={() => { setNotificationOpen(!notificationOpen); setProfileOpen(false); setChatOpen(false); }} aria-label="Notifications"><Bell size={19} /><i /></button><button className="top-avatar profile-trigger" onClick={() => { setProfileOpen(!profileOpen); setNotificationOpen(false); setChatOpen(false); }} aria-label="Open profile">{avatarUrl ? <img src={avatarUrl} alt="Profile" /> : dashboard.user.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</button>{notificationOpen && <NotificationPanel onClose={() => setNotificationOpen(false)} />}{profileOpen && <ProfilePanel user={dashboard.user} onSaved={(name) => setDashboard({ ...dashboard, user: { ...dashboard, name } })} onLogout={handleLogout} />}</div></header>
        {activeSection !== "Overview" && <nav className="workspace-nav workspace-nav-global" aria-label="Workspace navigation">{navItems.map((item) => { const Icon = item.icon; return <button key={item.label} className={activeSection === item.label ? "nav-item active" : "nav-item"} onClick={() => { setActiveSection(item.label); setMenuOpen(false); }}><Icon size={18} /><span>{item.label}</span>{item.label === "Transactions" && <em>Live</em>}</button>; })}</nav>}
        <div className={activeSection === "Overview" ? "page-content" : "page-content page-hidden"}>
          <section className="portfolio-summary" aria-label="Portfolio summary">
            <div className="portfolio-value-card"><div><p className="eyebrow">Quick portfolio summary</p><strong>{formatINR(snapshot.totalAssets)}</strong><span>Net worth / total portfolio value</span></div><span className="portfolio-change"><TrendingUp size={14} /> +2.4% <small>this month</small></span></div>
            <div className="portfolio-goals"><p className="eyebrow">Active goals progress</p>{dashboard.goals.length ? dashboard.goals.slice(0, 2).map((goal) => { const progress = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)); return <div className="portfolio-goal" key={goal.id}><div><span>{goal.name}</span><b>{progress}%</b></div><div className="portfolio-goal-track"><i style={{ width: `${progress}%` }} /></div><small>Remaining balance: {formatINR(Math.max(0, goal.targetAmount - goal.currentAmount))}</small></div>; }) : <p className="portfolio-empty">Add a goal to track your progress here.</p>}</div>
            <div className="portfolio-actions"><p className="eyebrow">Quick action</p><div><button type="button" onClick={() => setActiveSection("Transactions")}><Plus size={16} /> Add transaction</button><button type="button" onClick={() => setActiveSection("Transactions")}><RefreshCw size={16} /> Transfer funds</button><button type="button" onClick={() => document.querySelector(".snapshot-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })}><TrendingUp size={16} /> Analyze portfolio</button></div></div>
          </section>
          <nav className="workspace-nav" aria-label="Workspace navigation">{navItems.map((item) => { const Icon = item.icon; return <button key={item.label} className={activeSection === item.label ? "nav-item active" : "nav-item"} onClick={() => { setActiveSection(item.label); setMenuOpen(false); }}><Icon size={18} /><span>{item.label}</span>{item.label === "Transactions" && <em>Live</em>}</button>; })}<div className="nav-finx-dock">{chatOpen && <FinXPanel onClose={() => setChatOpen(false)} />}<button className={chatOpen ? "finx-launcher open" : "finx-launcher"} onClick={() => { setChatOpen(!chatOpen); setProfileOpen(false); setNotificationOpen(false); }} aria-label={chatOpen ? "Close FinX assistant" : "Open FinX assistant"} aria-expanded={chatOpen}><Bot size={18} /><span>{chatOpen ? "Close FinX" : "FinX"}</span></button></div></nav>
          <div className="sync-banner"><div className="sync-pulse"><i /><span>LIVE</span></div><div><strong>Your financial workspace is live</strong><small>Updates automatically in {secondsToSync}s{lastUpdated ? ` • Last synced ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</small></div><button className={refreshing ? "sync-refresh spinning" : "sync-refresh"} type="button" onClick={() => { void loadDashboard(); }}><RefreshCw size={15} /> {refreshing ? "Syncing..." : "Sync now"}</button></div>
          <div className="snapshot-grid">
            <article className="metric-card primary-metric"><div className="card-heading"><span>Total income</span></div><div className="metric-value">{formatINR(snapshot.totalIncome)}</div><div className="metric-foot positive"><TrendingUp size={14} /> Live <span>from incoming transactions</span></div></article>
            <article className="metric-card"><div className="card-heading"><span>Monthly savings needed</span><span className="mini-icon green"><PiggyBank size={15} /></span></div><div className="metric-value">{formatINR(snapshot.requiredGoalSavings)}</div><div className="metric-foot positive"><TrendingUp size={14} /> Goal plan <span>for your deadlines</span></div><div className="metric-progress"><span style={{ width: `${snapshot.monthlyIncome ? Math.min(100, Math.max(0, (snapshot.requiredGoalSavings / snapshot.monthlyIncome) * 100)) : 0}%` }} /></div><small>{snapshot.monthlyIncome ? Math.round((snapshot.requiredGoalSavings / snapshot.monthlyIncome) * 100) : 0}% of monthly income</small></article>
            <article className="metric-card"><div className="card-heading"><span>Available to spend</span><span className="mini-icon blue"><CreditCard size={15} /></span></div><div className="metric-value">{formatINR(Math.max(0, snapshot.availableToSpend))}</div><div className="metric-foot"><span className="muted">After expenses and goal savings</span></div><div className="metric-progress blue-progress"><span style={{ width: `${snapshot.monthlyIncome ? Math.min(100, Math.max(0, (snapshot.availableToSpend / snapshot.monthlyIncome) * 100)) : 0}%` }} /></div><small>{formatINR(snapshot.monthlyExpenses)} spent • {formatINR(snapshot.requiredGoalSavings)} goals</small></article>
            <article className="metric-card health-card"><div className="card-heading"><span>Financial health</span><span className="health-status">Calculated</span></div><HealthChart health={dashboard.health} /></article>
          </div>
          <div className="main-grid">
            <section className="panel cashflow-panel"><div className="panel-header"><div><p className="eyebrow">Cash flow</p><h2>Six month trend</h2></div><span className="health-status">Live</span></div><div className="chart-legend"><span><i className="income-dot" /> Income</span><span><i className="expense-dot" /> Expenses</span></div><CashFlowChart data={dashboard.cashFlow} /><div className="cashflow-summary"><div><small>Income</small><strong>{formatINR(snapshot.monthlyIncome)}</strong></div><div><small>Expenses</small><strong>{formatINR(snapshot.monthlyExpenses)}</strong></div><div><small>Goal savings needed</small><strong>{formatINR(snapshot.requiredGoalSavings)}</strong></div></div></section>
            <section className="panel spending-panel"><div className="panel-header"><div><p className="eyebrow">This month</p><h2>Spending</h2></div><span className="health-status">Live</span></div><SpendingChart items={dashboard.spending} /></section>
          </div>
          <IntelligencePanel refreshKey={intelligenceRefreshKey} />
        </div>
        {activeSection === "Financial Scan" && <div className="page-content section-content"><StatementScanPanel onScanCompleted={refreshFinancialData} /></div>}
        {activeSection === "Market Analysis" && <div className="page-content section-content"><MarketView /></div>}
        {activeSection !== "Overview" && activeSection !== "Market Analysis" && activeSection !== "Financial Scan" && <div className="page-content section-content"><SectionView section={activeSection} targetId={searchTarget?.section === activeSection ? searchTarget.id : undefined} onRefresh={refreshFinancialData} /></div>}

      </section>
      <div className={menuOpen ? "mobile-overlay visible" : "mobile-overlay"} onClick={() => setMenuOpen(false)} />
    </main>
  );
}
