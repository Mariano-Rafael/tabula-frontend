# Tabula frontend

SPA React/TypeScript para o backend Tabula. Esta etapa contempla autenticação por sessão e listagem/criação de portfólios. Projetos, integração IBM e editor ainda não estão implementados.

## Executar

Requer Node.js 22.22 ou superior (o projeto foi verificado com Node 24) e npm.

```powershell
npm ci
npm run dev
```

Abra `http://localhost:5173`. O Vite encaminha `/api` para `http://localhost:8080`; o frontend usa `/api/v1` por padrão. `.env.example` documenta a única variável opcional, `VITE_API_BASE_URL`. Para alterar a porta ou origem do backend local, ajuste o proxy em `vite.config.ts`; não exponha segredos em variáveis `VITE_*`.

Inicie o backend a partir da cópia local que contém as alterações documentadas, com seus próprios MySQL, MongoDB e configuração. Para HTTP local, configure `SESSION_COOKIE_SECURE=false` **no ambiente do backend**; mantenha cookies seguros em HTTPS. Entre com uma conta existente fornecida pelo administrador. Não copie o `.env` do backend para este projeto.

Em produção, sirva a SPA e encaminhe `/api` ao backend na mesma origem, com fallback para `index.html` nas rotas da aplicação.

## Verificação

```powershell
npm test
npm run build
```

Os testes utilizam **fixtures HTTP**, sem credenciais reais. Eles não comprovam que o backend ou os serviços de banco estejam funcionando. Com a API real disponível, verifique manualmente: login inválido e válido, atualização da página, listagem e criação de portfólio, logout e sessão expirada. A instalação e execução não utilizam mocks na aplicação.

Guias e contratos de referência estão em [frontend-handoff](frontend-handoff/README.md); controllers e DTOs da árvore local do backend prevalecem sobre a fotografia. Tokens CSRF ficam apenas em memória, e o navegador administra o cookie HttpOnly de sessão.
