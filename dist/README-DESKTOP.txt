Agro Gerenciamento - modo desktop

1. Abra AgroGerenciamento-Desktop.cmd para iniciar o app no computador.
2. O script sobe os containers com docker compose up -d e abre o sistema em modo aplicativo.
3. Para criar um atalho na area de trabalho, execute:

   powershell -ExecutionPolicy Bypass -File C:\agro\dist\Criar-Atalho-Desktop.ps1

Android em celular fisico:
- O APK precisa do IP do computador/servidor na mesma rede.
- No campo "Servidor do app", use algo como:

  http://192.168.1.50:4000

- Nao use localhost no celular.
