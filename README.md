# Agro Gerenciamento

Aplicação simples com frontend e backend para monitorar o status do serviço.

## O que foi corrigido

- Frontend agora consulta o backend por `GET /api/health` usando proxy interno (evita erro de CORS e o acoplamento ao `localhost:4000`).
- Inclusão de suporte a **PWA instalável** com:
  - `manifest.webmanifest`
  - `service-worker.js`
  - ícones do app
  - botão de instalação quando suportado pelo navegador

## Rodar com Docker

```bash
docker compose up --build
```

Serviços:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- PostgreSQL: `localhost:5432`

## Deploy em nuvem com HTTPS

O projeto está preparado para deploy no **Render + Neon**:

- `render.yaml`: Blueprint do Render com `agrogerenciamento-api` e `agrogerenciamento-web`.
- `.env.render.example`: variáveis de produção para copiar/conferir.
- `docs/DEPLOY_RENDER_NEON.md`: passo a passo de publicação.

Fluxo recomendado:

1. Crie um banco PostgreSQL no Neon e copie a connection string com `sslmode=require`.
2. No Render, crie um Blueprint usando o `render.yaml`.
3. Preencha `DATABASE_URL`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
4. Use no APK a URL HTTPS da API:

```text
https://agrogerenciamento-api.onrender.com
```

Se o Render gerar outro subdomínio, atualize `BACKEND_URL`, `PUBLIC_API_BASE_URL`, `CORS_ORIGINS` e `FRONTEND_PUBLIC_URL` no painel do Render.

## Rodar local sem Docker

### Backend

```bash
cd backend
npm install
npm start
```

### Frontend

```bash
cd frontend
npm install
npm start
```

Abra `http://localhost:3000`.

## Rodar com um bloco único (Git Bash no Windows)

Se você estiver no Windows/Git Bash e quiser evitar processos antigos e conflitos de porta, use:

```bash
cd /c/agro
./start-local.sh
```

Esse script:
- mata processos `node.exe` antigos,
- instala dependências de backend/frontend,
- sobe backend (`4000`) e frontend (`3001`),
- faz validações rápidas com `curl` e mostra diagnóstico automático se `/` não retornar 200.

Para parar tudo:

```bash
cd /c/agro
./stop-local.sh
```


### Hotfix rápido se ainda ficar 404 na raiz

Se você estiver numa branch/cópia antiga e continuar com `Not Found` em `/`, aplique a correção do servidor estático com:

```bash
cd /c/agro
./apply-hotfix-frontend-404.sh
./start-local.sh
```

## Instalação como app

No navegador compatível (Chrome/Edge Android/Desktop), abra o frontend e use o botão **Instalar aplicativo** quando aparecer.

## APK Android

O projeto também pode ser empacotado como APK Android com Capacitor.

APK gerado nesta máquina:

```text
C:\agro\dist\agro-gerenciamento-debug.apk
```

Para instalar em um aparelho conectado via USB com depuração habilitada:

```bash
adb install -r C:/agro/dist/agro-gerenciamento-debug.apk
```

No APK, o app abre o campo **Servidor do app** antes de tentar buscar dados. Use o IP do computador/servidor na mesma rede, por exemplo `http://192.168.1.50:4000`. `localhost` e `10.0.2.2` não funcionam em celular físico.

Fora da rede local, o IP `192.168.x.x` não funciona. Para acesso externo simples e seguro, use uma VPN privada como Tailscale no computador e no celular; depois informe no app o IP Tailscale do computador, por exemplo `http://100.x.y.z:4000`.

Se `http://IP_DO_COMPUTADOR:4000/health` abre no navegador do celular, mas o APK ainda não conecta, atualize o backend e reinstale o APK mais recente:

```bash
cd C:\agro
docker compose up -d --build
adb install -r C:\agro\dist\agro-gerenciamento-debug.apk
```

No campo **Servidor do app**, informe somente a base do servidor, sem `/health`:

```text
http://192.168.1.8:4000
```

Para gerar novamente:

```bash
cd frontend
npm run android:debug
```

Para publicação comercial/Play Store, gere um APK/AAB release assinado com uma chave privada de produção.

## Modo desktop Windows

Para usar como aplicativo no computador, abra:

```text
C:\agro\dist\AgroGerenciamento-Desktop.cmd
```

Ele sobe os containers com `docker compose up -d` e abre o sistema em uma janela de aplicativo do Edge/Chrome.

Para criar atalho na Área de Trabalho:

```powershell
powershell -ExecutionPolicy Bypass -File C:\agro\dist\Criar-Atalho-Desktop.ps1
```

## Workflows

- `build-android-debug.yml`: build de APK debug e upload de artefato
- `build-android-release.yml`: build de APK release com assinatura via secrets

## Troubleshooting (quando aparecer "Not Found")

Se o frontend subir mas a raiz ainda mostrar "Not Found", confirme no terminal do frontend as linhas de startup:

- `[agro-frontend] Frontend running on port 3001`
- `[agro-frontend] Serving static files from: .../frontend/public`

Comandos rápidos:

```bash
cd /c/agro
./start-local.sh
```

Se quiser parar e limpar portas/processos:

```bash
cd /c/agro
./stop-local.sh
```


Se ainda retornar 404 em `/`, consulte `frontend.log` e confirme se o arquivo em execução é o `frontend/server.js` com logs `[agro-frontend]` e faça `git pull` na branch correta.


## Backend (Express + Prisma + JWT)

O backend agora usa Express com ORM Prisma e autenticação JWT para o módulo inicial de usuários/multiusuário.

### Preparar banco/migrations

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
```

### Endpoints iniciais

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me` (Bearer token)
- `GET /users` (Bearer token, role ADMIN/MANAGER)
- `POST /users` (Bearer token, role ADMIN/MANAGER)
- `GET /farms` (Bearer token)
- `POST /farms` (Bearer token)
- `PUT /farms/:id` (Bearer token)
- `DELETE /farms/:id` (Bearer token)
- `GET /plots?farmId=...` (Bearer token)
- `POST /plots` (Bearer token)
- `PUT /plots/:id` (Bearer token)
- `DELETE /plots/:id` (Bearer token)
- `GET /crops` (Bearer token)
- `POST /crops` (Bearer token, ADMIN/MANAGER)
- `PUT /crops/:id` (Bearer token, ADMIN/MANAGER)
- `DELETE /crops/:id` (Bearer token, ADMIN/MANAGER)
- `GET /activities` (Bearer token)
- `POST /activities` (Bearer token)
- `PUT /activities/:id` (Bearer token)
- `DELETE /activities/:id` (Bearer token)
- `GET /reports/activities-summary` (Bearer token)
- `GET /reports/activities-by-crop` (Bearer token)
- `GET /docs` (documentação rápida em JSON)

Exemplo de registro:

```bash
curl -X POST http://localhost:4000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Admin","email":"admin@agro.local","password":"123456","role":"ADMIN"}'
```


Exemplo de criação de fazenda:

```bash
curl -X POST http://localhost:4000/farms \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Fazenda Santa Luzia","location":"Sorriso/MT","areaHectare":120.5}'
```


Exemplo de criação de talhão:

```bash
curl -X POST http://localhost:4000/plots \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Talhão A","areaHectare":35,"farmId":"ID_DA_FAZENDA"}'
```

Exemplo de criação de cultura:

```bash
curl -X POST http://localhost:4000/crops \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Soja","scientificName":"Glycine max","cycleDays":120}'
```

Exemplo de criação de atividade:

```bash
curl -X POST http://localhost:4000/activities \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"PLANTIO","date":"2026-02-24","farmId":"ID_DA_FAZENDA","plotId":"ID_DO_TALHAO","cropId":"ID_DA_CULTURA","quantity":40,"unit":"ha","notes":"Plantio safra 26/27"}'
```

Exemplo de relatório simples:

```bash
curl -H "Authorization: Bearer SEU_TOKEN" http://localhost:4000/reports/activities-summary
```


## Hardening (Pacote 1)

- Segurança backend:
  - validação de `JWT_SECRET` forte em produção;
  - headers de segurança (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`);
  - CORS por allowlist via `CORS_ORIGINS`;
  - rate limit global e reforçado para rotas de autenticação.
- Operação:
  - `docker-compose` com `healthcheck` e `restart: unless-stopped` para `db`, `backend` e `frontend`.
- Configuração:
  - arquivo `.env.example` com variáveis essenciais para backend/frontend.
- Teste base automatizado:
  - `npm run test:smoke` no backend (verifica `/health` e `/docs`).

### Smoke test

Com backend rodando localmente:

```bash
cd backend
npm run test:smoke
```

## Próximos passos (Pacote 2)

Para evoluir o projeto com foco em qualidade e confiabilidade, a próxima fase recomendada é:

1. **Testes de integração do backend**
   - Cobrir fluxos de `auth`, CRUD de `farms/plots/crops/activities`, autorização por perfil e relatórios.
2. **Validação de payload por schema**
   - Padronizar validações de entrada para todas as rotas (tipos, obrigatórios, ranges e datas).
3. **Regras de consistência de domínio**
   - Garantir coerência entre `farmId`, `plotId` e `cropId` antes de persistir atividades.
4. **Melhorias de UX no frontend**
   - Adicionar paginação/filtros de listas, estados de loading/erro e confirmação de ações destrutivas.
5. **CI de qualidade**
   - Automatizar checks (`node --check`), testes de integração e smoke test em pipeline.
