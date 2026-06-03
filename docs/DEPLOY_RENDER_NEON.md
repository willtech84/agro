# Deploy Render + Neon

Este guia publica o Agro Gerenciamento com HTTPS para uso fora da rede local.

## 1. Criar o banco no Neon

1. Acesse https://neon.com e crie um projeto PostgreSQL.
2. Copie a connection string do banco, de preferência a opção pooled.
3. Confirme que a URL termina com SSL habilitado, por exemplo:

```text
postgresql://USUARIO:SENHA@HOST/neondb?sslmode=require
```

Guarde essa URL para preencher a variável `DATABASE_URL` no Render.

## 2. Publicar no Render

O projeto já tem um Blueprint em `render.yaml` com dois serviços:

- `agrogerenciamento-api`: backend/API Express com Prisma.
- `agrogerenciamento-web`: frontend web com HTTPS e proxy para a API.

No Render:

1. Acesse https://render.com.
2. Crie um novo Blueprint apontando para o repositório deste projeto.
3. Confirme o arquivo `render.yaml`.
4. Preencha as variáveis secretas solicitadas:

```text
DATABASE_URL=URL_DO_NEON
ADMIN_EMAIL=seu-email-admin
ADMIN_PASSWORD=sua-senha-forte
```

O `JWT_SECRET` é gerado automaticamente pelo Render.

Na produção, `ALLOW_PUBLIC_REGISTRATION=false` fecha o cadastro público depois que já existe usuário. O admin inicial é criado com `ADMIN_EMAIL` e `ADMIN_PASSWORD`; depois de entrar com esse admin, use o cadastro de usuário dentro do app para criar gestores e operadores.

No plano gratuito do Render, `preDeployCommand` não é suportado. Por isso o Blueprint roda `npx prisma migrate deploy` dentro do `startCommand` da API; esse comando é idempotente e aplica somente migrations pendentes antes de iniciar o servidor.

## 3. URLs finais

Se mantiver os nomes do `render.yaml`, as URLs serão:

```text
API: https://agrogerenciamento-api.onrender.com
Web: https://agrogerenciamento-web.onrender.com
Health: https://agrogerenciamento-api.onrender.com/health
```

Se o Render alterar o subdomínio, atualize estas variáveis:

Backend `agrogerenciamento-api`:

```text
CORS_ORIGINS=https://SUA-URL-WEB.onrender.com,capacitor://localhost,ionic://localhost
FRONTEND_PUBLIC_URL=https://SUA-URL-WEB.onrender.com
```

Frontend `agrogerenciamento-web`:

```text
BACKEND_URL=https://SUA-URL-API.onrender.com
PUBLIC_API_BASE_URL=https://SUA-URL-API.onrender.com
```

## 4. Usar no APK Android

No campo **Servidor do app**, informe a URL HTTPS da API:

```text
https://agrogerenciamento-api.onrender.com
```

Não use `/health` no final.

## 5. Observações do plano gratuito

- O Render Free pode dormir depois de um período sem acesso; a primeira abertura pode demorar cerca de 1 minuto.
- O Neon Free é suficiente para testes e primeiros pilotos pequenos, mas monitore uso e armazenamento.
- Para vender com confiabilidade, o ideal é migrar a API para um plano pago básico quando começar a ter clientes reais.
