import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// Verifies the caller's session — anon key is enough just to check a token
// is valid (same pattern as api/upload.js / api/delete-user-account.js).
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
);

// Service-role client — used only for the email_logs audit write, since that
// table has RLS enabled with zero policies (writes must bypass RLS by
// design, per its own migration comment).
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PDF_BYTES = 3 * 1024 * 1024;

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

  const { data: callerData, error: callerError } = await supabase.auth.getUser(token);
  if (callerError || !callerData?.user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  const callerId = callerData.user.id;

  const { reportId, referenceId, customerEmail, customerName, pdfBase64 } = req.body || {};

  if (!reportId) {
    res.status(400).json({ error: "reportId is required" });
    return;
  }
  if (!customerEmail || !EMAIL_RE.test(customerEmail)) {
    res.status(400).json({ error: "A valid customerEmail is required" });
    return;
  }
  if (!pdfBase64) {
    res.status(400).json({ error: "pdfBase64 is required" });
    return;
  }

  let pdfBuffer;
  try {
    pdfBuffer = Buffer.from(pdfBase64, "base64");
  } catch {
    res.status(400).json({ error: "pdfBase64 is not valid base64" });
    return;
  }
  if (pdfBuffer.length === 0 || pdfBuffer.length > MAX_PDF_BYTES) {
    res.status(400).json({ error: "PDF attachment is missing or too large" });
    return;
  }

  try {
    // Scoped to the caller's own JWT (not service-role) so the existing
    // incident_reports RLS policy (verified staff/admin only) is what
    // authorizes this — no need to duplicate that check here. The
    // "report_copy_sent_at is null" guard makes this idempotent: a
    // double-submit or retry can never send the email twice.
    const callerScopedClient = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: claimed, error: claimError } = await callerScopedClient
      .from("incident_reports")
      .update({ report_copy_sent_at: new Date().toISOString() })
      .eq("id", reportId)
      .is("report_copy_sent_at", null)
      .select("id")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimed) {
      res.status(200).json({ skipped: true });
      return;
    }

    const filename = `IncidentReport_${referenceId || reportId}.pdf`;
    const { error: sendError } = await resend.emails.send({
      from: "K2 Vehicle Recovery <reports@chellan.co.uk>",
      to: customerEmail,
      subject: `Your K2 Vehicle Recovery Job Sheet Copy — ${referenceId || reportId}`,
      text: `Hi ${customerName || "there"},\n\nAttached is a copy of your Job Sheet (${referenceId || reportId}) for your records.\n\nThank you,\nK2 Vehicle Recovery`,
      attachments: [{ filename, content: pdfBuffer }],
    });

    if (sendError) throw sendError;

    await supabaseAdmin.from("email_logs").insert({
      report_type: "incident-copy",
      report_id: reportId,
      reference_id: referenceId || null,
      recipients: [customerEmail],
      sent_by: callerId,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to send report copy email:", error);
    await supabaseAdmin
      .from("email_logs")
      .insert({
        report_type: "incident-copy-failed",
        report_id: reportId,
        reference_id: referenceId || null,
        recipients: [customerEmail],
        sent_by: callerId,
      })
      .then(({ error: logError }) => {
        if (logError) console.error("Failed to write email_logs failure row:", logError);
      });
    res.status(500).json({ error: "Failed to send report copy" });
  }
}
