# Tabula frontend

SPA React/TypeScript para o backend Tabula. A aplicação contempla autenticação por sessão, portfólios e projetos, configuração de integração e destinos IBM, importação de fluxos e visualização de diagramas com React Flow.

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

Os testes utilizam **fixtures HTTP**, sem credenciais reais. Eles não comprovam que o backend, a IBM ou os serviços de banco estejam funcionando. Com uma conta e instância IBM reais, verifique manualmente: login, criação de portfólio/projeto, cadastro e teste da integração, configuração de destino, importação, abertura de versão, salvamento/conflito de layout e logout. A instalação e execução não utilizam mocks na aplicação.

## Integração e importação IBM

Em um portfólio, OWNER/admin pode cadastrar uma instância com URL e API key e executar o teste de conexão. A chave é enviada apenas ao backend, fica fora do cache de mutations e é limpa do formulário após o envio, inclusive em caso de erro. O teste pode retornar HTTP 200 com verificações malsucedidas ou não suportadas; confira cada resultado.

Em um projeto, OWNER/admin configura um destino Draft informando os IDs IBM. Para importar Dialog V2, informe Assistant ID e Dialog skill ID; workspace ID é opcional e se destina somente ao modo Dialog V1 legado. As versões das APIs são obtidas dos padrões do backend. OWNER/EDITOR/admin pode solicitar importação Dialog ou Actions a partir de um destino Draft ativo.

Uma importação pendente ou de resultado incerto mantém a chave e o corpo da intenção em memória ao navegar. Use **Repetir mesma solicitação** após a espera indicada; não há retry automático. A memória é perdida ao atualizar a página, encerrar a sessão ou fechar o navegador; nesses casos, consulte os fluxos e versões existentes antes de tentar outra intenção para evitar duplicação. Para uma versão reservada PENDING, consultar e reconciliar são ações separadas. A reconciliação não reenvia a importação à IBM. Quando a versão estiver READY, abra seu diagrama pelo link fornecido.

## Diagramas

Acesse um portfólio, projeto e fluxo existentes. A visualização abre o rascunho e permite selecionar uma versão READY; se não houver rascunho, selecione uma versão disponível ou use o link da importação concluída.

O canvas exibe uma **projeção estrutural parcial**, diferencia hierarquia, ordem de avaliação e salto e apresenta diagnósticos; passos internos de Actions não são exibidos. Proprietários, editores e administradores podem movimentar nós e salvar explicitamente o layout. Operadores e visualizadores têm acesso apenas à leitura. Permissões são consultadas no backend; `readOnly` e `editable` da projeção não são permissões.

Use a busca por título ou ID para selecionar e centralizar um nó; o painel de detalhes mostra seu identificador e a quantidade de relações ligadas a ele. **Ajustar diagrama** enquadra os nós, e **Ampliar canvas** ocupa a área disponível da página; use **Reduzir canvas** ou Escape para voltar. O minimapa também ajuda na navegação. Para quem pode editar, a mudança de enquadramento fica pendente até salvar o layout.

O layout é compartilhado por todas as versões do fluxo e salvo separadamente do conteúdo IBM. O salvamento preserva nós que não aparecem na projeção e usa `If-None-Match: *` para criar ou a ETag recebida em `If-Match` para atualizar. Em caso de conflito, as alterações locais permanecem até o usuário optar por descartá-las e recarregar. Não há edição estrutural, tradutor para JSON IBM, aplicação no Draft IBM ou publicação Live nesta etapa.

Para editar conteúdo Dialog, OWNER/EDITOR/admin pode criar explicitamente um rascunho local a partir de uma versão READY, caso ele ainda não exista. No rascunho, selecione um nó Dialog padrão e salve alterações de título, condição ou textos literais existentes. A edição usa o ID IBM do nó e a revisão do rascunho; um conflito mantém os campos locais e exige descarte e recarga explícitos. Layout e conteúdo são salvos separadamente. A edição altera apenas o rascunho local, nunca a skill IBM, e não cria nós nem respostas.

No rascunho, use **Criar versão** para registrar um snapshot do conteúdo salvo. O layout não faz parte da versão e a operação não aplica conteúdo na IBM. O pedido usa a revisão do rascunho e uma chave de idempotência; resultado incerto permite repetir somente a mesma intenção, e versões pendentes podem ser consultadas ou reconciliadas explicitamente. A chave fica apenas em memória durante a sessão: antes de atualizar ou sair com uma operação pendente, consulte as versões existentes para evitar duplicação. Conflitos de revisão exigem recarregar o rascunho antes de criar outra versão.

Guias e contratos de referência estão em [frontend-handoff](frontend-handoff/README.md); controllers e DTOs da árvore local do backend prevalecem sobre a fotografia. Tokens CSRF ficam apenas em memória, e o navegador administra o cookie HttpOnly de sessão.
