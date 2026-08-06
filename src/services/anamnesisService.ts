import { getSupabase } from "@/lib/supabaseClient";

export type AnamnesisField = {
  id: string;
  type: "text" | "boolean" | "textarea";
  label: string;
  required?: boolean;
};

export const anamnesisService = {
  getPageBootstrap(slug: string) {
    return getSupabase().rpc("get_anamnesis_page_bootstrap", { p_slug: slug });
  },

  requestOtp(slug: string, whatsapp: string) {
    return getSupabase().rpc("request_anamnesis_otp", {
      p_slug: slug,
      p_whatsapp: whatsapp,
    });
  },

  verifyOtp(slug: string, whatsapp: string, code: string) {
    return getSupabase().rpc("verify_anamnesis_otp", {
      p_slug: slug,
      p_whatsapp: whatsapp,
      p_code: code,
    });
  },

  redeemAccessToken(slug: string, token: string) {
    return getSupabase().rpc("redeem_anamnesis_access_token", {
      p_slug: slug,
      p_token: token,
    });
  },

  loginPassword(slug: string, whatsapp: string, password: string) {
    return getSupabase().rpc("login_anamnesis_password", {
      p_slug: slug,
      p_whatsapp: whatsapp,
      p_password: password,
    });
  },

  setPassword(sessionToken: string, password: string) {
    return getSupabase().rpc("set_anamnesis_password", {
      p_session_token: sessionToken,
      p_password: password,
    });
  },

  getForm(sessionToken: string) {
    return getSupabase().rpc("get_anamnesis_form", { p_session_token: sessionToken });
  },

  submit(sessionToken: string, answers: Record<string, unknown>, consent = true, appointmentId?: string | null) {
    return getSupabase().rpc("submit_anamnesis", {
      p_session_token: sessionToken,
      p_answers: answers,
      p_consent: consent,
      p_appointment_id: appointmentId ?? null,
    });
  },

  prepareAfterBooking(slug: string, appointmentId: string, whatsapp: string) {
    return getSupabase().rpc("prepare_anamnesis_after_booking", {
      p_slug: slug,
      p_appointment_id: appointmentId,
      p_whatsapp: whatsapp,
    });
  },

  listForClient(companyId: string, clientId: string) {
    return getSupabase().rpc("list_client_anamnesis", {
      p_company_id: companyId,
      p_client_id: clientId,
    });
  },

  staffSubmit(companyId: string, clientId: string, answers: Record<string, unknown>) {
    return getSupabase().rpc("staff_submit_anamnesis", {
      p_company_id: companyId,
      p_client_id: clientId,
      p_answers: answers,
      p_consent: true,
    });
  },

  staffCreateLink(companyId: string, clientId: string) {
    return getSupabase().rpc("staff_create_anamnesis_link", {
      p_company_id: companyId,
      p_client_id: clientId,
    });
  },

  getAppointmentFlags(companyId: string, appointmentIds: string[]) {
    return getSupabase().rpc("get_appointment_anamnesis_flags", {
      p_company_id: companyId,
      p_appointment_ids: appointmentIds,
    });
  },
};
