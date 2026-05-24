# Central de Pagamentos - Identidade Visual

## Conceito

Marca baseada em um monograma `CP`, unindo `Central / Controle` e `Pagamentos` em uma forma contínua. O desenho prioriza leitura em tamanhos pequenos, sensação de fluxo financeiro e aparência fintech/SaaS premium.

## Cores

- Dark: `#07111F`
- Navy: `#0B1220`
- Teal: `#14E0C9`
- Cyan: `#0EA5E9`
- White: `#F8FAFC`
- Muted: `#94A3B8`

## Arquivos

- `logo-horizontal.svg`: versão principal com símbolo e texto.
- `logo-symbol.svg`: apenas o símbolo CP em gradiente.
- `logo-symbol-white.svg`: símbolo monocromático branco.
- `logo-horizontal-white.svg`: versão horizontal branca para fundos escuros.
- `app-icon.svg`: ícone quadrado base para o app.
- `splash-logo.svg`: versão para tela de carregamento/splash.
- `favicon.svg`: versão simplificada para favicon.

## Uso recomendado

- Sidebar e áreas compactas: `logo-symbol.svg`.
- Materiais institucionais ou tela de abertura: `logo-horizontal.svg` ou `splash-logo.svg`.
- Fundos escuros com pouco contraste: versões `*-white.svg`.
- Windows installer/app icon: converter `app-icon.svg` para `build/app-icon.ico` e/ou `build/app-icon.png`.

## Ícone Windows

O Electron está preparado para usar `build/app-icon.ico` ou `build/app-icon.png` quando o arquivo existir. Para gerar um `.ico`, exporte `app-icon.svg` em PNG nos tamanhos 16, 32, 48, 128 e 256 px e converta para `.ico` com uma ferramenta externa.
