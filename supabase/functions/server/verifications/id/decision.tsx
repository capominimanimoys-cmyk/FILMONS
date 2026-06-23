import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

export default async (req: Request) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/")[2];

  const { status, reviewedAt, reviewedBy, userId } = await req.json();

  // 1. Update verification table
  const { data: verification, error } = await supabase
    .from("verifications")
    .update({ status, reviewed_at: reviewedAt, reviewed_by: reviewedBy })
    .eq("id", id)
    .select()
    .single();

  if (error) return new Response(error.message, { status: 500 });

  // 2. Update profiles table — on approval, upgrade to Creator+ (business)
  const profilePatch: Record<string, any> = {
    verification_status: status,
    is_verified: status === "approved",
  };
  if (status === "approved") {
    profilePatch.account_type = "business";
    profilePatch.account_mode = "business";
  }

  await supabase.from("profiles").update(profilePatch).eq("id", userId);

  // 3. Get user email
  const { data: user } = await supabase
    .from("profiles")
    .select("email, name")
    .eq("id", userId)
    .single();

  // 4. Send email notification
  if (user?.email) {
    await resend.emails.send({
      from: "Filmons <noreply@filmons.ca>",
      to: user.email,
      subject: status === "approved" ? "🎉 You're now a Creator+!" : "Verification Update",
      html: status === "approved"
        ? `<p>Hi ${user.name},</p><p>Congratulations! Your identity has been verified and your account has been upgraded to <strong>Creator+</strong>. You now have access to all Creator+ features on Filmons.</p>`
        : `<p>Hi ${user.name},</p><p>Unfortunately your verification was not approved. Please contact support if you have questions.</p>`,
    });
  }

  return new Response(JSON.stringify({ success: true, verification }), {
    headers: { "Content-Type": "application/json" },
  });
};