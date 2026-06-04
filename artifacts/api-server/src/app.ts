import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import { pool } from "@workspace/db";
import { PgSessionStore } from "./lib/pg-session-store";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "path";

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
  }
}

const isDesktop = process.env.DATABASE_URL?.startsWith("pglite://") ?? false;
const skipAuth = process.env.SKIP_AUTH === "true";

const app: Express = express();

// Trust the reverse proxy (Replit) so secure cookies work over HTTPS
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In desktop mode use in-memory session store (no external PG needed for sessions)
const sessionStore = isDesktop
  ? new session.MemoryStore()
  : new PgSessionStore(pool);

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET ?? "fallback-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: !isDesktop && process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// Auth guard — allow /api/auth/* and /api/healthz without session
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith("/auth") || req.path === "/healthz") {
    return next();
  }
  // Desktop mode: no login required
  if (skipAuth) {
    req.session.authenticated = true;
    return next();
  }
  if (req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

app.use("/api", requireAuth, router);

// Desktop mode: serve the bundled React app for all non-/api routes
if (process.env.SERVE_FRONTEND_DIR) {
  const frontendDir = path.resolve(process.env.SERVE_FRONTEND_DIR);
  app.use(express.static(frontendDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });
}

export default app;
