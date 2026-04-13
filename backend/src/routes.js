import { Router } from "express";
import multer from "multer";
import { insertEvent, selectStats, selectActivity, selectByInstitution } from "./db.js";
import { uploadToPinata } from "./pinata.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB per cert
});

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ediproof-backend" });
});

/**
 * POST /api/upload (multipart/form-data, field: "file")
 * Proxies the file to Pinata V3 and returns { cid, ipfsURI, gatewayURL }.
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "no file uploaded (expected field 'file')" });
  }
  try {
    const result = await uploadToPinata(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    res.json(result);
  } catch (err) {
    console.error("[upload]", err);
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

/**
 * POST /api/log
 * Body: { kind, tokenId, txHash, actor, institution }
 * Frontend fires this after every successful tx so we have a log.
 */
router.post("/log", (req, res) => {
  const { kind, tokenId, txHash, actor, institution } = req.body || {};
  if (!kind) return res.status(400).json({ error: "kind required" });

  insertEvent.run({
    kind,
    tokenId: tokenId ?? null,
    txHash: txHash ?? null,
    actor: actor ?? null,
    institution: institution ?? null,
    createdAt: Date.now(),
  });
  res.json({ ok: true });
});

router.get("/stats", (_req, res) => {
  const row = selectStats.get() || {};
  res.json({
    totalIssued: row.totalIssued ?? 0,
    totalRevoked: row.totalRevoked ?? 0,
    totalReissued: row.totalReissued ?? 0,
    totalVerified: row.totalVerified ?? 0,
    institutions: row.institutions ?? 0,
  });
});

router.get("/activity", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  res.json(selectActivity.all(limit));
});

router.get("/institution/:address", (req, res) => {
  const row = selectByInstitution.get(req.params.address);
  res.json(row ?? { address: req.params.address, issuedCount: 0, lastActive: null });
});
