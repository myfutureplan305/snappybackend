const SERPER_KEY = process.env.SERPER_API_KEY;

export async function searchRetailers(query) {
  if (!query) return [];

  if (!SERPER_KEY) {
    console.warn("SERPER_API_KEY not set — returning placeholder results");
    return placeholderResults(query);
  }

  try {
    const response = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 10 }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Serper error:", data);
      return placeholderResults(query);
    }

    const items = (data.shopping || []).slice(0, 10).map((item) => ({
      retailer: item.source || "Unknown",
      title: item.title,
      price: item.price || null,
      link: item.link,
      thumbnail: item.imageUrl || item.thumbnailUrl || null,
      rating: item.rating || null,
      reviews: item.ratingCount || null,
    }));

    if (items.length === 0) return placeholderResults(query);

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
