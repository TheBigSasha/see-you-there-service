import { Hono } from "hono";
import { cors } from "hono/cors";
import { validator } from "hono/validator";
import sgMail from "@sendgrid/mail";
// import translations from "./translations.json"; //TODO: internationalize SYT messages.

const DEFAULT_LOCALE = "en";
const LOCALES = [DEFAULT_LOCALE, "fr", "ru"]; //TODO: Sync with sashaphoto.ca
const POSSIBLE_LOCALES = [...LOCALES, "pa", "hi", "zh"];
const LOCALE_REGEX = new RegExp(`^(${POSSIBLE_LOCALES.join("|")})$`);

interface MetSeeItem {
  name: string;
  email: string;
  url: string;
  message: string;
  event_id: string;
  has_met: boolean;
  code: string;
  locale: string;
}

const validateMetSeeItem = validator("json", (value, c) => {
  const { name, email, url, message, event_id, has_met, locale } = value;

  if (typeof name !== "string" || name.length < 2) {
    return c.json({ message: "misc.syt.form.invalidInput" }, 400);
  }
  if (typeof email !== "string" || !email.includes("@")) {
    return c.json({ message: "misc.syt.form.invalidInput" }, 400);
  }
  if (url && typeof url !== "string") {
    return c.json({ message: "misc.syt.form.invalidInput" }, 400);
  }
  if (typeof message !== "string" || message.length < 5) {
    return c.json({ message: "misc.syt.form.invalidInput" }, 400);
  }
  if (typeof event_id !== "string" || event_id.length < 1) {
    return c.json({ message: "misc.syt.form.invalidInput" }, 400);
  }
  if (typeof has_met !== "boolean") {
    return c.json({ message: "misc.syt.form.invalidInput" }, 400);
  }

  if (
    typeof locale !== "string" ||
    locale.length < 1 ||
    !LOCALE_REGEX.test(locale)
  ) {
    return c.json({ message: "misc.syt.form.invalidInput" }, 400);
  }

  return {
    name,
    email,
    locale: LOCALES.includes(locale) ? locale : DEFAULT_LOCALE,
    url: url || "",
    message,
    event_id,
    has_met,
    code: Math.random().toString(36).substring(2, 8),
  };
});

type Bindings = {
  DB: D1Database;
  SENDGRID_API_KEY: string;
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

// Create a new MetSeeItem;

app.post("/api/items", validateMetSeeItem, async (c) => {
  const item = c.req.valid("json");

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
    // Send email using SendGrid
    sgMail.setApiKey(c.env.SENDGRID_API_KEY);
    const msg = {
      to: item.email,
      from: "metyouthere@thebigsasha.com", // Change this to your verified sender
      subject: "Hi from Sasha (Alex) :)",
      text: `Hi, ${item.name}! It's nice to meet you!`,
      html: `Hi, ${item.name}! Thanks for connecting with me! If you want to reach out, you can email me at <a href="mailto:syt@thebigsasha.com">syt@thebigsasha.com</a> or schedule a call here <a href="https://cal.com/sasha/15min">cal.com/sasha</a>. Hope to hear from you soon!`,
    };

    try {
      await sgMail.send(msg);
      c.status(201);
      return c.json({ message: "misc.syt.form.success" });
    } catch (error) {
      console.error("Error sending email:", error);
      c.status(201);
      return c.json({ message: "misc.syt.form.success", emailSent: false });
    }
  } else {
    c.status(500);
    return c.json({ message: "misc.syt.form.error" });
  }
});

app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({ error: err.toString() });
});

app.notFound((c) => c.json({ message: "Not found" }, 404));

export default app;
