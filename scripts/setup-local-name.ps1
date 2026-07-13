$ErrorActionPreference = 'Stop'

$hostName = 'fastled-studio.localhost'
$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$entry = "127.0.0.1 $hostName"

$principal = [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host "Run this once from an Administrator PowerShell:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\setup-local-name.ps1"
  exit 1
}

$content = Get-Content -LiteralPath $hostsPath -ErrorAction Stop
$alreadyPresent = $content | Where-Object {
  $_ -match '(^|\s)fastled-studio\.localhost(\s|$)'
}

if ($alreadyPresent) {
  Write-Host "$hostName is already configured."
  exit 0
}

Add-Content -LiteralPath $hostsPath -Value "`r`n# FastLED Studio local dev name`r`n$entry"
ipconfig /flushdns | Out-Null
Write-Host "Configured http://$hostName:5173"
