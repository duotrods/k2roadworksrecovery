import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

// Server-side R2 client — credentials never reach the browser (contrast with
// the previous client-side S3Client that bundled the secret access key into
// the public JS).
const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Only Supabase-authenticated callers may upload. Verified against Supabase's
// auth server using the anon key — no service-role key needed just to check
// a token is valid.
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
);

// Folders this endpoint is allowed to write into. Keeps the key namespace
// server-controlled rather than trusting an arbitrary client-supplied path.
const ALLOWED_FOLDERS = new Set(["incident-reports"]);

const ALLOWED_CONTENT_TYPE_PREFIXES = ["image/", "video/", "application/pdf"];

// Decoded-size cap — client already compresses images before calling this,
// so this is a backstop against abuse, not the primary size control.
const MAX_BYTES = 15 * 1024 * 1024;

const sanitizeFileName = (name) =>
  (name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing authorization" });
    return;
  }

  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData?.user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  const userId = userData.user.id;

  const { fileName, contentType, dataBase64, folder = "incident-reports" } = req.body || {};

  if (!ALLOWED_FOLDERS.has(folder)) {
    res.status(400).json({ error: "Invalid upload folder" });
    return;
  }
  if (!contentType || !ALLOWED_CONTENT_TYPE_PREFIXES.some((p) => contentType.startsWith(p))) {
    res.status(400).json({ error: "Unsupported content type" });
    return;
  }
  if (!dataBase64) {
    res.status(400).json({ error: "Missing file data" });
    return;
  }

  let buffer;
  try {
    buffer = Buffer.from(dataBase64, "base64");
  } catch {
    res.status(400).json({ error: "Invalid file data encoding" });
    return;
  }
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    res.status(400).json({ error: "File size out of allowed range" });
    return;
  }

  const key = `${folder}/${userId}/${Date.now()}_${sanitizeFileName(fileName)}`;

  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  } catch (error) {
    console.error("R2 upload failed:", error);
    res.status(502).json({ error: "Upload to storage failed" });
    return;
  }

  res.status(200).json({
    fileName: fileName || key,
    fileUrl: key,
    downloadUrl: `${process.env.R2_PUBLIC_URL}/${key}`,
    fileSize: buffer.length,
    fileType: contentType,
  });
}
