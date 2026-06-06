import { getSupabase } from "@/lib/supabaseClient";

export type ProviderInvitePreview = {
  ok: boolean;
  error?: string;
  provider_name?: string;
  provider_photo_url?: string | null;
  company_name?: string;
  company_logo_url?: string | null;
  expected_email?: string | null;
  expires_at?: string;
};

export type ProviderInviteAcceptResult = {
  ok: boolean;
  error?: string;
  company_id?: string;
  provider_id?: string;
};

export type CreateProviderInviteResult = {
  ok: boolean;
  error?: string;
  token?: string;
  expires_at?: string;
};

const inviteErrorMessages: Record<string, string> = {
  convite_invalido: "Este link não existe ou é inválido.",
  convite_revogado: "O studio cancelou este convite.",
  convite_ja_usado: "Este convite já foi utilizado. Faça login no painel.",
  convite_expirado: "Este convite expirou. Peça um novo link ao studio.",
  prestador_removido: "Este perfil não existe mais.",
  acesso_suspenso: "O acesso deste profissional está suspenso.",
  prestador_ja_vinculado: "Este profissional já tem acesso. Faça login.",
  empresa_inativa: "O studio não está ativo no momento.",
  nao_autenticado: "Faça login ou crie sua conta para continuar.",
  email_nao_confere: "Use o mesmo e-mail informado no convite.",
  usuario_ja_prestador: "Sua conta já está vinculada a outro perfil de prestador.",
  conta_administradora: "Contas de dono(a)/admin não podem aceitar convite de prestador.",
  prestador_nao_encontrado: "Prestador não encontrado.",
  email_invalido: "E-mail inválido.",
};

export function formatProviderInviteError(code?: string): string {
  if (!code) return "Não foi possível concluir. Tente novamente.";
  return inviteErrorMessages[code] ?? code;
}

export const providerInviteService = {
  preview(token: string) {
    return getSupabase()
      .rpc("preview_provider_invite", { p_token: token })
      .then((res) => ({ ...res, data: res.data as ProviderInvitePreview | null }));
  },

  accept(token: string) {
    return getSupabase()
      .rpc("accept_provider_invite", { p_token: token })
      .then((res) => ({ ...res, data: res.data as ProviderInviteAcceptResult | null }));
  },

  createInvite(companyId: string, providerId: string, expectedEmail?: string | null) {
    return getSupabase()
      .rpc("admin_create_provider_invite", {
        p_company_id: companyId,
        p_provider_id: providerId,
        p_expected_email: expectedEmail?.trim() || null,
      })
      .then((res) => ({ ...res, data: res.data as CreateProviderInviteResult | null }));
  },

  cancelInvite(companyId: string, providerId: string) {
    return getSupabase().rpc("admin_cancel_provider_invite", {
      p_company_id: companyId,
      p_provider_id: providerId,
    });
  },

  suspendAccess(companyId: string, providerId: string) {
    return getSupabase().rpc("admin_suspend_provider_access", {
      p_company_id: companyId,
      p_provider_id: providerId,
    });
  },

  reactivateAccess(companyId: string, providerId: string) {
    return getSupabase().rpc("admin_reactivate_provider_access", {
      p_company_id: companyId,
      p_provider_id: providerId,
    });
  },

  unlinkUser(companyId: string, providerId: string) {
    return getSupabase().rpc("admin_unlink_provider_user", {
      p_company_id: companyId,
      p_provider_id: providerId,
    });
  },
};
