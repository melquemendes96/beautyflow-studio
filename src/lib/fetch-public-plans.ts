import { subscriptionService } from "@/services/subscriptionService";

export type PublicPlanRow = {
  id: string;
  name: string;
  price?: number | null;
  features?: string[] | null;
};

/**
 * Carrega planos públicos apenas do Supabase — sem fallback inventado (pré-venda).
 */
export async function fetchPublicPlans(): Promise<PublicPlanRow[]> {
  const res = await subscriptionService.listPlans();
  if (res.error) {
    throw res.error;
  }
  return (res.data ?? []) as PublicPlanRow[];
}
