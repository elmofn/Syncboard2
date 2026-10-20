# TC-480 · Área útil completa para soltar cards

Base verificada: `6300684d152253420b9279ecdba7e585b15af972` (`main`, GitHub, 12/10/2026).

## Diagnóstico e alteração

Antes de editar, o teste manual no Chrome de produção (1180 × 757, sessão Cashia) mostrou que soltar TC-481 e TC-480 no vazio inferior de Andamento não movia o card; soltar sobre a região ocupada por card movia. O CSS ativo confirma a causa: o quadro usava `align-items: start`, colunas de altura automática e listas com mínimo de 104 px. O Sortable está ligado à lista, portanto o vazio abaixo do seu limite não era alvo de drop.

A correção é apenas de layout:
- Somente a vista Kanban usa o canvas como coluna flexível, preservando altura dos controles.
- O quadro cresce até o fim do canvas visível, sem comprimir conteúdo longo.
- As colunas se esticam até a altura da maior; seu cabeçalho permanece no topo e a segunda linha de grid (lista Sortable) ocupa o restante.
- O indicador de coluna vazia continua sem interceptar ponteiro.
- As duas entradas HTML versionam o CSS alterado para evitar cache anterior.

Não há alteração em JavaScript de produção, API, modelo de dados, permissões, aprovação, ordenação ou persistência. Não houve push, PR, merge ou implantação.

## Verificação executada

- Novo `node tests/check_kanban_drop_area.mjs`: falhou na base; passou com a correção.
- Suíte completa local antes: **35 passaram, 29 falharam**.
- Suíte completa local depois: **36 passaram, mesmas 29 falharam**; nenhuma mudança no resultado de teste existente. Os testes anteriores incluem falhas já presentes de contratos congelados de entregas antigas e mocks desatualizados. Isso não é uma aprovação da suíte completa.
- Passaram os testes existentes de renderização/fluxo Kanban, decisões e seleção de homologador, coordenação de homologação e filtro por responsável/homologador.
- Sintaxe JavaScript da aplicação/API, novo teste e fixture verificada; `git diff --check` passou.
- O servidor de fixture foi validado por HTTP dentro do mesmo processo: HTML candidato/base, módulos e CSS retornam 200; `/api/` e `/.auth/` retornam 403.

## QA visual pendente

O navegador da nuvem não alcançou o servidor local de fixture (`ERR_CONNECTION_REFUSED`). A produção foi usada apenas para reprodução anterior; o CSS candidato **ainda não foi validado visualmente**. Layout computado, arraste nativo após a correção e persistência real após implantação não estão comprovados por estes testes de fonte/mocks.

### Fixture reproduzível, sem dados reais

No mesmo ambiente do navegador, executar:

```sh
python tests/serve_kanban_drop_area.py 8480
```

Abrir `http://127.0.0.1:8480/` para candidato e `http://127.0.0.1:8480/?baseline=1` para o CSS anterior. A fixture reutiliza a entrada real, renderização e callback de drag reais. O carregamento/autenticação são removidos; dados sintéticos e salvamento apenas em sessionStorage substituem a API. O indicador de geometria compara altura útil, fim das listas e alinhamento de colunas. O servidor deve ser usado apenas localmente.

### Critérios de aceite de Felipe

1. Na resolução de reprodução, mover FIX-1 ao espaço livre abaixo de FIX-3 em Andamento, tanto no centro quanto próximo ao rodapé útil. Deve persistir no armazenamento local da fixture ao recarregar.
2. Soltar em Parado vazia no topo, centro e fundo da área útil. Depois de reset, esvaziar todas as colunas e confirmar que as listas seguem ocupando a altura útil completa.
3. Reordenar dois cards na mesma coluna, inclusive após repetir ida/volta entre colunas. A ordem deve permanecer após recarregar a fixture.
4. Com filtro ativo, movimento entre colunas deve funcionar sem reordenar o conjunto parcial. A nota existente deve continuar visível.
5. Usar “Long lane”: colunas curtas/vazias devem alcançar a mais alta. Rolar verticalmente e soltar no vazio da coluna curta, em posição compatível com cards inferiores da longa. Nada pode ser recortado.
6. Em 1440, 1180, 1000, 768 e 375 px de largura (e altura pequena), conferir rolagem horizontal, vertical, os cinco cabeçalhos, controles sem compressão e rodapé móvel. Soltar depois de rolar horizontalmente.
7. Repetir nos temas claro/escuro. Conferir menus dos cards, navegação para Lista/Home e retorno, sem espaçamento extra nessas outras vistas.
8. A fixture permite conferir a interceptação ao entrar em Homologação, mas não contém seed nesse status para exercitar a saída. O bloqueio de saída sem decisão foi verificado nos mocks existentes; o teste visual dessa saída exige um seed sintético apropriado ou a homologação posterior. Após uma publicação autorizada, validar também persistência real/SignalR em ambiente de homologação.
