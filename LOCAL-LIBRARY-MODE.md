# Modo de biblioteca local do PlayMaster Auto Import

O agente Windows agora prevê dois modos configuráveis:

- `remote-upload`: mantém o comportamento anterior, enviando os arquivos ao Auto Import remoto.
- `local-library`: monitora as pastas de entrada e copia os áudios para a biblioteca física no computador da emissora. Não exige URL, token de API, upload para VPS ou armazenamento central do arquivo de áudio.

## Configuração local

Use `agent/agent.config.example.json` como base. Defina `mode` como `local-library`, informe `libraryRoot` (por exemplo `C:\\PlayMaster\\Biblioteca`) e associe cada pasta de entrada a uma categoria. O agente copia para `<libraryRoot>/<categoria>/`, mantém o arquivo original na pasta de entrada e registra o estado em `stateFile`.

A cópia só acontece depois que o arquivo estabiliza em duas varreduras. Se o nome já existir com conteúdo diferente, o agente cria uma variante numerada; se o conteúdo for idêntico, registra como duplicado. A biblioteca de destino nunca é sobrescrita. Os formatos aceitos são MP3, WAV, FLAC, AAC, M4A e OGG.

Este modo prepara a biblioteca local. A ponte do Engine é um serviço separado e será integrada ao catálogo/reprodução em etapa própria; não considerar a integração ponta a ponta concluída apenas por ativar este modo.
