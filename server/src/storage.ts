import { promises as fs } from "node:fs";
import path from "node:path";
import { SavedReceipt } from "./types";

const dataDir = path.resolve(process.cwd(), "data");
const receiptsFilePath = path.join(dataDir, "receipts.json");

async function ensureStorage() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(receiptsFilePath);
  } catch {
    await fs.writeFile(receiptsFilePath, "[]", "utf8");
  }
}

export async function readReceipts(): Promise<SavedReceipt[]> {
  await ensureStorage();
  const raw = await fs.readFile(receiptsFilePath, "utf8");

  try {
    const parsed = JSON.parse(raw) as SavedReceipt[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeReceipts(receipts: SavedReceipt[]) {
  await ensureStorage();
  await fs.writeFile(receiptsFilePath, JSON.stringify(receipts, null, 2), "utf8");
}
