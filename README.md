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

O painel utiliza sessão segura por cookie. Integrações, como o futuro agente Windows, devem enviar `Authorization: Bearer SEU_TOKEN` para acessar a API. Somente `/api/health` permanece público; o endpoint meteorológico exige a mesma autenticação de leitura. No deploy, os segredos são transportados em Base64 para aceitar caracteres especiais sem expô-los ou quebrar o arquivo de ambiente.

## Entrada inicial de arquivos

Coloque arquivos `.mp3`, `.wav`, `.flac`, `.aac`, `.m4a` ou `.ogg` em `storage/inbox`. Uma subpasta pode representar a categoria, por exemplo `storage/inbox/Comerciais/anuncio.mp3`.

O serviço recebe o arquivo em `storage/inbox`, gera um ID sequencial, calcula SHA-256, preserva o original em `storage/originals` e processa uma cópia. O MP3 final é publicado na Biblioteca permanente em `storage/library/Categoria/Subcategoria`, enquanto os registros ficam em `data/imports.json`. Todos esses diretórios são volumes persistentes do VPS.

As categorias e subcategorias são cadastradas pelo painel e criadas fisicamente dentro de `storage/library`. A Biblioteca do VPS não depende do iCloud nem de um computador Windows ligado.

## Processamento de áudio

Cada arquivo válido passa por leitura de metadados e duração, análise de loudness e silêncio, cálculo de Cue In/Cue Out, conversão para MP3 320 kbps CBR em 44,1 kHz e normalização para -16 LUFS com pico máximo de -1 dBTP. O original nunca é sobrescrito. Os valores podem ser ajustados pelas variáveis `TARGET_LUFS`, `TRUE_PEAK_DB`, `SILENCE_THRESHOLD_DB` e `SILENCE_DURATION`.

O painel apresenta o estágio atual, formato de origem, duração, loudness, pico, Cue Points e um player autenticado da versão processada.

## Clima no PlayMaster Air

O endpoint autenticado `GET /api/weather` consulta as condições atuais e máxima/mínima do dia via WeatherAPI.com, com cache de 15 minutos. A localização padrão é Jundiaí/SP e pode ser ajustada por `WEATHER_LOCATION` (latitude,longitude). Para ativar, cadastre `WEATHERAPI_KEY` como GitHub Actions Secret neste repositório. A chave é injetada no ambiente do servidor durante o deploy e nunca é enviada ao navegador.

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

## Preparação de hospedagem externa (Cloudflare + Render)

A branch `cloudflare-backend-render` contém um Blueprint `render.yaml` para preparar
o Auto Import como serviço Docker no Render, mantendo a biblioteca e os arquivos em
um disco persistente. Essa configuração é separada do deploy atual da VPS.

### Recursos definidos no Blueprint

- Runtime Docker com a imagem deste repositório e FFmpeg do Dockerfile.
- Região Ohio e plano `1c-2g` (plano pago).
- Disco persistente inicial de 10 GB montado em `/app/persistent`.
- Dados, originais, processados, biblioteca, temporários e inbox direcionados ao disco.
- Health check em `/api/health`.
- Senhas e tokens gerados pelo Render, sem valores secretos versionados.
- Deploy automático desativado (`autoDeployTrigger: off`) para impedir publicação
  acidental durante a preparação.

O disco persistente do Render exige serviço pago. O tamanho inicial de 10 GB pode ser
aumentado depois, mas não reduzido. Antes de criar o serviço, confira os preços e
dimensione o espaço para a biblioteca de áudio real.

### Criar o serviço quando autorizado

1. No Render, escolha **New > Blueprint** e conecte este repositório.
2. Selecione a branch `cloudflare-backend-render` e confira o arquivo `render.yaml`.
3. Revise o plano, região, custo e disco antes de confirmar a criação.
4. Guarde com segurança a senha administrativa e os segredos gerados pelo Render.
5. Mantenha o endereço `onrender.com` como origem técnica; não altere DNS do domínio
   principal nesta etapa.
6. Após o primeiro deploy, testar `/api/health`, login, biblioteca, upload, processamento
   FFmpeg, streaming com HTTP Range e persistência após reinício.
7. Somente após os testes, configurar o hostname HTTPS do serviço como
   `AIR_API_ORIGIN` no Worker do PlayMaster Air.

### Segurança e limites

- O serviço web Render tem endereço público. As rotas da API exigem sessão ou token,
  exceto o health check; não compartilhar a URL como se fosse um painel administrativo.
- O Worker Cloudflare encaminhará as requisições same-origin, mas o hostname direto do
  Render continuará acessível. A autenticação do backend permanece obrigatória.
- O Blueprint não cria nem altera serviços por si só. É apenas infraestrutura declarativa
  no GitHub; a criação e cobrança só começam quando o Blueprint for aplicado no Render.
- O workflow `.github/workflows/render-validate.yml` executa verificações e testes, mas
  não publica nem acessa VPS.
- O workflow de produção antigo em `.github/workflows/deploy.yml` permanece intocado.

### Atenção: limite de upload no caminho Cloudflare

O Auto Import aceita até 1 GB por arquivo pela configuração atual. Porém, quando o
upload passa pelo domínio proxied/Worker do Cloudflare, o limite máximo do corpo da
requisição depende do plano da zona: Free/Pro 100 MB, Business 200 MB e Enterprise
até 5 GB (sujeito à configuração da conta). Portanto, o limite de 1 GB do backend não
significa que uploads de 1 GB funcionarão pelo Worker.

#### Caminho recomendado para upload grande

A primeira opção a implementar será o envio direto do navegador para o endereço HTTPS
próprio do serviço Render, sem atravessar o Worker Cloudflare. Isso evita adicionar
object storage ou custo de R2 nesta etapa e preserva o progresso de envio já exibido
pelo painel.

O fluxo deverá ser:

1. O navegador solicita ao backend, pela rota same-origin do Air, uma autorização de
   upload vinculada à sessão administrativa.
2. O backend emite um ticket assinado, de uso único, com validade curta e vinculado ao
   nome, categoria, subcategoria, tamanho máximo e tipo de envio (áudio ou ZIP).
3. O navegador envia o arquivo por HTTPS diretamente ao hostname `.onrender.com`,
   usando o ticket temporário. O corpo não passa pelo Worker nem pelo proxy do domínio.
4. O backend valida ticket, validade, uso único, origem permitida, metadados e tamanho;
   então transmite o corpo para os handlers existentes `receiveUpload` ou
   `receiveArchive`, sem carregar o arquivo inteiro na memória.
5. O backend invalida o ticket e retorna o mesmo resultado funcional esperado pelo
   painel. A interface mantém a barra de progresso do XMLHttpRequest.

Requisitos de segurança obrigatórios:

- Nunca enviar `AUTO_IMPORT_API_TOKEN` nem a senha administrativa ao navegador.
- Não aceitar tickets reutilizados, expirados ou emitidos para outro arquivo/categoria.
- Permitir CORS somente para a origem HTTPS final do PlayMaster Air, com preflight
  explícito para os métodos e cabeçalhos necessários.
- Rejeitar origens não autorizadas e validar o tamanho real durante o streaming,
  mesmo quando o navegador informa um tamanho declarado.
- Não publicar nem habilitar esse fluxo antes de testar autenticação, cancelamento,
  falha de rede, ZIP, duplicidade e persistência.

A documentação pública consultada do Render não estabelece, nas páginas analisadas,
um limite máximo de corpo que possamos assumir como garantido. Portanto, após criar o
serviço, será necessário testar uploads progressivos (incluindo acima de 100 MB) no
hostname Render direto e confirmar o limite operacional antes de prometer 1 GB.

Se o Render não suportar o tamanho necessário ou se for exigida retomada após
interrupção, a segunda etapa será upload multipart/resumível para object storage,
seguido de confirmação e processamento no backend.

Não reduzir silenciosamente o limite de upload do produto. O limite configurado de
1 GB só poderá ser anunciado depois de validado no caminho real de produção.
