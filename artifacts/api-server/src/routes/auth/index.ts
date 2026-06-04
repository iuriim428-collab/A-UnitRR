import { Router } from "express";

const router = Router();

router.post("/auth/login", (req, res) => {
  // In desktop/skip-auth mode, any request is auto-authenticated
  if (process.env.SKIP_AUTH === "true") {
    req.session.authenticated = true;
    res.json({ ok: true });
    return;
  }

  const { password } = req.body as { password?: string };
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) {
    res.status(500).json({ error: "APP_PASSWORD not configured" });
    return;
  }

  if (password === appPassword) {
    req.session.authenticated = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: "Неверный пароль" });
  }
});

router.post("/auth/logout", (req, res) => {
  if (process.env.SKIP_AUTH === "true") {
    res.json({ ok: true });
    return;
  }
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/auth/me", (req, res) => {
  if (process.env.SKIP_AUTH === "true") {
    res.json({ authenticated: true });
    return;
  }
  res.json({ authenticated: req.session.authenticated === true });
});

export default router;
