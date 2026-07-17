import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { searchRetailers } from "./retailers.js";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VISION_MODEL = process.env.VISION_MODEL || "claude-sonnet-5";

function fileToBase64(file) {
  return file.buffer.toString("base64");
}

async function identifyProduct(base64Image, mediaType) {
  const message = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Image },
          },
          {
            type: "text",
            text: `Identify the main product in this photo. Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{
  "productName": "short common name",
  "brand": "brand if identifiable, else null",
  "category": "general category, e.g. 'door hardware', 'footwear', 'kitchen appliance'",
  "description": "1-2 sentence description covering material, style, notable features",
  "searchQuery": "a concise search string optimized for finding this exact or closely matching product on retail sites",
  "confidence": "high | medium | low"
}`,
          },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const raw = textBlock ? textBlock.text.trim() : "{}";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    return {
      productName: "Unknown item",
      brand: null,
      category: null,
      description: raw,
      searchQuery: raw.slice(0, 80),
      confidence: "low",
    };
  }
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/explain", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No photo uploaded" });
    const base64 = fileToBase64(req.file);
    const product = await identifyProduct(base64, req.file.mimetype);
    res.json({ product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to analyze photo" });
  }
});

app.post("/find", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No photo uploaded" });
    const base64 = fileToBase64(req.file);
    const product = await identifyProduct(base64, req.file.mimetype);
    const results = await searchRetailers(product.searchQuery);
    res.json({ product, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to find product" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Snappy backend running on port ${PORT}`));
