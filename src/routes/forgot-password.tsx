import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [{ title: "Recuperar senha — JM BeautyFlow" }],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elegant">
        <Logo onLight className="mx-auto h-12 max-w-[220px]" />
        <h1 className="mt-6 font-display text-2xl">Recuperação de senha</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Em breve você poderá redefinir sua senha por e-mail. Por enquanto, entre em contato com o suporte ou
          use login com Google.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block text-sm font-medium text-foreground underline underline-offset-4"
        >
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
