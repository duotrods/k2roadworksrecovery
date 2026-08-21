/* global Buffer */
// `Buffer` is a Node global provided at runtime by the nodejs_compat flag
// (wrangler.toml); this comment just tells ESLint it exists.
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { json, getBearerToken } from "./_utils.js";

// Cloudflare Pages Function (Workers runtime) port of the Vercel api/ endpoint.
// Key differences from the Node version:
//  - onRequestPost({ request, env }) instead of handler(req, res)
//  - config comes from `env`, not `process.env`
//  - clients are created INSIDE the handler (env isn't available at module load)
//  - we `return` a Response instead of calling res.json(...)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PDF_BYTES = 3 * 1024 * 1024;

export async function onRequestPost({ request, env }) {
  const token = getBearerToken(request);
  if (!token) return json({ error: "Missing authorization" }, 401);

  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const resend = new Resend(env.RESEND_API_KEY);

  const { data: callerData, error: callerError } = await supabase.auth.getUser(token);
  if (callerError || !callerData?.user) {
    return json({ error: "Invalid or expired session" }, 401);
  }
  const callerId = callerData.user.id;

  const {
    reportType = "incident",
    reportId,
    referenceId,
    customerEmail,
    customerName,
    schemeId,
    pdfBase64,
  } = await request.json().catch(() => ({}));

  if (!["incident", "vehicle-check", "cabin-safety"].includes(reportType)) {
    return json({ error: "Invalid reportType" }, 400);
  }
  if (!reportId) return json({ error: "reportId is required" }, 400);
  if (reportType === "incident" && (!customerEmail || !EMAIL_RE.test(customerEmail))) {
    return json({ error: "A valid customerEmail is required" }, 400);
  }
  if ((reportType === "vehicle-check" || reportType === "cabin-safety") && !schemeId) {
    return json({ error: "schemeId is required" }, 400);
  }
  if (!pdfBase64) return json({ error: "pdfBase64 is required" }, 400);

  let pdfBuffer;
  try {
    pdfBuffer = Buffer.from(pdfBase64, "base64");
  } catch {
    return json({ error: "pdfBase64 is not valid base64" }, 400);
  }
  if (pdfBuffer.length === 0 || pdfBuffer.length > MAX_PDF_BYTES) {
    return json({ error: "PDF attachment is missing or too large" }, 400);
  }

  // Recipient for a vehicle-check/cabin-safety copy is never client-supplied
  // — it's resolved server-side from a per-scheme secret so the sender can't
  // be spoofed by the request body.
  const SCHEME_EMAIL_ENV_PREFIX = {
    "vehicle-check": "VEHICLE_CHECK_EMAIL_",
    "cabin-safety": "CABIN_HS_CHECK_EMAIL_",
  };
  const schemeEmailEnvPrefix = SCHEME_EMAIL_ENV_PREFIX[reportType];
  const recipientEmails = schemeEmailEnvPrefix
    ? (env[`${schemeEmailEnvPrefix}${schemeId}`] || "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
    : [customerEmail].filter(Boolean);

  const TABLE_BY_TYPE = {
    "vehicle-check": "vehicle_daily_checks",
    "cabin-safety": "cabin_health_safety_checks",
    incident: "incident_reports",
  };
  const REPORT_TYPE_TAG = {
    "vehicle-check": "vehicle-check-copy",
    "cabin-safety": "cabin-safety-copy",
    incident: "incident-copy",
  };
  const table = TABLE_BY_TYPE[reportType];
  const reportTypeTag = REPORT_TYPE_TAG[reportType];

  if (schemeEmailEnvPrefix && recipientEmails.length === 0) {
    console.error(`No ${schemeEmailEnvPrefix}${schemeId} configured`);
    await supabaseAdmin.from("email_logs").insert({
      report_type: `${reportTypeTag}-failed`,
      report_id: reportId,
      reference_id: referenceId || null,
      scheme: schemeId,
      recipients: [],
      sent_by: callerId,
    });
    return json({ error: "No recipient configured for this scheme" }, 500);
  }

  try {
    // Scoped to the caller's own JWT so the table's RLS policy (verified
    // staff/admin only) authorizes this. The "report_copy_sent_at is null"
    // guard makes it idempotent: a retry can never send the email twice.
    const callerScopedClient = createClient(
      env.VITE_SUPABASE_URL,
      env.VITE_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: claimed, error: claimError } = await callerScopedClient
      .from(table)
      .update({ report_copy_sent_at: new Date().toISOString() })
      .eq("id", reportId)
      .is("report_copy_sent_at", null)
      .select("id")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimed) return json({ skipped: true }, 200);

    const EMAIL_CONTENT_BY_TYPE = {
      "vehicle-check": {
        filename: `VehicleDailyCheck_${referenceId || reportId}.pdf`,
        subject: `Vehicle Daily Check Copy — ${referenceId || reportId}`,
        text: `Attached is a copy of Vehicle Daily Check ${referenceId || reportId}.\n\nThank you,\nK2 Vehicle Recovery`,
      },
      "cabin-safety": {
        filename: `CabinSafetyCheck_${referenceId || reportId}.pdf`,
        subject: `Cabin Health & Safety Check Copy — ${referenceId || reportId}`,
        text: `Attached is a copy of Cabin Health & Safety Check ${referenceId || reportId}.\n\nThank you,\nK2 Vehicle Recovery`,
      },
      incident: {
        filename: `IncidentReport_${referenceId || reportId}.pdf`,
        subject: `Your K2 Vehicle Recovery Job Sheet Copy — ${referenceId || reportId}`,
        text: `Hi ${customerName || "there"},\n\nAttached is a copy of your Job Sheet (${referenceId || reportId}) for your records.\n\nThank you,\nK2 Vehicle Recovery`,
      },
    };
    const { filename, subject, text } = EMAIL_CONTENT_BY_TYPE[reportType];

    const { error: sendError } = await resend.emails.send({
      from: "K2 Vehicle Recovery <reports@k2recoveryapp.co.uk>",
      to: recipientEmails,
      subject,
      text,
      attachments: [{ filename, content: pdfBuffer }],
    });

    if (sendError) throw sendError;

    await supabaseAdmin.from("email_logs").insert({
      report_type: reportTypeTag,
      report_id: reportId,
      reference_id: referenceId || null,
      scheme: schemeId || null,
      recipients: recipientEmails,
      sent_by: callerId,
    });

    return json({ success: true }, 200);
  } catch (error) {
    console.error("Failed to send report copy email:", error);
    await supabaseAdmin
      .from("email_logs")
      .insert({
        report_type: `${reportTypeTag}-failed`,
        report_id: reportId,
        reference_id: referenceId || null,
        scheme: schemeId || null,
        recipients: recipientEmails,
        sent_by: callerId,
      })
      .then(({ error: logError }) => {
        if (logError) console.error("Failed to write email_logs failure row:", logError);
      });
    return json({ error: "Failed to send report copy" }, 500);
  }
}
