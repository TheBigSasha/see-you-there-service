import { Hono } from "hono";
import { cors } from "hono/cors";

interface MetSeeItem {
  name: string;
  email: string;
  url: string;
  message: string;
  event_id: string;
  has_met: boolean;
  code: string;
}

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();
app.use("/api/*", cors());

// Rate limiting setup
const RATE_LIMIT = 3;
const RATE_LIMIT_WINDOW = 30 * 60 * 1000; // 30 mins in milliseconds

interface RateLimitEntry {
  count: number;
  timestamp: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Rate limiting middleware
const rateLimiter = async (c: any, next: () => Promise<void>) => {
  const ip = c.req.header("CF-Connecting-IP") || c.req.ip;
  const eventId = c.req.param("event_id") || "default";
  const key = `${ip}:${eventId}`;

  const now = Date.now();
  let entry = rateLimitMap.get(key);

  if (!entry || now - entry.timestamp > RATE_LIMIT_WINDOW) {
    entry = { count: 1, timestamp: now };
  } else if (entry.count >= RATE_LIMIT) {
    c.status(429);
    return c.json({ message: "Too Many Requests" });
  } else {
    entry.count++;
  }

  rateLimitMap.set(key, entry);

  // Clean up old entries
  if (rateLimitMap.size > 10000) {
    // Arbitrary limit to prevent memory issues
    const oldestAllowedTimestamp = now - RATE_LIMIT_WINDOW;
    for (const [mapKey, mapEntry] of rateLimitMap.entries()) {
      if (mapEntry.timestamp < oldestAllowedTimestamp) {
        rateLimitMap.delete(mapKey);
      }
    }
  }

  await next();
};

// Apply rate limiter to all API routes
app.use("/api/*", rateLimiter);

// Create a new MetSeeItem
app.post("/api/items", async (c) => {
  const item: MetSeeItem = await c.req.json();
  const { success } = await c.env.DB.prepare(
    `INSERT INTO met_see_items (name, email, url, message, event_id, has_met, code)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      item.name,
      item.email,
      item.url,
      item.message,
      item.event_id,
      item.has_met,
      item.code,
    )
    .run();

  if (success) {
    c.status(201);
    return c.json({ message: "Created" });
  } else {
    c.status(500);
    return c.json({ message: "Something went wrong" });
  }
// });

// // Read all MetSeeItems for a specific event
// app.get("/api/items/:event_id", async (c) => {
//   const { event_id } = c.req.param();
//   const { results } = await c.env.DB.prepare(
//     `SELECT * FROM met_see_items WHERE event_id = ?`,
//   )
//     .bind(event_id)
//     .all();
//   return c.json(results);
// });

// // Update a MetSeeItem
// app.put("/api/items/:id", async (c) => {
//   const { id } = c.req.param();
//   const item: Partial<MetSeeItem> = await c.req.json();

//   const setClauses = Object.keys(item)
//     .map((key) => `${key} = ?`)
//     .join(", ");
//   const query = `UPDATE met_see_items SET ${setClauses} WHERE id = ?`;

//   const { success } = await c.env.DB.prepare(query)
//     .bind(...Object.values(item), id)
//     .run();

//   if (success) {
//     return c.json({ message: "Updated" });
//   } else {
//     c.status(500);
//     return c.json({ message: "Something went wrong" });
//   }
// });

// // Delete a MetSeeItem
// app.delete("/api/items/:id", async (c) => {
//   const { id } = c.req.param();
//   const { success } = await c.env.DB.prepare(
//     `DELETE FROM met_see_items WHERE id = ?`,
//   )
//     .bind(id)
//     .run();

//   if (success) {
//     return c.json({ message: "Deleted" });
//   } else {
//     c.status(500);
//     return c.json({ message: "Something went wrong" });
//   }
// });

app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({ error: err.toString() });
});

app.notFound((c) => c.json({ message: "Not found" }, 404));

export default app;
