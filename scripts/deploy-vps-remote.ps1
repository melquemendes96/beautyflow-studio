# Deploy na VPS — execute no PowerShell (com SSH configurado e agente carregado)
# Uso: .\scripts\deploy-vps-remote.ps1
# Host esperado no ~/.ssh/config: beautyflow-studio-vps

$ErrorActionPreference = "Stop"
$HostAlias = "beautyflow-studio-vps"
$AppDir = "/var/www/beautyflow-studio"

$remoteScript = @"
set -e
cd $AppDir
echo '==> git pull origin main'
git fetch origin main
git checkout main
git pull origin main
bash scripts/vps-deploy.sh
"@

Write-Host "Conectando em $HostAlias ..."
ssh $HostAlias $remoteScript

Write-Host ""
Write-Host "Deploy remoto concluido. Teste: https://jmbeautyflow.tech"
