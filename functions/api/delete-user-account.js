import { createClient } from "@supabase/supabase-js";
import { json, getBearerToken } from "./_utils.js";

// Cloudflare Pages Function port of the Vercel api/delete-user-account endpoint.
export async function onRequestPost({ request, env }) {
  const token = getBearerToken(request);
  if (!token) return json({ error: "Missing authorization" }, 401);

  // Anon client just to verify the caller's token is valid.
  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  // Service-role client for the privileged checks + the actual deletion. This
  // key must never reach the browser, which is why this runs server-side.
  const supabaseAdmin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: callerData, error: callerError } = await supabase.auth.getUser(token);
  if (callerError || !callerData?.user) {
    return json({ error: "Invalid or expired session" }, 401);
  }
  const callerId = callerData.user.id;

  const { targetUid } = await request.json().catch(() => ({}));
  if (!targetUid) return json({ error: "targetUid is required" }, 400);

  try {
    const { data: callerProfile } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", callerId)
      .maybeSingle();
    if (!callerProfile || callerProfile.role !== "admin") {
      return json({ error: "Only admins can delete users" }, 403);
    }

    const { data: targetProfile } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", targetUid)
      .maybeSingle();
    if (!targetProfile) return json({ error: "Target user not found" }, 404);
    if (targetProfile.role === "admin") return json({ error: "Cannot delete admin users" }, 403);
    if (targetUid === callerId) return json({ error: "Cannot delete yourself" }, 400);

    // Audit log before deletion, same ordering as the original.
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

    // public.users cascades on auth.users deletion — no separate profile delete.
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUid);
    if (authDeleteError && authDeleteError.status !== 404) throw authDeleteError;

    return json({
      success: true,
      message: `User ${targetProfile.display_name || targetProfile.email} has been completely deleted`,
    }, 200);
  } catch (error) {
    console.error("Delete user error:", error);
    return json({ error: error.message || "Internal error" }, 500);
  }
}
