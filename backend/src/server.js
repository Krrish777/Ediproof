import "dotenv/config";
import express from "express";
import cors from "cors";
import { router } from "./routes.js";

const app = express();
const PORT = Number(process.env.PORT) || 8787;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api", router);

app.get("/", (_req, res) => {
  res.json({
    service: "ediproof-backend",
    endpoints: [
      "GET  /api/health",
      "POST /api/upload  (multipart: file)",
      "POST /api/log     (json: kind, tokenId, txHash, actor, institution)",
      "GET  /api/stats",
      "GET  /api/activity?limit=20",
      "GET  /api/institution/:address",
    ],
  });
});

app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(500).json({ error: String(err?.message ?? err) });
});

app.listen(PORT, () => {
  console.log(`[ediproof-backend] listening on http://localhost:${PORT}`);
});
