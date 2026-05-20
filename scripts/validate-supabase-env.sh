#!/usr/bin/env bash
# Valida .env antes do build Vite — somente VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (eyJ).
set -euo pipefail

fail=0

remove_legacy_env_backups() {
  for legacy in .env.backup .env.backup.bak .env.bak; do
    if [[ -f "$legacy" ]]; then
      echo "==> Renomeando $legacy -> ${legacy}.old (pode conter sb_publishable antigo)"
      mv -f "$legacy" "${legacy}.old" 2>/dev/null || rm -f "$legacy"
    fi
  done
}

strip_publishable_from_env_files() {
  for f in .env .env.production .env.local; do
    if [[ -f "$f" ]] && grep -qE '^VITE_SUPABASE_PUBLISHABLE_KEY=' "$f"; then
      echo "==> Removendo VITE_SUPABASE_PUBLISHABLE_KEY de $f"
      sed -i.bak '/^VITE_SUPABASE_PUBLISHABLE_KEY=/d' "$f"
      rm -f "${f}.bak"
    fi
  done
}

validate_env_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0

  if grep -qE '^VITE_SUPABASE_PUBLISHABLE_KEY=' "$f"; then
    echo "ERRO: $f ainda define VITE_SUPABASE_PUBLISHABLE_KEY."
    fail=1
  fi
  if grep -qE '^VITE_SUPABASE_ANON_KEY=sb_publishable' "$f"; then
    echo "ERRO: $f — VITE_SUPABASE_ANON_KEY não pode ser sb_publishable_. Use JWT eyJ... (Legacy anon)."
    fail=1
  fi
}

remove_legacy_env_backups
strip_publishable_from_env_files

for f in .env .env.production .env.local; do
  validate_env_file "$f"
done

primary=".env"
[[ -f .env.production ]] && primary=".env.production"

if [[ ! -f "$primary" ]]; then
  echo "ERRO: Crie $primary com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (eyJ...)."
  exit 1
fi

if ! grep -qE '^VITE_SUPABASE_URL=https://[a-z0-9]+\.supabase\.co' "$primary"; then
  echo "ERRO: VITE_SUPABASE_URL inválida ou ausente em $primary"
  fail=1
fi

if ! grep -qE '^VITE_SUPABASE_ANON_KEY=eyJ' "$primary"; then
  echo "ERRO: VITE_SUPABASE_ANON_KEY deve começar com eyJ em $primary"
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "OK: Supabase env ($primary) — URL + anon JWT eyJ"
