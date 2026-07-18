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
         text: `You are an expert product identifier. Analyze this photo carefully.

MOST IMPORTANT RULE: Honesty over guessing. If you are not certain, say so.

For ACTION FIGURES and COLLECTIBLES:
- ONLY name the character if you can see their name on packaging, belt, boots, or other text on the figure
- ONLY name the character if their face/costume is 100% unmistakable (e.g. The Undertaker's all-black outfit, John Cena's bright orange)
- If uncertain about the character, set model to null and describe the costume in extreme detail instead
- Look for: tattoos, hair color/style, skin tone, costume colors and patterns, accessories, any text on the figure
- searchQuery for unknown figures: "WWE Elite action figure [exact costume description e.g. pink black graffiti trunks]"

For ALL products:
- Look for text, logos, brand names, model numbers FIRST
- confidence "high" = you are certain. "medium" = probable. "low" = mostly guessing
- Never invent a specific product name when you are not sure

Respond ONLY with valid JSON, no markdown:
{
  "productName": "specific name if certain, or honest description if not",
  "brand": "brand if visible or known, else null",
  "model": "character or model ONLY if certain, else null",
  "category": "product category",
  "description": "extremely specific visual details — every color, pattern, accessory, any visible text",
  "searchQuery": "best search to find this exact item — use costume details when character unknown",
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
