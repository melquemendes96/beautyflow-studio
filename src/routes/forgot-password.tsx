import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mail } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { authService } from "@/services/authService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [{ title: "Recuperar senha — JM BeautyFlow" }],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Informe seu e-mail.");
      return;
    }
    setPending(true);
    try {
      const { error } = await authService.resetPasswordForEmail(trimmed);
      if (error) {
        toast.error("Não foi possível enviar o e-mail. Verifique o endereço e tente novamente.");
        return;
      }
      setSent(true);
      toast.success("Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-elegant">
        <Logo onLight className="mx-auto h-12 max-w-[220px]" />
        <h1 className="mt-6 text-center font-display text-2xl">Recuperar senha</h1>

        {sent ? (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <p>Enviamos as instruções para o e-mail informado, se ele estiver cadastrado.</p>
            <p className="mt-2">Abra o link no e-mail para definir uma nova senha.</p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Informe o e-mail da sua conta. Enviaremos um link seguro para criar uma nova senha.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">E-mail</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={pending}
                    required
                    className="pl-10"
                  />
                </div>
              </label>
              <Button type="submit" className="w-full rounded-full" disabled={pending}>
                {pending ? "Enviando…" : "Enviar link de recuperação"}
              </Button>
            </form>
          </>
        )}

        <Link
          to="/login"
          className="mt-6 block text-center text-sm font-medium text-foreground underline underline-offset-4"
        >
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
