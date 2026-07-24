import { createClient } from "@supabase/supabase-js";

// Verifies the caller's session — anon key is enough just to check a token
// is valid, no service-role key needed for this part (same pattern as
// api/upload.js).
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
);

// Service-role client for the privileged checks + the actual deletion —
// this key must never reach the browser, which is why this whole operation
// has to run server-side.
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

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

  const { targetUid } = req.body || {};
  if (!targetUid) {
    res.status(400).json({ error: "targetUid is required" });
    return;
  }

  try {
    const { data: callerProfile } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", callerId)
      .maybeSingle();
    if (!callerProfile || callerProfile.role !== "admin") {
      res.status(403).json({ error: "Only admins can delete users" });
      return;
    }

    const { data: targetProfile } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", targetUid)
      .maybeSingle();
    if (!targetProfile) {
      res.status(404).json({ error: "Target user not found" });
      return;
    }
    if (targetProfile.role === "admin") {
      res.status(403).json({ error: "Cannot delete admin users" });
      return;
    }
    if (targetUid === callerId) {
      res.status(400).json({ error: "Cannot delete yourself" });
      return;
    }

    // Audit log before deletion, same ordering as the original Firebase version.
    const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
      action: "user_deleted",
      performed_by: callerId,
      target_user: targetUid,
      target_user_email: targetProfile.email,
      target_user_name: targetProfile.display_name,
      details: {
        deletedUserData: {
          email: targetProfile.email,
          displayName: targetProfile.display_name,
          role: targetProfile.role,
          company: targetProfile.company,
        },
      },
    });
    if (auditError) console.error("Failed to write audit log:", auditError);

    // public.users cascades on auth.users deletion — no separate profile-row
    // delete step needed.
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUid);
    if (authDeleteError && authDeleteError.status !== 404) {
      throw authDeleteError;
    }

    res.status(200).json({
      success: true,
      message: `User ${targetProfile.display_name || targetProfile.email} has been completely deleted`,
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: error.message || "Internal error" });
  }
}
