const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";
const DEFAULT_GATEWAY = "https://gateway.pinata.cloud";

/**
 * Uploads a file buffer to Pinata V3 and returns the CID + gateway URL.
 * The JWT must be server-side (never expose to client).
 */
export async function uploadToPinata(buffer, filename, mimetype) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error("PINATA_JWT not configured in backend/.env.local");
  }

  const form = new FormData();
  const blob = new Blob([buffer], { type: mimetype || "application/octet-stream" });
  form.append("file", blob, filename);
  form.append("network", "public");
  form.append("name", filename);

  const res = await fetch(PINATA_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata upload failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const cid = json?.data?.cid;
  if (!cid) {
    throw new Error(`Pinata response missing cid: ${JSON.stringify(json)}`);
  }

  const gateway = process.env.PINATA_GATEWAY || DEFAULT_GATEWAY;
  return {
    cid,
    ipfsURI: `ipfs://${cid}`,
    gatewayURL: `${gateway.replace(/\/$/, "")}/ipfs/${cid}`,
  };
}
