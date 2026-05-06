import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import axios from "axios";
import { toJpeg, toPng } from "html-to-image";
import { FileText, Upload, X } from "lucide-react";

type LineItem = {
  name: string;
  amount: number;
};

type ReceiptData = {
  merchant: string;
  date: string;
  lineItems: LineItem[];
  total: number;
};

type SavedReceipt = {
  id: string;
  createdAt: string;
  updatedAt: string;
  data: ReceiptData;
};

type ToastState = {
  type: "success" | "error";
  message: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const currencyFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

function roundToTwo(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateTotal(lineItems: LineItem[]) {
  const sum = lineItems.reduce((runningTotal, item) => runningTotal + Number(item.amount || 0), 0);
  return roundToTwo(sum);
}

function normalizeReceipt(raw: ReceiptData): ReceiptData {
  return {
    merchant: raw.merchant ?? "",
    date: raw.date ?? "",
    lineItems: (raw.lineItems ?? []).map((item) => ({
      name: item.name ?? "",
      amount: Number(item.amount ?? 0),
    })),
    total: roundToTwo(Number(raw.total ?? 0)),
  };
}

function readErrorMessage(error: unknown, fallback: string) {
  return (
    (error as any)?.response?.data?.details ??
    (error as any)?.response?.data?.error ??
    (error as any)?.message ??
    fallback
  );
}

function triggerDownload(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white ${
        className ?? ""
      }`}
      aria-hidden="true"
    />
  );
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSavedReceipts, setIsLoadingSavedReceipts] = useState(false);
  const [isExporting, setIsExporting] = useState<null | "png" | "jpg">(null);
  const [parsedReceipt, setParsedReceipt] = useState<ReceiptData | null>(null);
  const [savedReceipts, setSavedReceipts] = useState<SavedReceipt[]>([]);
  const [activeReceiptId, setActiveReceiptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const reviewCardRef = useRef<HTMLDivElement>(null);
  const exportCardRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);

  const canSubmit = useMemo(() => file && !isParsing, [file, isParsing]);
  const uploadLocked = Boolean(file);
  const isBusy = isParsing || isSaving;
  const hasMissingCoreFields = useMemo(() => {
    if (!parsedReceipt) return false;
    return !parsedReceipt.merchant.trim() || !parsedReceipt.date.trim();
  }, [parsedReceipt]);

  const fetchSavedReceipts = async () => {
    setIsLoadingSavedReceipts(true);
    try {
      const response = await axios.get<SavedReceipt[]>(`${apiBaseUrl}/api/receipts`);
      setSavedReceipts(response.data);
    } finally {
      setIsLoadingSavedReceipts(false);
    }
  };

  useEffect(() => {
    fetchSavedReceipts().catch(() => {
      setError("Could not load saved receipts.");
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const preventWindowDrop = (event: DragEvent | globalThis.DragEvent) => {
      event.preventDefault();
    };

    window.addEventListener("dragover", preventWindowDrop);
    window.addEventListener("drop", preventWindowDrop);
    return () => {
      window.removeEventListener("dragover", preventWindowDrop);
      window.removeEventListener("drop", preventWindowDrop);
    };
  }, []);

  const resetCurrentDraft = () => {
    setParsedReceipt(null);
    setActiveReceiptId(null);
  };

  const assignFile = (nextFile: File | null) => {
    if (isParsing) return;
    if (uploadLocked && nextFile) return;
    if (nextFile && !["image/jpeg", "image/png"].includes(nextFile.type)) {
      setError("Only JPG and PNG images are supported.");
      return;
    }
    setFile(nextFile);
    setError(null);
    if (nextFile) {
      resetCurrentDraft();
    }
  };

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError("Please choose an image first.");
      return;
    }

    setError(null);
    setIsParsing(true);

    try {
      const formData = new FormData();
      formData.append("receipt", file);

      const response = await axios.post<ReceiptData>(`${apiBaseUrl}/api/parse`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setParsedReceipt(normalizeReceipt(response.data));
      setActiveReceiptId(null);
      setToast({ type: "success", message: "Receipt parsed. Review and correct before saving." });
    } catch (e) {
      setError(`Parsing failed. ${readErrorMessage(e, "Could not extract receipt details.")}`);
    } finally {
      setIsParsing(false);
    }
  };

  const updateLineItem = (index: number, key: keyof LineItem, value: string) => {
    if (!parsedReceipt) return;
    const items = [...parsedReceipt.lineItems];
    const item = items[index];
    if (!item) return;

    items[index] = {
      ...item,
      [key]: key === "amount" ? Number(value || 0) : value,
    };

    setParsedReceipt({
      ...parsedReceipt,
      lineItems: items,
      total: calculateTotal(items),
    });
  };

  const addLineItem = () => {
    if (!parsedReceipt) return;
    const nextItems = [...parsedReceipt.lineItems, { name: "", amount: 0 }];
    setParsedReceipt({
      ...parsedReceipt,
      lineItems: nextItems,
      total: calculateTotal(nextItems),
    });
  };

  const removeLineItem = (index: number) => {
    if (!parsedReceipt) return;
    const nextItems = parsedReceipt.lineItems.filter((_, itemIndex) => itemIndex !== index);
    setParsedReceipt({
      ...parsedReceipt,
      lineItems: nextItems,
      total: calculateTotal(nextItems),
    });
  };

  const saveReceipt = async () => {
    if (!parsedReceipt) return;
    setIsSaving(true);
    setError(null);

    try {
      if (activeReceiptId) {
        await axios.put(`${apiBaseUrl}/api/receipts/${activeReceiptId}`, parsedReceipt);
        setToast({ type: "success", message: "Receipt updated successfully." });
      } else {
        await axios.post(`${apiBaseUrl}/api/receipts`, parsedReceipt);
        setToast({ type: "success", message: "Corrected receipt saved successfully." });
      }
      await fetchSavedReceipts();
    } catch (e) {
      setError(`Failed to save receipt. ${readErrorMessage(e, "")}`.trim());
    } finally {
      setIsSaving(false);
    }
  };

  const exportAs = async (format: "png" | "jpg") => {
    if (!exportCardRef.current) return;

    setIsExporting(format);
    setError(null);
    try {
      const dataUrl =
        format === "png"
          ? await toPng(exportCardRef.current, {
              cacheBust: true,
              backgroundColor: "#ffffff",
              pixelRatio: 2,
            })
          : await toJpeg(exportCardRef.current, {
              cacheBust: true,
              quality: 0.95,
              backgroundColor: "#ffffff",
              pixelRatio: 2,
            });
      triggerDownload(dataUrl, `receipt-review.${format === "png" ? "png" : "jpg"}`);
      setToast({ type: "success", message: `Exported ${format.toUpperCase()} successfully.` });
    } catch (e) {
      setError(`Export failed. ${readErrorMessage(e, "Please try again.")}`);
    } finally {
      setIsExporting(null);
    }
  };

  const openSavedReceipt = (receipt: SavedReceipt) => {
    setParsedReceipt(normalizeReceipt(receipt.data));
    setActiveReceiptId(receipt.id);
    setError(null);
    setToast({ type: "success", message: "Loaded saved receipt for editing." });
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (uploadLocked) return;
    dragDepthRef.current = 0;
    setDragActive(false);
    const dropped = event.dataTransfer.files?.[0] ?? null;
    assignFile(dropped ?? null);
  };

  const clearSelectedFile = () => {
    setFile(null);
    setError(null);
    resetCurrentDraft();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      {toast ? (
        <div
          className={`fixed right-4 top-4 z-50 rounded-lg px-4 py-2 text-sm text-white shadow ${
            toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="rounded-2xl bg-white p-6 shadow">
          <h1 className="mb-2 text-2xl font-bold">Receipt Parser</h1>
          <p className="mb-4 text-sm text-slate-600">
            Upload JPG/PNG, parse via LLM, edit extracted values, save corrected receipt, and export review as image.
          </p>

          <div
            onDragEnter={(event) => {
              event.preventDefault();
              if (isParsing || uploadLocked) return;
              dragDepthRef.current += 1;
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (isParsing || uploadLocked) return;
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
              if (dragDepthRef.current === 0) {
                setDragActive(false);
              }
            }}
            onDrop={onDrop}
            className={`rounded-xl border border-slate-200 p-4 ${
              dragActive ? "bg-sky-50/60" : "bg-white"
            } transition`}
          >
            <form onSubmit={handleUpload} className="flex flex-col gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={(event) => assignFile(event.target.files?.[0] ?? null)}
                disabled={isParsing || uploadLocked}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing || uploadLocked}
                className={`group flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
                  dragActive
                    ? "border-sky-500 bg-sky-50"
                    : "border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50"
                } enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 group-hover:bg-blue-200">
                  <Upload className="h-6 w-6" />
                </span>
                <span className="text-base font-semibold text-slate-800">Select a receipt image to upload</span>
                <span className="mt-1 text-sm text-slate-500">or drag and drop it here</span>
              </button>
              {file ? (
                <div className="relative inline-flex w-fit items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 pr-7 text-sm text-slate-700">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <span className="font-medium">{file.name}</span>
                  <button
                    type="button"
                    onClick={clearSelectedFile}
                    className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 hover:bg-slate-100 enabled:cursor-pointer"
                    aria-label="Remove selected file"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : null}
              <button
                type="submit"
                disabled={!canSubmit}
                className="mx-auto inline-flex min-w-52 items-center justify-center gap-2 rounded-lg bg-slate-900 px-8 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-slate-800 hover:shadow enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
              >
                {isParsing ? <Spinner /> : null}
                {isParsing ? "Parsing..." : "Parse Receipt"}
              </button>
            </form>
          </div>

          {isParsing ? (
            <p className="mt-3 text-sm text-slate-600" role="status">
              Extracting structured data from receipt...
            </p>
          ) : null}

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </div>

        {parsedReceipt ? (
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <div ref={reviewCardRef} className="relative rounded-2xl bg-white p-6 shadow">
                {isSaving ? (
                  <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-white/70 backdrop-blur-[1px]">
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                      <Spinner />
                      Saving changes...
                    </div>
                  </div>
                ) : null}

                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Review and Correct</h2>
                    <p className="text-xs text-slate-500">Edits are local until you save.</p>
                  </div>
                </div>

                {hasMissingCoreFields ? (
                  <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Could not extract some fields. Please review merchant and date.
                  </p>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Merchant</span>
                    <input
                      value={parsedReceipt.merchant}
                      onChange={(event) => setParsedReceipt({ ...parsedReceipt, merchant: event.target.value })}
                      disabled={isBusy}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </label>

                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Date</span>
                    <input
                      value={parsedReceipt.date}
                      onChange={(event) => setParsedReceipt({ ...parsedReceipt, date: event.target.value })}
                      disabled={isBusy}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </label>
                </div>

                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-medium"></h3>
                    <button
                      type="button"
                      onClick={addLineItem}
                      disabled={isBusy}
                      className="text-sm font-medium text-slate-700 underline enabled:cursor-pointer disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      Add item
                    </button>
                  </div>

                  {parsedReceipt.lineItems.length === 0 ? (
                    <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                      No items extracted yet. Add items manually.
                    </p>
                  ) : null}

                  <div className="space-y-2">
                    {parsedReceipt.lineItems.map((item, index) => (
                      <div key={`${index}-${item.name}`} className="grid grid-cols-12 gap-2">
                        <input
                          value={item.name}
                          onChange={(event) => updateLineItem(index, "name", event.target.value)}
                          disabled={isBusy}
                          className="col-span-7 rounded border border-slate-300 px-3 py-2"
                          placeholder="Item name"
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={item.amount}
                          onChange={(event) => updateLineItem(index, "amount", event.target.value)}
                          disabled={isBusy}
                          className="col-span-4 rounded border border-slate-300 px-3 py-2"
                          placeholder="0.00"
                        />
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          disabled={isBusy}
                          className="col-span-1 rounded bg-red-100 px-2 text-sm text-red-700 hover:bg-red-200 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <label className="mt-6 block text-sm">
                  <span className="mb-1 block font-medium">Total</span>
                  <input
                    type="number"
                    step="0.01"
                    value={parsedReceipt.total}
                    onChange={(event) =>
                      setParsedReceipt({ ...parsedReceipt, total: roundToTwo(Number(event.target.value || 0)) })
                    }
                    disabled={isBusy}
                    className="w-full rounded border border-slate-300 px-3 py-2 sm:max-w-xs"
                  />
                </label>

                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveReceipt}
                    disabled={isSaving}
                    className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-emerald-400"
                  >
                    <span className="inline-flex items-center gap-2">
                      {isSaving ? <Spinner /> : null}
                      {isSaving ? "Saving..." : activeReceiptId ? "Update Receipt" : "Save Corrected Receipt"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportAs("png")}
                    disabled={isSaving || isExporting !== null}
                    className="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    <span className="inline-flex items-center gap-2">
                      {isExporting === "png" ? <Spinner /> : null}
                      Download PNG
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportAs("jpg")}
                    disabled={isSaving || isExporting !== null}
                    className="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    <span className="inline-flex items-center gap-2">
                      {isExporting === "jpg" ? <Spinner /> : null}
                      Download JPG
                    </span>
                  </button>
                </div>
              </div>

              <div className="sr-only" aria-hidden="true">
                <div
                  ref={exportCardRef}
                  style={{
                    width: "900px",
                    backgroundColor: "#ffffff",
                    color: "#0f172a",
                    padding: "32px",
                    fontFamily:
                      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                  }}
                >
                  <h1 style={{ margin: 0, fontSize: "30px", fontWeight: 700 }}>Receipt Review</h1>
                  <p style={{ margin: "6px 0 0", color: "#475569", fontSize: "16px" }}>
                    Corrected export generated from parsed data
                  </p>

                  <div
                    style={{
                      marginTop: "18px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      padding: "20px",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "18px",
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Merchant</p>
                        <p style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: 600 }}>
                          {parsedReceipt.merchant || "-"}
                        </p>
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Date</p>
                        <p style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: 600 }}>
                          {parsedReceipt.date || "-"}
                        </p>
                      </div>
                    </div>

                    <h2 style={{ margin: "24px 0 10px", fontSize: "18px", fontWeight: 600 }}>Items</h2>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                      <thead>
                        <tr>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 12px",
                              borderBottom: "1px solid #cbd5e1",
                              backgroundColor: "#f8fafc",
                            }}
                          >
                            Item
                          </th>
                          <th
                            style={{
                              textAlign: "right",
                              padding: "10px 12px",
                              borderBottom: "1px solid #cbd5e1",
                              backgroundColor: "#f8fafc",
                            }}
                          >
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedReceipt.lineItems.length > 0 ? (
                          parsedReceipt.lineItems.map((item, index) => (
                            <tr key={`export-${index}-${item.name}`}>
                              <td style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
                                {item.name || "-"}
                              </td>
                              <td
                                style={{
                                  padding: "10px 12px",
                                  borderBottom: "1px solid #e2e8f0",
                                  textAlign: "right",
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {currencyFormatter.format(Number(item.amount || 0))}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={2}
                              style={{
                                padding: "12px",
                                borderBottom: "1px solid #e2e8f0",
                                textAlign: "center",
                                color: "#64748b",
                              }}
                            >
                              No items
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    <div
                      style={{
                        marginTop: "20px",
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "16px",
                        alignItems: "baseline",
                      }}
                    >
                      <span style={{ fontSize: "16px", color: "#475569" }}>Total</span>
                      <span style={{ fontSize: "28px", fontWeight: 700 }}>
                        {currencyFormatter.format(Number(parsedReceipt.total || 0))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <aside className="rounded-2xl bg-white p-4 shadow lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Uploaded Image Preview</h3>
              {previewUrl ? (
                <img src={previewUrl} alt="Uploaded receipt preview" className="max-h-112 w-full rounded object-contain" />
              ) : (
                <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  No receipt uploaded.
                </p>
              )}
            </aside>
          </div>
        ) : (
          <div>
            {/* <h2 className="mb-2 text-lg font-semibold">No receipt uploaded</h2>
            <p className="text-sm text-slate-500">
              Upload a JPG/PNG receipt and parse it to begin reviewing extracted fields.
            </p> */}
          </div>
        )}

        <div className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-3 text-xl font-semibold">Previously Saved Receipts</h2>
          {isLoadingSavedReceipts ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded border border-slate-200 p-3">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-slate-200" />
                  <div className="mt-3 h-7 w-24 animate-pulse rounded bg-slate-200" />
                </div>
              ))}
            </div>
          ) : savedReceipts.length === 0 ? (
            <p className="text-sm text-slate-500">No saved receipts yet.</p>
          ) : (
            <div className="space-y-3">
              {savedReceipts.map((receipt) => (
                <div key={receipt.id} className="rounded border border-slate-200 p-3 text-sm">
                  <p>
                    <span className="font-medium">Merchant:</span> {receipt.data.merchant || "-"}
                  </p>
                  <p>
                    <span className="font-medium">Date:</span> {receipt.data.date || "-"}
                  </p>
                  <p>
                    <span className="font-medium">Total:</span> {currencyFormatter.format(Number(receipt.data.total || 0))}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-slate-500">Updated: {new Date(receipt.updatedAt).toLocaleString()}</p>
                    <button
                      type="button"
                      onClick={() => openSavedReceipt(receipt)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 enabled:cursor-pointer disabled:cursor-not-allowed"
                    >
                      Open / Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;