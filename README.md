# PlayMaster Auto Import

Serviço de recepção, identificação e preparação de arquivos de áudio do ecossistema PlayMaster.

## Modos de operação

O agente Windows possui dois modos. Para o fluxo local de áudio da emissora, use **\`local-library\`**: ele copia os arquivos das pastas de entrada para a biblioteca física do computador, sem enviar os áudios para a VPS. O modo anterior **\`remote-upload\`** continua disponível para instalações que desejem enviar arquivos ao servidor.

Consulte [LOCAL-LIBRARY-MODE.md](LOCAL-LIBRARY-MODE.md) para configuração, proteção contra duplicidade e comportamento da cópia. A ponte que permite ao Engine Web reproduzir a biblioteca local é um serviço separado no repositório PlayMaster Engine e ainda está em integração.

## Arquitetura do painel remoto

- **Auto Import Web:** cadastro, processamento e gestão da biblioteca remota já existente.
- **Agente local:** pode trabalhar em modo de cópia local, sem upload dos arquivos de áudio.
- **PlayMaster Engine:** usa uma ponte local separada para acessar a biblioteca do computador da emissora.

## Executar localmente

Requer Node.js 20 ou superior, FFmpeg e FFprobe. A imagem Docker já instala essas dependências.

\`\`\`bash
cp .env.example .env
npm start
\`\`\`

Abra \`http://localhost:3600\`.

Antes de iniciar, configure \`AUTO_IMPORT_ADMIN_PASSWORD\`, \`AUTO_IMPORT_API_TOKEN\` e \`AUTO_IMPORT_SESSION_SECRET\`. O usuário administrativo é definido por \`AUTO_IMPORT_ADMIN_USER\` e, se omitido, será \`admin\`.

O painel utiliza sessão segura por cookie. Integrações remotas devem enviar \`Authorization: Bearer SEU_TOKEN\` para acessar a API. Somente \`/api/health\` permanece público.

## Entrada e processamento remotos

O modo remoto continua recebendo arquivos em \`storage/inbox\`, preservando originais e processando cópias na biblioteca do servidor. O painel também permite importar arquivos, pastas e pacotes ZIP, com validação de formato e limites de extração.

## Agente local

A configuração de exemplo está em \`agent/agent.config.example.json\`. Para modo local, copie para \`agent/agent.config.json\`, informe \`mode: "local-library"\`, a pasta \`libraryRoot\` e as pastas de entrada/categorias. Não é necessário definir \`PLAYMASTER_API_TOKEN\` nesse modo.

Para o modo remoto, use \`mode: "remote-upload"\` e configure o token \`PLAYMASTER_API_TOKEN\`.

## Deploy

O workflow de deploy da branch principal permanece separado. A branch \`local-library-mode\` apenas valida o agente e não publica nada na VPS.
