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
              text: "You are a world-class product identification expert. Identify the EXACT product in this image.\n\nRULES:\n1. IDENTIFY specifically, never describe generically\n2. Look for text, logos, labels, tags, packaging first\n3. For fashion: identify brand, style name, colorway\n4. For electronics: identify brand, model number, generation\n5. For collectibles: identify character, manufacturer, product line\n6. For hardware: identify type, brand, specifications\n\nCONFIDENCE:\nhigh = certain identification\nmedium = probable brand or type but not exact model\nlow = can only describe visually\n\nRespond ONLY with valid JSON no markdown:\n{\"productName\": \"Brand Product Model as specific as possible\", \"brand\": \"brand name or null\", \"model\": \"model name or null\", \"category\": \"product category\", \"description\": \"unique features colorway edition\", \"searchQuery\": \"brand model colorway optimized for Google Shopping\", \"confidence\": \"high or medium or low\"}",
            },
          ],
        },
      ],
    }),
  });

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
