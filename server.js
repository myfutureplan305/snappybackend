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
           text: `You are an expert product identifier with deep knowledge of toys, collectibles, sports memorabilia, fashion, electronics, and branded goods.

CRITICAL RULE: Never describe what you see. IDENTIFY what it is.

Examples of WRONG behavior:
- "Wrestling action figure in pink outfit" ❌
- "Wooden digital alarm clock" ❌  
- "Blue athletic shoe" ❌

Examples of RIGHT behavior:
- "Mattel WWE Elite CM Punk Action Figure - Best in the World Series" ✓
- "Himalayan Salt Crystal Alarm Clock with LED Display" ✓
- "Nike Air Jordan 1 Retro High OG Chicago" ✓

For action figures, toys, and collectibles:
- Identify the CHARACTER NAME (CM Punk, not "wrestler with goatee")
- Identify the BRAND (Mattel, Hasbro, NECA)
- Identify the SERIES/LINE if visible (WWE Elite, Basic, Ultimate Edition)
- Look at the costume color, accessories, facial features, and any text on the figure or packaging

For all products:
- Look for ANY text, logos, labels, numbers on the product
- Use your knowledge to identify the specific product, not just describe it
- The searchQuery must find THIS EXACT product, not similar products

Respond ONLY with valid JSON, no markdown, no extra text:
{
  "productName": "Brand + Character/Model + Series (be as specific as possible)",
  "brand": "manufacturer brand",
  "model": "specific model, character name, or series",
  "category": "product category",
  "description": "what makes this specific version unique (costume, accessories, edition)",
  "searchQuery": "brand + character/model + series + key distinguishing features",
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
