# Snappy — Backend

Handles product identification (Claude Sonnet 5 vision) and retailer search.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `ANTHROPIC_API_KEY` — your Claude API key
   - `SERPAPI_KEY` — get one at serpapi.com (free tier available)
3. `npm start` — runs on port 3000

## Endpoints

- `POST /explain` — multipart form with a `photo` file. Returns product details only.
- `POST /find` — same input. Returns product details + retailer results.
