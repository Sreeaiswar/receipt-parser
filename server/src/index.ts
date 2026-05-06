import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { parseReceiptWithLlm } from "./llm";
import { saveReceiptRequestSchema } from "./receiptSchema";
import { readReceipts, writeReceipts } from "./storage";
import { SavedReceipt } from "./types";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => {
  res
    .status(200)
    .type("text/plain")
    .send(
      [
        "Receipt Parser API is running.",
        "",
        "Try:",
        "- GET  /api/health",
        "- POST /api/parse (multipart form-data field: receipt)",
        "- GET  /api/receipts",
        "- POST /api/receipts",
        "",
        "UI runs separately on the Vite dev server (usually http://localhost:5173).",
      ].join("\n")
    );
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/parse", upload.single("receipt"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Receipt image is required." });
      return;
    }

    const allowedTypes = new Set(["image/jpeg", "image/png"]);
    if (!allowedTypes.has(req.file.mimetype)) {
      res.status(400).json({ error: "Only JPG and PNG files are supported." });
      return;
    }

    const imageBase64 = req.file.buffer.toString("base64");
    const parsed = await parseReceiptWithLlm(imageBase64, req.file.mimetype);
    res.json(parsed);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Failed to parse receipt.", details: message });
  }
});

app.get("/api/receipts", async (_req, res) => {
  try {
    const receipts = await readReceipts();
    res.json(receipts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to read saved receipts." });
  }
});

app.post("/api/receipts", async (req, res) => {
  try {
    const payload = saveReceiptRequestSchema.parse(req.body);
    const existing = await readReceipts();
    const now = new Date().toISOString();

    const savedReceipt: SavedReceipt = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      data: payload,
    };

    existing.unshift(savedReceipt);
    await writeReceipts(existing);
    res.status(201).json(savedReceipt);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid receipt payload.", details: error.issues });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Failed to save receipt." });
  }
});

app.put("/api/receipts/:id", async (req, res) => {
  try {
    const payload = saveReceiptRequestSchema.parse(req.body);
    const existing = await readReceipts();
    const receiptIndex = existing.findIndex((receipt) => receipt.id === req.params.id);

    if (receiptIndex === -1) {
      res.status(404).json({ error: "Receipt not found." });
      return;
    }

    const now = new Date().toISOString();
    const current = existing[receiptIndex];
    if (!current) {
      res.status(404).json({ error: "Receipt not found." });
      return;
    }

    const updated: SavedReceipt = {
      ...current,
      updatedAt: now,
      data: payload,
    };

    existing[receiptIndex] = updated;
    await writeReceipts(existing);
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid receipt payload.", details: error.issues });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Failed to update receipt." });
  }
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Receipt parser API running at http://localhost:${port}`);
});
