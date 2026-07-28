import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

// Server-side R2 client — credentials never reach the browser (contrast with
// the previous client-side S3Client that bundled the secret access key into
// the public JS).
const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  // R2 only supports path-style addressing (endpoint/bucket/key) — it has no
  // per-bucket DNS subdomains, unlike AWS S3. Without this, the SDK defaults
  // to virtual-hosted-style (bucket.endpoint/key), producing URLs that don't
  // resolve, which is fatal for presigned URLs the browser has to reach
  // directly (the previous direct-PutObjectCommand path never surfaced this
  // because the 4.5MB body-size limit was rejecting large uploads earlier).
  forcePathStyle: true,
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

// How long the presigned PUT URL remains valid for the client to use.
const PRESIGN_EXPIRES_SECONDS = 300;

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

  const { fileName, contentType, folder = "incident-reports" } = req.body || {};

  if (!ALLOWED_FOLDERS.has(folder)) {
    res.status(400).json({ error: "Invalid upload folder" });
    return;
  }
  if (!contentType || !ALLOWED_CONTENT_TYPE_PREFIXES.some((p) => contentType.startsWith(p))) {
    res.status(400).json({ error: "Unsupported content type" });
    return;
  }

  const key = `${folder}/${userId}/${Date.now()}_${sanitizeFileName(fileName)}`;

  // The browser PUTs the file bytes straight to R2 using this URL — the file
  // never passes through this function, so Vercel's ~4.5MB serverless
  // request-body limit (which silently rejected large videos before) no
  // longer applies.
  let uploadUrl;
  try {
    uploadUrl = await getSignedUrl(
      r2Client,
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: PRESIGN_EXPIRES_SECONDS },
    );
  } catch (error) {
    console.error("Failed to create R2 presigned URL:", error);
    res.status(502).json({ error: "Upload to storage failed" });
    return;
  }

  res.status(200).json({
    uploadUrl,
    fileName: fileName || key,
    fileUrl: key,
    downloadUrl: `${process.env.R2_PUBLIC_URL}/${key}`,
    fileType: contentType,
  });
}
