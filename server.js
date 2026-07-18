import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { searchRetailers } from "./retailers.js";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: "10mb" }));

function fileToBase64(file) {
  return file.buffer.toString("base64");
}

async function identifyProduct(base64Image, mediaType) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${base64Image}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: `You are a world-class product identification expert used in a shopping app. Your job is to identify the EXACT product in this image so users can find and buy it online.

CRITICAL RULES:
1. IDENTIFY, never describe. "Nike Air Jordan 1 Retro High OG" not "white and red basketball shoe"
2. Look for ANY text, logos, labels, tags, or packaging FIRST — this is your most reliable signal
3. Use your training knowledge to identify specific products, models, and editions
4. For fashion/clothing: identify brand, style name, colorway, season if possible
5. For electronics: identify brand, model number, generation
6. For collectibles/toys: identify character name, manufacturer, product line, series
7. For home goods/hardware: identify type, brand, specifications
8. searchQuery must be specific enough that the FIRST Google Shopping result would be this exact item

CONFIDENCE RULES:
- "high": you can see brand/model clearly OR you recognize it with certainty from visual features
- "medium": you recognize the product type and likely brand but not exact model
- "low": you can only describe what you see, no specific identification possible

Respond ONLY with valid JSON, no markdown fences:
{
  "productName": "Brand + Product Name + Model/Style (as specific as possible)",
  "brand": "exact brand name or null",
  "model": "exact model/style name or null",
  "category": "specific product category",
  "description": "what makes this specific version unique - colorway, edition, key features",
  "searchQuery": "brand model colorway/style for sale - optimized for Google Shopping",
  "confidence": "high | medium | low"
}`,

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI API error");
  }

  const raw = data.choices?.[0]?.message?.content?.trim() || "{}";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    return {
      productName: "Unknown item",
      brand: null,
      model: null,
      category: null,
      description: raw,
      searchQuery: raw.slice(0, 80),
      confidence: "low",
    };,
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

    const manualQuery = req.body?.manualQuery;
    const base64 = fileToBase64(req.file);
    const product = await identifyProduct(base64, req.file.mimetype);

    const searchQuery = (manualQuery && manualQuery.trim())
      ? manualQuery.trim()
      : product.searchQuery;

    if (manualQuery && manualQuery.trim()) {
      product.searchQuery = manualQuery.trim();
    }

    const results = await searchRetailers(searchQuery);
    res.json({ product, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to find product" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Snappy backend running on port ${PORT}`));
