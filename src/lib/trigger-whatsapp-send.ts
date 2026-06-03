import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

/**
 * Dispara envio da confirmação WhatsApp (Edge Function) após agendamento público.
 * Falhas são silenciosas no UI — o log fica em whatsapp_message_logs.
 */
export async function triggerWhatsAppBookingConfirmation(params: {
  appointmentId: string;
  logId?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const body: Record<string, string> = { appointment_id: params.appointmentId };
  if (params.logId) body.log_id = params.logId;

  const { error } = await getSupabase().functions.invoke("send-whatsapp-message", { body });

  if (error && import.meta.env.DEV) {
    console.warn("[triggerWhatsAppBookingConfirmation]", error.message);
  }
}
