# PlayMaster Auto Import

Serviço de recepção, identificação e preparação de arquivos de áudio do ecossistema PlayMaster.

## Arquitetura inicial

- **Auto Import:** recebe e classifica os arquivos.
- **VPS:** mantém a Biblioteca Central, gera os IDs e preserva os originais.
- **PlayMaster Traffic:** utiliza os arquivos nos contratos, mapas, programação e jornalismo.
- **PlayMaster Studio Air:** sincroniza uma cópia local e executa os áudios mesmo se a internet cair.

## Executar localmente

Requer Node.js 20 ou superior, FFmpeg e FFprobe. A imagem Docker já instala essas dependências.

```bash
cp .env.example .env
npm start
```

Abra `http://localhost:3600`.

Antes de iniciar, configure `AUTO_IMPORT_ADMIN_PASSWORD`, `AUTO_IMPORT_API_TOKEN` e `AUTO_IMPORT_SESSION_SECRET`. O usuário administrativo é definido por `AUTO_IMPORT_ADMIN_USER` e, se omitido, será `admin`.

O painel utiliza sessão segura por cookie. Integrações, como o futuro agente Windows, devem enviar `Authorization: Bearer SEU_TOKEN` para acessar a API. Somente `/api/health` permanece público. No deploy, os segredos são transportados em Base64 para aceitar caracteres especiais sem expô-los ou quebrar o arquivo de ambiente.

## Entrada inicial de arquivos

Coloque arquivos `.mp3`, `.wav`, `.flac`, `.aac`, `.m4a` ou `.ogg` em `storage/inbox`. Uma subpasta pode representar a categoria, por exemplo `storage/inbox/Comerciais/anuncio.mp3`.

O serviço gera um ID sequencial, calcula SHA-256, preserva o original em `storage/originals`, processa a cópia em `storage/processed` e registra o resultado em `data/imports.json`.

As pastas de áudio disponíveis são: Músicas, Comerciais, Vinhetas, Intercons, Trilhas, Chamadas, Locução, Hora Certa, Temperatura e Outros. Jornalismo, Testemunhal e Rabicho pertencem aos seus próprios módulos e não são categorias desta biblioteca.

## Processamento de áudio

Cada arquivo válido passa por leitura de metadados e duração, análise de loudness e silêncio, cálculo de Cue In/Cue Out, conversão para MP3 320 kbps CBR em 44,1 kHz e normalização para -16 LUFS com pico máximo de -1 dBTP. O original nunca é sobrescrito. Os valores podem ser ajustados pelas variáveis `TARGET_LUFS`, `TRUE_PEAK_DB`, `SILENCE_THRESHOLD_DB` e `SILENCE_DURATION`.

O painel apresenta o estágio atual, formato de origem, duração, loudness, pico, Cue Points e um player autenticado da versão processada.

## Upload pelo agente

O endpoint `POST /api/uploads` recebe o conteúdo binário do áudio e exige `Authorization: Bearer SEU_TOKEN`. O nome do arquivo e a categoria são enviados em Base64 nos cabeçalhos `x-file-name-b64` e `x-category-b64`. O servidor valida o formato, limita o tamanho, calcula o SHA-256, evita duplicidades, preserva o original e devolve o ID definitivo.

Usuários autenticados podem importar um ou vários áudios, uma pasta completa com subpastas ou um pacote ZIP diretamente pelo painel web. A categoria é escolhida antes do envio e o progresso é mostrado por arquivo.

Pacotes ZIP são extraídos em área temporária, aceitam somente os formatos de áudio suportados e possuem limites de quantidade e tamanho descompactado. Caminhos absolutos ou tentativas de sair da pasta autorizada são bloqueados. Os limites são configurados por `MAX_ARCHIVE_FILES` e `MAX_EXTRACTED_BYTES`.

## Agente local

A base do agente está em `agent/`. Copie `agent/agent.config.example.json` para `agent/agent.config.json`, defina as pastas monitoradas e informe o token exclusivamente pela variável `PLAYMASTER_API_TOKEN`. O agente aguarda o arquivo terminar de ser gravado, mantém uma fila persistente, retoma envios interrompidos e aplica espera progressiva quando a internet estiver indisponível.

```bash
cd agent
PLAYMASTER_API_TOKEN="seu-token" npm start
```

O instalador e a execução como serviço do Windows serão preparados após a validação em uma máquina Windows.

## Deploy

O workflow da branch `main` utiliza os Secrets `VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_SSH_KEY`, `DEPLOY_PATH`, `AUTO_IMPORT_ADMIN_USER`, `AUTO_IMPORT_ADMIN_PASSWORD`, `AUTO_IMPORT_API_TOKEN` e `AUTO_IMPORT_SESSION_SECRET`. A aplicação fica vinculada somente a `127.0.0.1:3600` e deve ser publicada por proxy reverso HTTPS.

## Próximas etapas

1. editor de forma de onda para revisão de Intro, Segue e Cue Points;
2. agente Windows e monitoramento de pastas locais;
3. upload resumível;
4. integração com Traffic e sincronização do Studio Air;
5. empacotamento do agente como `.exe`.
