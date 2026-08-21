import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { json, getBearerToken } from "./_utils.js";

// Cloudflare Pages Function port of the Vercel api/upload endpoint.
// Still uses R2's S3-compatible API to hand the browser a presigned PUT URL,
// so the file bytes go browser -> R2 directly (never through this function).
// The @aws-sdk packages require the `nodejs_compat` flag (see wrangler.toml).

const ALLOWED_FOLDERS = new Set(["incident-reports", "cabin-safety-checks"]);
const ALLOWED_CONTENT_TYPE_PREFIXES = ["image/", "video/", "application/pdf"];
const PRESIGN_EXPIRES_SECONDS = 300;

const sanitizeFileName = (name) =>
  (name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);

export async function onRequestPost({ request, env }) {
  const token = getBearerToken(request);
  if (!token) return json({ error: "Missing authorization" }, 401);

  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData?.user) {
    return json({ error: "Invalid or expired session" }, 401);
  }
  const userId = userData.user.id;

  const { fileName, contentType, folder = "incident-reports" } =
    await request.json().catch(() => ({}));

  if (!ALLOWED_FOLDERS.has(folder)) return json({ error: "Invalid upload folder" }, 400);
  if (!contentType || !ALLOWED_CONTENT_TYPE_PREFIXES.some((p) => contentType.startsWith(p))) {
    return json({ error: "Unsupported content type" }, 400);
  }

  // R2's S3-compatible client. forcePathStyle is required — R2 has no
  // per-bucket DNS subdomains, so presigned URLs must be endpoint/bucket/key.
  const r2Client = new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    // AWS SDK v3 (>=3.729) injects a default CRC32 integrity checksum into the
    // *signed* URL, computed at presign time with no body (hence the bogus
    // "AAAAAA==" value). The browser then PUTs the real file with only a
    // Content-Type header, so R2 rejects the mismatch and the upload silently
    // fails. R2 doesn't need these SDK checksums, so only add them when the
    // operation actually requires it — keeping the presigned URL clean.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  const key = `${folder}/${userId}/${Date.now()}_${sanitizeFileName(fileName)}`;

  let uploadUrl;
  try {
    uploadUrl = await getSignedUrl(
      r2Client,
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: PRESIGN_EXPIRES_SECONDS },
    );
  } catch (error) {
    console.error("Failed to create R2 presigned URL:", error);
    return json({ error: "Upload to storage failed" }, 502);
  }

  return json({
    uploadUrl,
    fileName: fileName || key,
    fileUrl: key,
    downloadUrl: `${env.R2_PUBLIC_URL}/${key}`,
    fileType: contentType,
  }, 200);
}
