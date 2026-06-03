$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Agro Gerenciamento.lnk"
$targetPath = "C:\agro\dist\AgroGerenciamento-Desktop.cmd"
$iconPath = "C:\agro\frontend\public\icons\agro.ico"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = "C:\agro"
if (Test-Path $iconPath) {
  $shortcut.IconLocation = $iconPath
}
$shortcut.Save()

Write-Host "Atalho criado em: $shortcutPath"
