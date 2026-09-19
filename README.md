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

## Entrada inicial de arquivos

Coloque arquivos `.mp3`, `.wav`, `.flac`, `.aac`, `.m4a` ou `.ogg` em `storage/inbox`. Uma subpasta pode representar a categoria, por exemplo `storage/inbox/Comerciais/anuncio.mp3`.

O serviço gera um ID sequencial, calcula SHA-256, preserva o original em `storage/originals` e registra o resultado em `data/imports.json`.

## Deploy

O workflow da branch `main` utiliza os Secrets `VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_SSH_KEY` e `DEPLOY_PATH`. A aplicação fica vinculada somente a `127.0.0.1:3600`; o acesso público será configurado posteriormente por proxy reverso HTTPS.

## Próximas etapas

1. autenticação da API;
2. agente Windows e monitoramento de pastas locais;
3. upload resumível;
4. normalização LUFS/True Peak preservando o original;
5. análise de duração, Cue e Fade;
6. integração com Traffic e sincronização do Studio Air;
7. empacotamento do agente como `.exe`.
