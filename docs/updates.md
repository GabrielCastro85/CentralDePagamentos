# Atualizações do Central de Pagamentos

O app possui uma checagem manual de atualizações pela tela **Configurações > Atualizações do app**. O usuário não precisa digitar URL: o canal de atualização fica configurado no build.

## Como publicar uma atualização

1. Configure uma vez o canal em `electron/update-config.cjs`.
2. Aumente a versão no `package.json`, por exemplo de `0.1.0` para `0.2.0`.
3. Gere o instalador novo com `npm run dist`.
4. Hospede o instalador em um endereço acessível pelas máquinas dos usuários.
5. Publique ou atualize o arquivo `latest.json` nesse mesmo canal apontando para o instalador novo.
6. No app instalado, o usuário clica em **Buscar atualizações** e escolhe se deseja baixar.

## Configuração do canal

Edite `electron/update-config.cjs` antes de gerar o instalador:

```js
const DEFAULT_UPDATE_FEED_URL = 'https://seuservidor.com/central-de-pagamentos/latest.json';

module.exports = {
  DEFAULT_UPDATE_FEED_URL,
};
```

## Formato do latest.json

```json
{
  "version": "0.2.0",
  "url": "https://seuservidor.com/central-de-pagamentos/Central-de-Pagamentos-0.2.0-Setup.exe",
  "publishedAt": "2026-05-23",
  "notes": "Melhorias no importador de pagamentos e ajustes visuais."
}
```

## Campos

- `version`: versão mais recente publicada. Deve ser maior que a versão do `package.json`.
- `url`: link direto para baixar o instalador.
- `publishedAt`: data opcional da publicação.
- `notes`: resumo opcional da atualização.

## Observações

- A busca é manual e não instala automaticamente.
- Ao encontrar atualização, o app abre o link do instalador no navegador.
- Também é possível usar um caminho local para testes no `DEFAULT_UPDATE_FEED_URL`, por exemplo `C:\Atualizacoes\latest.json`.
