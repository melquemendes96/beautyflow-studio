# Restaura o repositório local ao checkpoint pré-WhatsApp (somente código).
# Uso: .\supabase\scripts\checkpoint_pre_whatsapp_restore.ps1

$ErrorActionPreference = "Stop"
$Tag = "pre-whatsapp-2026-05-22"

Set-Location (Join-Path $PSScriptRoot "..\..")

Write-Host "Fetching tags..."
git fetch origin --tags

Write-Host "Checkout tag $Tag ..."
git checkout $Tag

Write-Host "Instalando dependências..."
npm ci

Write-Host "Build de produção..."
npm run build

Write-Host ""
Write-Host "OK — código no checkpoint $Tag"
Write-Host "Na VPS: git fetch --tags && git checkout $Tag && npm ci && npm run build && pm2 restart all"
Write-Host "Banco: use backup Supabase ou docs/CHECKPOINT_PRE_WHATSAPP.md"
