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

// Step 1 — GPT-4o Vision: identify the product from the image
async function visionIdentify(base64Image, mediaType) {
  const prompt = [
    "You are an expert product identifier for a shopping app.",
    "Look at this image carefully.",
    "",
    "STEP 1: Identify what TYPE of object this is first.",
    "Is it a figurine? A holder? A lamp? A stand? A case? Get the function right before the brand.",
    "",
    "STEP 2: Look for any text, logos, brand names, labels, or packaging.",
    "",
    "STEP 3: Use visual reasoning for brand and model:",
    "- What is the exact shape, material, color, finish?",
    "- What is the PRIMARY FUNCTION of this object?",
    "- A character shaped like a stand or holder is NOT a figurine",
    "- Look for slots, hooks, openings, bases that indicate function",
    "",
    "STEP 4: Examples of getting function right:",
    "- Sonic figure with controller slot on back = Sonic controller holder NOT Sonic figurine",
    "- Character with phone slot = phone holder NOT toy",
    "- Shoe shaped item with opening = shoe planter NOT shoe",
    "- Animal with pen holes = pen holder NOT animal figurine",
    "- Action figure with no slots or openings = actual figurine or toy",
    "",
    "STEP 5: For fashion and clothing:",
    "- Identify brand, style name, colorway",
    "- Look for swoosh, stripes, logos, stitching patterns",
    "",
    "STEP 6: For hardware and home goods:",
    "- Identify material, finish, size, brand",
    "- Look for any stamped text or markings",
    "",
    "Be specific. Object function + brand + product name. 2-3 sentences maximum.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: "data:" + mediaType + ";base64," + base64Image,
                detail: "low",
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Vision API error");
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// Step 2 — GPT-4o-mini: parse the description into structured JSON
async function parseToJSON(description) {
  const prompt = [
    "Convert this product description into a JSON object for a shopping app.",
    "Description: " + description,
    "",
    "Respond ONLY with valid JSON no markdown:",
    "{",
    '  "productName": "full specific product name",',
    '  "brand": "brand or null",',
    '  "model": "model or null",',
    '  "category": "category",',
    '  "description": "key features and function",',
    '  "searchQuery": "optimized Google Shopping search query",',
    '  "confidence": "high or medium or low"',
    "}",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Parse API error");

  const raw = data.choices?.[0]?.message?.content?.trim() || "{}";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    return {
      productName: description.slice(0, 60),
      brand: null,
      model: null,
      category: null,
      description: description,
      searchQuery: description.slice(0, 80),
      confidence: "low",
    };
  }
}

async function identifyProduct(base64Image, mediaType) {
  const description = await visionIdentify(base64Image, mediaType);
  const product = await parseToJSON(description);
  return product;
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
app.listen(PORT, () => console.log("Snappy backend running on port " + PORT));
