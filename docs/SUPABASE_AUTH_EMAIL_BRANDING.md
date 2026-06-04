# E-mails de autenticação — marca JM BeautyFlow

Os e-mails de **recuperar senha**, confirmação de cadastro e magic link são enviados pelo **Supabase Auth** (`noreply@mail.app.supabase.io`, remetente padrão "Supabase Auth"). O código do app só chama `resetPasswordForEmail` — o visual e o remetente são configurados no **Dashboard do Supabase**.

## O que mudar (2 níveis)

| Nível | Onde | Resultado |
|-------|------|-----------|
| **1 — Templates** (rápido, grátis) | Authentication → Email Templates | Assunto e corpo com marca JM BeautyFlow; remetente ainda pode aparecer como Supabase |
| **2 — SMTP próprio** (recomendado produção) | Authentication → SMTP Settings | Remetente `noreply@jmbeautyflow.tech` + nome **JM BeautyFlow** |

---

## Passo 1 — URL do site (obrigatório)

**Authentication → URL Configuration**

- **Site URL:** `https://jmbeautyflow.tech`
- **Redirect URLs** (incluir):
  - `https://jmbeautyflow.tech/reset-password`
  - `https://jmbeautyflow.tech/forgot-password`
  - `https://jmbeautyflow.tech/auth/callback`
  - `http://localhost:8080/reset-password` (dev)

Sem isso, o link do e-mail pode apontar para URL errada.

---

## Passo 2 — Template “Reset password” / Recuperação

**Authentication → Email Templates → Reset password** (ou *Recovery*)

### Assunto (Subject)

```
Redefinir sua senha — JM BeautyFlow
```

### Corpo (HTML) — cole no editor HTML do Supabase

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Redefinir senha</title>
</head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf8f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e8e4df;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 8px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:600;letter-spacing:0.02em;">
                <span style="color:#c9a87c;">JM</span> BeautyFlow
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:#6b6b6b;text-transform:uppercase;letter-spacing:0.12em;">
                Agenda inteligente para beleza
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;">
              <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;">Redefinir senha</h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#444;">
                Recebemos um pedido para criar uma nova senha na sua conta
                <strong>{{ .Email }}</strong>. Se foi você, use o botão abaixo. O link expira em breve.
              </p>
              <p style="margin:0 0 24px;text-align:center;">
                <a href="{{ .ConfirmationURL }}"
                   style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:14px 28px;border-radius:999px;">
                  Criar nova senha
                </a>
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#6b6b6b;">
                Se o botão não abrir, copie e cole este link no navegador:<br />
                <a href="{{ .ConfirmationURL }}" style="color:#c9a87c;word-break:break-all;">{{ .ConfirmationURL }}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #f0ebe6;background:#faf8f5;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#888;">
                Se você não pediu esta alteração, ignore este e-mail. Sua senha atual continua válida.
              </p>
              <p style="margin:12px 0 0;font-size:12px;color:#aaa;">
                © JM BeautyFlow · jmbeautyflow.tech
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

Variáveis do Supabase usadas: `{{ .ConfirmationURL }}`, `{{ .Email }}`.

Salve o template e envie um teste em **Forgot password** no app.

---

## Passo 3 — Outros templates (opcional, mesma marca)

Repita o mesmo estilo em:

| Template | Assunto sugerido |
|----------|------------------|
| Confirm signup | Confirme seu e-mail — JM BeautyFlow |
| Magic link | Seu link de acesso — JM BeautyFlow |
| Change email | Confirme o novo e-mail — JM BeautyFlow |

Use `{{ .ConfirmationURL }}` ou `{{ .Token }}` conforme o template indicar no painel.

---

## Passo 4 — Remetente com nome do SaaS (SMTP)

Para o Gmail **não** mostrar só "Supabase Auth":

1. **Authentication → SMTP Settings** → Enable custom SMTP  
2. Configure um provedor (ex.: [Resend](https://resend.com), SendGrid, Amazon SES, Brevo) com domínio `jmbeautyflow.tech`  
3. Exemplo de remetente:
   - **Sender email:** `noreply@jmbeautyflow.tech`
   - **Sender name:** `JM BeautyFlow`
4. Registre SPF/DKIM no DNS do domínio (o provedor envia as instruções)

Sem SMTP customizado, só o **conteúdo** do e-mail muda; o remetente técnico pode continuar `mail.app.supabase.io`.

---

## Verificação rápida

1. Abra `https://jmbeautyflow.tech/forgot-password`
2. Informe um e-mail de teste
3. Confira: assunto **JM BeautyFlow**, corpo com logo textual e botão **Criar nova senha**
4. O link deve abrir `https://jmbeautyflow.tech/reset-password#...`

---

## Referência no código

- Pedido de reset: `src/services/authService.ts` → `resetPasswordForEmail`
- Redirect: `src/lib/auth-url.ts` → `getPasswordResetRedirectUrl()`
- Páginas: `src/routes/forgot-password.tsx`, `src/routes/reset-password.tsx`

Não é necessário alterar código para personalizar o e-mail — apenas o Dashboard (e SMTP se quiser remetente próprio).
