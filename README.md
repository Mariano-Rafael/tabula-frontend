# Tabula frontend

SPA React/TypeScript para o backend Tabula, com autenticação por sessão, portfólios, projetos e editor de canvas com exportação JSON.

A hierarquia é **Portfólio → Projeto → Fluxo → Versões**. As permissões são definidas no portfólio. Fluxos gerenciados pelo editor guardam o canvas em cada versão; fluxos locais legados mantêm o canvas no rascunho e nas versões.

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

Os testes utilizam **fixtures HTTP**, sem credenciais reais. Eles não comprovam que o backend ou os serviços de banco estejam funcionando. Com uma conta real, verifique manualmente login, criação de portfólio, projeto e fluxo, edição, salvamento, exportação e logout. A aplicação não utiliza mocks.

As confirmações de ações dentro da aplicação usam modais do Tabula. Ao atualizar ou fechar a aba com alterações não salvas ou uma operação pendente, o aviso de proteção é controlado pelo navegador e não pode ser substituído por um modal da página.

Na lista de portfólios, OWNER e administradores podem editar nome e descrição; limpar a descrição envia uma string vazia. As permissões são verificadas no backend e erros de verificação são exibidos no cartão correspondente.

Nas listagens, OWNER, EDITOR e administradores podem editar nome e descrição de projetos e renomear fluxos. Limpar a descrição do projeto envia uma string vazia.

Na edição de um fluxo, **Arquivar fluxo** remove-o da lista ativa. A API não oferece restauração para fluxos arquivados; a ação requer confirmação.

OWNER, EDITOR e administradores podem arquivar projetos pela edição do cartão. O projeto sai da lista ativa e as operações de edição de seus fluxos ficam bloqueadas. Não há restauração pela interface.

OWNER e administradores podem arquivar portfólios pela edição do cartão. O portfólio sai da lista ativa e as operações de edição de seus projetos ficam bloqueadas. Não há restauração pela interface. Versões não possuem endpoint de exclusão.

Na lista de fluxos, **Novo fluxo** cria um fluxo local persistido. Com o backend atual, a primeira versão vazia é editável diretamente; o painel de criação fecha e a lista é atualizada. Com o contrato legado, é necessário iniciar o rascunho a partir da versão. A criação usa uma chave de idempotência mantida em memória para repetir a mesma intenção ou reconciliar uma versão pendente. Antes de atualizar ou sair com resultado incerto, consulte os fluxos para evitar duplicação.

## Integrações anteriores

Os recursos e fluxos IBM estão ocultos nesta interface, inclusive por URL direta. Os dados e o backend existentes não foram removidos nem migrados. O frontend verifica também os documentos das versões para ocultar fluxos importados sem destino vinculado; isso pode aumentar o tempo de carregamento em projetos com muitos fluxos ou versões.

## Diagramas

Acesse um portfólio, projeto e fluxo existentes. Fluxos gerenciados pelo editor abrem uma versão editável; selecione o nó para alterar título e resposta e use **Salvar** para gravar a versão. O salvamento usa a revisão da versão e preserva os demais dados do documento. Em conflito, as alterações locais permanecem até a recarga explícita.

Fluxos legados continuam usando o rascunho e versões imutáveis: a visualização abre o rascunho e permite selecionar uma versão READY. Eles não são migrados automaticamente.

Clique em um nó para abrir seu painel no lado direito do canvas. Proprietários, editores e administradores podem editar; operadores e visualizadores têm acesso somente leitura.

No canvas, o menu lateral cria nós **Texto Padrão**, **Resposta Generativa** e **Opções (Botões)**, com título, resposta textual, saídas nomeadas e variáveis de nó ou contexto. Os nomes das opções podem ser editados no próprio nó; cada opção pode ter uma resposta editada no painel. O painel permite registrar condição de entrada, nó aberto e cores e rótulo dos conectores; o cabeçalho usa a cor da condição, como no Pando. Essas configurações e a resposta generativa são apenas dados do JSON: o Tabula não executa as condições nem gera respostas. Conecte as saídas aos outros nós e use o minimapa para navegar.

**Criar Módulo** adiciona um agrupamento à versão atual; selecione um nó e escolha o módulo no painel para agrupá-lo ou removê-lo do grupo. Um módulo só pode ser excluído depois de seus nós serem retirados. O menu **Variáveis de contexto** edita as variáveis da versão: valores textuais podem ser alterados, enquanto valores JSON não textuais existentes são mostrados em leitura e preservados. Salve o documento com **Salvar** para persistir essas alterações. Templates continuam como recurso futuro.

Arraste no fundo para selecionar vários itens; use o botão do meio ou direito do mouse para mover o canvas. Com o canvas em foco, `Ctrl+A` seleciona tudo e `Ctrl+C` / `Ctrl+V` copiam e colam nós e conexões entre eles. `Delete` ou `Backspace` solicita confirmação para excluir a seleção. Copiar um módulo inclui seus nós; excluir um módulo requer selecionar também seus filhos. As linhas de alinhamento aparecem ao arrastar nós fora de módulos.

Novos nós locais incluem a saída **Continuar**. Nós antigos sem saídas exibem esse ponto e, ao conectá-lo, a saída é adicionada ao documento. O texto mostrado no nó é editado pelo painel lateral.

Para remover um nó selecionado, pressione **Delete** ou use **Remover nó** no painel e confirme; suas conexões também são removidas. Salve o canvas para persistir a alteração.

**Exportar JSON** baixa o documento nativo completo da versão aberta, incluindo nós, conexões, posições e viewport. A exportação inclui alterações ainda não salvas, não altera o backend e não substitui **Salvar**. Ela também está disponível em versões somente leitura. Seleção e outros estados transitórios do React Flow não são exportados.

Nos fluxos locais legados, o canvas completo é salvo no rascunho com `If-Match` e cada versão preserva seu próprio layout. A criação e duplicação de versões ainda não estão disponíveis na interface do editor.

Guias e contratos de referência estão em [frontend-handoff](frontend-handoff/README.md); controllers e DTOs da árvore local do backend prevalecem sobre a fotografia. Tokens CSRF ficam apenas em memória, e o navegador administra o cookie HttpOnly de sessão.
