import { z } from "zod";
import { receiptSchema } from "./receiptSchema";
import { ReceiptData } from "./types";

const llmResponseSchema = z.object({
  merchant: z.any().transform((v) => (typeof v === "string" ? v : "")),
  date: z.any().transform((v) => (typeof v === "string" ? v : "")),
  lineItems: z.array(
    z.object({
      name: z.any().transform((v) => (typeof v === "string" ? v : "")),
      amount: z.any().transform((v) => {
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : 0;
      }),
    })
  ),
  total: z.any().transform((v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  }),
});

const extractionPrompt = `
You are an OCR + receipt understanding assistant.
Extract structured data from the provided receipt image.

Return ONLY valid JSON with this exact shape:
{
  "merchant": "string",
  "date": "YYYY-MM-DD or original date text if uncertain",
  "lineItems": [{"name":"string","amount": number}],
  "total": number
}

Rules:
- Do not include currency symbols in numeric fields.
- If an item amount is unclear, infer best effort.
- Never output null.
- Never output "N/A". If unknown, use empty string for strings and 0 for numbers.
- total must be the final payable amount printed on receipt.
- Do not include markdown fences or extra keys.
`.trim();

function extractJsonBlock(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export async function parseReceiptWithLlm(imageBase64: string, mimeType: string): Promise<ReceiptData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  // Some Gemini models require `v1` instead of `v1beta` for `generateContent`,
  // and some projects don't have the non-`-latest` model names enabled.
  const configuredModel = process.env.GEMINI_MODEL ?? "gemini-1.5-flash-latest";
  const apiVersion = process.env.GEMINI_API_VERSION ?? "v1";

  const attemptVersions = [apiVersion, apiVersion === "v1" ? "v1beta" : "v1"];
  const normalizeModelId = (m: string) => (m.startsWith("models/") ? m.slice("models/".length) : m);

  const modelVariants = new Set<string>([
    normalizeModelId(configuredModel),
    normalizeModelId(
      configuredModel.endsWith("-latest") ? configuredModel : `${configuredModel}-latest`
    ),
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro-latest",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.0-pro-vision",
    "gemini-pro-vision",
    "gemini-1.0-pro",
  ]);

  // Discover models enabled for this API key so we don't depend on exact naming.
  for (const version of attemptVersions) {
    try {
      const listUrl = `https://generativelanguage.googleapis.com/${version}/models?key=${encodeURIComponent(
        apiKey
      )}`;
      const listResp = await fetch(listUrl);
      if (!listResp.ok) continue;
      const listJson = (await listResp.json()) as any;
      const modelsList: any[] = Array.isArray(listJson?.models) ? listJson.models : [];
      for (const m of modelsList) {
        const name = typeof m?.name === "string" ? (m.name as string) : null;
        if (name) modelVariants.add(normalizeModelId(name));
      }
    } catch {
      // Ignore discovery errors; fallback attempts will still work if any model name is correct.
    }
  }

  const errors: string[] = [];
  let json: unknown = null;

  for (const version of attemptVersions) {
    for (const modelVariant of modelVariants) {
      const url = `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(
        modelVariant
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: extractionPrompt },
                {
                  inlineData: {
                    mimeType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            // Let Gemini return plain-text JSON. We'll parse it ourselves.
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => `HTTP ${response.status}`);
        errors.push(`v=${version}, model=${modelVariant}: ${text}`);
        continue;
      }

      json = (await response.json()) as unknown;
      if (json) break;
    }
    if (json) break;
  }

  if (!json) {
    // Keep error readable (and not dump huge payloads)
    throw new Error(`Gemini request failed for all attempts. Last error: ${errors.at(-1) ?? ""}`);
  }

  const candidate = (json as any)?.candidates?.[0];
  const parts: any[] = candidate?.content?.parts ?? [];
  const textOutput = parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n");
  const jsonText = extractJsonBlock(textOutput);
  const parsed = llmResponseSchema.parse(JSON.parse(jsonText));

  return receiptSchema.parse(parsed);
}
