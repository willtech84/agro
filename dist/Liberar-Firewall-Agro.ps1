$rules = @(
  @{ Name = "Agro Backend 4000"; Port = 4000 },
  @{ Name = "Agro Frontend 3000"; Port = 3000 }
)

foreach ($rule in $rules) {
  $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue

  if ($existing) {
    Write-Host "Regra ja existe: $($rule.Name)"
    continue
  }

  New-NetFirewallRule `
    -DisplayName $rule.Name `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $rule.Port | Out-Null

  Write-Host "Regra criada: $($rule.Name) porta $($rule.Port)"
}

Write-Host ""
Write-Host "Firewall liberado para o Agro Gerenciamento."
Write-Host "No celular, teste: http://192.168.1.8:4000/health"
Read-Host "Pressione Enter para fechar"
