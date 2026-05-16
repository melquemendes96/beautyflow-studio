import { getSupabase } from "@/lib/supabaseClient";

export const profileService = {
  ensureProfile() {
    return getSupabase().rpc("ensure_user_profile");
  },
};
