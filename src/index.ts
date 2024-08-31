import { Hono } from "hono";
import { cors } from "hono/cors";
import { validator } from "hono/validator";
// import translations from "./translations.json"; //TODO: internationalize SYT messages.

const DEFAULT_LOCALE = "en";
const LOCALES = [DEFAULT_LOCALE, "fr", "ru"]; //TODO: Sync with sashaphoto.ca
const POSSIBLE_LOCALES = [...LOCALES, "pa", "hi", "zh"];
const LOCALE_REGEX = new RegExp(`^(${POSSIBLE_LOCALES.join("|")})$`);
const UNSUB_URL =
  "https://syt-ts-service.thebigsasha.workers.dev/api/newsletter/unsubscribe/";

// Add this interface after the existing interfaces
interface NewsletterSubscription {
  email: string;
  locale: string;
}

function generateUniqueId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substr(2, 5);
  return `${timestamp}-${randomPart}`;
}

// Add this validator after the existing validators
const validateNewsletterSubscription = validator("json", (value, c) => {
  const { email, locale } = value;

  if (typeof email !== "string" || !email.includes("@")) {
    return c.json({ message: "misc.newsletter.invalidEmail" }, 400);
  }

  if (
    typeof locale !== "string" ||
    locale.length < 1 ||
    !LOCALE_REGEX.test(locale)
  ) {
    return c.json({ message: "misc.newsletter.invalidLocale" }, 400);
  }

  return {
    email,
    locale: LOCALES.includes(locale) ? locale : DEFAULT_LOCALE,
  };
});

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

const subscriptionRateLimiter = async (c: any, next: () => Promise<void>) => {
  const ip = c.req.header("CF-Connecting-IP") || c.req.ip;
  const key = `subscription:${ip}`;

  const SUBSCRIPTION_RATE_LIMIT = 2;
  const SUBSCRIPTION_RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

  const now = Date.now();
  let entry = rateLimitMap.get(key);

  if (!entry || now - entry.timestamp > SUBSCRIPTION_RATE_LIMIT_WINDOW) {
    entry = { count: 1, timestamp: now };
  } else if (entry.count >= SUBSCRIPTION_RATE_LIMIT) {
    c.status(429);
    return c.json({ message: "misc.newsletter.tooManyRequests" });
  } else {
    entry.count++;
  }

  rateLimitMap.set(key, entry);

  await next();
};

app.use("/api/newsletter/subscribe", subscriptionRateLimiter);

// Create a new MetSeeItem;

app.post("/api/items", validateMetSeeItem, async (c) => {
  const item = c.req.valid("json");

  const { success } = await c.env.DB.prepare(
    `INSERT INTO met_see_items (name, email, url, message, event_id, has_met, code, locale)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      item.name,
      item.email,
      item.url,
      item.message,
      item.event_id,
      item.has_met,
      item.code,
      item.locale,
    )
    .run();

  if (success) {
    // Send email using SendGrid API directly
    const sendgridUrl = "https://api.sendgrid.com/v3/mail/send";
    const sendgridData = {
      personalizations: [
        {
          to: [{ email: item.email, name: item.name }],
          subject: "Hi from Sasha (Alex) :)",
        },
      ],
      from: { email: "metyouthere@thebigsasha.com", name: "Sasha" },
      content: [
        {
          type: "text/html",
          value: `Hi, ${item.name}! Thanks for connecting with me! If you want to reach out, you can email me at <a href="mailto:syt@thebigsasha.com">syt@thebigsasha.com</a> or schedule a call here <a href="https://cal.com/sasha/15min">cal.com/sasha</a>. Hope to hear from you soon!`,
        },
      ],
    };

    try {
      const response = await fetch(sendgridUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sendgridData),
      });

      if (response.ok) {
        c.status(201);
        return c.json({ message: "misc.syt.form.success", emailSent: true });
      } else {
        console.error("Error sending email:", await response.text());
        c.status(201);
        return c.json({ message: "misc.syt.form.success", emailSent: false });
      }
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

async function sendEmail(c: any, to: string, subject: string, content: string) {
  const sendgridUrl = "https://api.sendgrid.com/v3/mail/send";
  const sendgridData = {
    personalizations: [
      {
        to: [{ email: to }],
        subject: subject,
      },
    ],
    from: { email: "newsletter@thebigsasha.com", name: "Sasha's Newsletter" },
    content: [
      {
        type: "text/html",
        value: content,
      },
    ],
  };

  try {
    const response = await fetch(sendgridUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendgridData),
    });

    if (!response.ok) {
      console.error("Error sending email:", await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

app.post(
  "/api/newsletter/subscribe",
  validateNewsletterSubscription,
  async (c) => {
    const { email, locale } = c.req.valid("json");
    const unsubToken = generateUniqueId();
    const now = Date.now();

    try {
      // First, check if the email already exists
      const existingSubscription = await c.env.DB.prepare(
        `SELECT is_subscribed, unsub_token FROM newsletter_subscriptions WHERE email = ?`,
      )
        .bind(email)
        .first();

      if (existingSubscription) {
        if (existingSubscription.is_subscribed) {
          // Already subscribed
          c.status(200);
          return c.json({ message: "misc.newsletter.alreadySubscribed" });
        } else {
          // Resubscribing
          const { success, error } = await c.env.DB.prepare(
            `UPDATE newsletter_subscriptions
             SET is_subscribed = true, locale = ?, subscribed_at = ?, unsub_token = ?
             WHERE email = ?`,
          )
            .bind(locale, now, unsubToken, email)
            .run();

          if (success) {
            const unsubscribeUrl = `${UNSUB_URL}?token=${unsubToken}`;
            const emailContent = `
              <h1>Welcome Back to Sasha's Newsletter!</h1>
              <p>We're glad to have you back! You've been resubscribed to our newsletter.</p>
              <p>If you wish to unsubscribe in the future, you can use this link: <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>
            `;

            const emailSent = await sendEmail(
              c,
              email,
              "Welcome Back to Sasha's Newsletter",
              emailContent,
            );

            c.status(200);
            return c.json({
              message: "misc.newsletter.resubscribeSuccess",
              emailSent: emailSent,
            });
          }
        }
      } else {
        // New subscription
        const { success, error } = await c.env.DB.prepare(
          `INSERT INTO newsletter_subscriptions (email, locale, subscribed_at, is_subscribed, unsub_token)
           VALUES (?, ?, ?, ?, ?)`,
        )
          .bind(email, locale, now, true, unsubToken)
          .run();

        if (success) {
          const unsubscribeUrl = `${UNSUB_URL}?token=${unsubToken}`;
          const emailContent = `
            <h1>Welcome to Sasha's Newsletter!</h1>
            <p>Thank you for subscribing. We're excited to keep you updated!</p>
            <p>If you wish to unsubscribe in the future, you can use this link: <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>
          `;

          const emailSent = await sendEmail(
            c,
            email,
            "Welcome to Sasha's Newsletter",
            emailContent,
          );

          c.status(201);
          return c.json({
            message: "misc.newsletter.subscribeSuccess",
            emailSent: emailSent,
          });
        }
      }

      // If we reach here, there was an error
      throw new Error("Database operation failed");
    } catch (error) {
      console.error("Error in newsletter subscription:", error);
      c.status(500);
      return c.json({ message: "misc.newsletter.subscribeError" });
    }
  },
);
// Unsubscribe from newsletter
app.get("/api/newsletter/unsubscribe/:token", async (c) => {
  const token = c.req.param("token");

  const { success, error } = await c.env.DB.prepare(
    `UPDATE newsletter_subscriptions SET is_subscribed = false WHERE unsub_token = ?`,
  )
    .bind(token)
    .run();

  if (success) {
    return c.json({ message: "misc.newsletter.unsubscribeSuccess" });
  } else {
    console.error("Error unsubscribing from newsletter:", error);
    c.status(500);
    return c.json({ message: "misc.newsletter.unsubscribeError" });
  }
});

app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({ error: err.toString() });
});

app.notFound((c) => c.json({ message: "Not found" }, 404));

export default app;
