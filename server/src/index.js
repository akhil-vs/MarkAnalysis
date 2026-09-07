import app from "./app.js";

const port = Number(process.env.PORT || 4000);

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "change-me-in-production") {
  if (process.env.NODE_ENV === "production") {
    console.error("JWT_SECRET must be set to a strong value in production");
    process.exit(1);
  }
  console.warn("Warning: using insecure default JWT_SECRET — set JWT_SECRET before deploying");
}

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

export default app;
