const SERPAPI_KEY = process.env.SERPAPI_KEY;

export async function searchRetailers(query) {
  if (!query) return [];

  if (!SERPAPI_KEY) {
    console.warn("SERPAPI_KEY not set — returning placeholder results");
    return placeholderResults(query);
  }

  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_shopping");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", SERPAPI_KEY);

    const resp = await fetch(url.toString());
    const data = await resp.json();

    const items = (data.shopping_results || []).slice(0, 12).map((item) => ({
      retailer: item.source || "Unknown",
      title: item.title,
      price: item.price || null,
      link: item.product_link || item.link,
      thumbnail: item.thumbnail,
      rating: item.rating || null,
    }));

    return items;
  } catch (err) {
    console.error("Retailer search failed:", err);
    return placeholderResults(query);
  }
}

function placeholderResults(query) {
  return [
    {
      retailer: "Amazon (placeholder)",
      title: query,
      price: "$--.--",
      link: `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
      thumbnail: null,
      rating: null,
    },
    {
      retailer: "Walmart (placeholder)",
      title: query,
      price: "$--.--",
      link: `https://www.walmart.com/search?q=${encodeURIComponent(query)}`,
      thumbnail: null,
      rating: null,
    },
    {
      retailer: "eBay (placeholder)",
      title: query,
      price: "$--.--",
      link: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`,
      thumbnail: null,
      rating: null,
    },
  ];
}
