const SERPAPI_KEY = process.env.SERPAPI_KEY;

export async function searchRetailers(query) {
  if (!query) return [];

  if (!SERPAPI_KEY) {
    console.warn("SERPAPI_KEY not set — returning placeholder results");
    return placeholderResults(query);
  }

  try {
    // Use Google Shopping for real product listings across ALL retailers
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_shopping");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", SERPAPI_KEY);
    url.searchParams.set("num", "12");

    const resp = await fetch(url.toString());
    const data = await resp.json();

    if (data.error) {
      console.error("SerpAPI error:", data.error);
      return placeholderResults(query);
    }

    const items = (data.shopping_results || []).slice(0, 10).map((item) => ({
      retailer: item.source || "Unknown",
      title: item.title,
      price: item.price || null,
      link: item.product_link || item.link,
      thumbnail: item.thumbnail || null,
      rating: item.rating || null,
      reviews: item.reviews || null,
    }));

    // If no shopping results, fall back to organic search results
    if (items.length === 0) {
      const organic = (data.organic_results || []).slice(0, 5).map((item) => ({
        retailer: item.displayed_link || item.source || "Web",
        title: item.title,
        price: null,
        link: item.link,
        thumbnail: null,
        rating: null,
      }));
      return organic;
    }

    return items;
  } catch (err) {
    console.error("Retailer search failed:", err);
    return placeholderResults(query);
  }
}

function placeholderResults(query) {
  return [
    {
      retailer: "Amazon",
      title: query,
      price: null,
      link: `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
      thumbnail: null,
      rating: null,
    },
    {
      retailer: "Walmart",
      title: query,
      price: null,
      link: `https://www.walmart.com/search?q=${encodeURIComponent(query)}`,
      thumbnail: null,
      rating: null,
    },
    {
      retailer: "eBay",
      title: query,
      price: null,
      link: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`,
      thumbnail: null,
      rating: null,
    },
  ];
}
