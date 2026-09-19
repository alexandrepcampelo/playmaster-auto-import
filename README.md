# PlayMaster Auto Import

Serviço de recepção, identificação e preparação de arquivos de áudio do ecossistema PlayMaster.

## Arquitetura inicial

- **Auto Import:** recebe e classifica os arquivos.
- **VPS:** mantém a Biblioteca Central, gera os IDs e preserva os originais.
- **PlayMaster Traffic:** utiliza os arquivos nos contratos, mapas, programação e jornalismo.
- **PlayMaster Studio Air:** sincroniza uma cópia local e executa os áudios mesmo se a internet cair.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
cp .env.example .env
npm start
```

Abra `http://localhost:3600`.

Antes de iniciar, configure `AUTO_IMPORT_ADMIN_PASSWORD`, `AUTO_IMPORT_API_TOKEN` e `AUTO_IMPORT_SESSION_SECRET`. O usuário administrativo é definido por `AUTO_IMPORT_ADMIN_USER` e, se omitido, será `admin`.

O painel utiliza sessão segura por cookie. Integrações, como o futuro agente Windows, devem enviar `Authorization: Bearer SEU_TOKEN` para acessar a API. Somente `/api/health` permanece público. No deploy, os segredos são transportados em Base64 para aceitar caracteres especiais sem expô-los ou quebrar o arquivo de ambiente.

## Entrada inicial de arquivos

Coloque arquivos `.mp3`, `.wav`, `.flac`, `.aac`, `.m4a` ou `.ogg` em `storage/inbox`. Uma subpasta pode representar a categoria, por exemplo `storage/inbox/Comerciais/anuncio.mp3`.

O serviço gera um ID sequencial, calcula SHA-256, preserva o original em `storage/originals` e registra o resultado em `data/imports.json`.

## Deploy

O workflow da branch `main` utiliza os Secrets `VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_SSH_KEY`, `DEPLOY_PATH`, `AUTO_IMPORT_ADMIN_USER`, `AUTO_IMPORT_ADMIN_PASSWORD`, `AUTO_IMPORT_API_TOKEN` e `AUTO_IMPORT_SESSION_SECRET`. A aplicação fica vinculada somente a `127.0.0.1:3600` e deve ser publicada por proxy reverso HTTPS.

## Próximas etapas

1. agente Windows e monitoramento de pastas locais;
2. upload resumível;
3. normalização LUFS/True Peak preservando o original;
4. análise de duração, Cue e Fade;
5. integração com Traffic e sincronização do Studio Air;
6. empacotamento do agente como `.exe`.
