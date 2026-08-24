# J.A.R.V.I.S.

Aplicativo desktop Windows para conversação com a OpenAI, construído com Tauri 2, React, TypeScript, Vite e Tailwind CSS. A interface é original e usa SVG/CSS para o núcleo animado — não contém assets, voz ou elementos dos filmes.

## Funcionalidades atuais

- Conversa via Responses API da OpenAI e histórico durante a sessão
- Personalidade permanente, objetiva e multilíngue
- Estados visuais `idle`, `thinking`, `speaking` e `error`
- Core SVG animado, relógio, telemetria e painel de módulos honesto
- Enter para enviar, Shift+Enter para nova linha e revelação progressiva da resposta
- Erros de configuração, autenticação, rede, timeout, rate limit e resposta vazia tratados
- API key lida e utilizada somente pelo backend Rust; não entra no bundle JavaScript
- Módulo de voz explicitamente desativado

## Requisitos (Windows)

1. Node.js 20 ou superior e npm
2. Rust estável com Cargo (via `rustup`)
3. Microsoft C++ Build Tools com a carga “Desktop development with C++”
4. WebView2 Runtime (normalmente já incluído no Windows 10/11)
5. Uma API key de um projeto OpenAI com faturação/créditos configurados

Consulte os [pré-requisitos oficiais do Tauri](https://v2.tauri.app/start/prerequisites/) para detalhes do toolchain Windows.

## Instalação

```powershell
npm install
Copy-Item .env.example .env
```

Edite `.env` na raiz:

```dotenv
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-5.6
OPENAI_TIMEOUT_SECONDS=60
OPENAI_TRANSCRIPTION_MODEL=gpt-transcribe
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=onyx
```

Nunca use o prefixo `VITE_` na API key. Variáveis com esse prefixo são expostas ao frontend pelo Vite. O arquivo `.env` já está ignorado pelo Git.

## Desenvolvimento

Para a interface desktop funcional:

```powershell
npm run tauri:dev
```

`npm run dev` abre apenas o frontend no browser. Nesse modo, chamadas à IA ficam desativadas intencionalmente, pois a proteção da chave depende do backend Tauri.

Validação do frontend:

```powershell
npm run build
```

## Gerar o executável Windows

```powershell
npm run tauri:build
```

Os instaladores serão gerados em `src-tauri/target/release/bundle`. Para uma instalação distribuída, configure `OPENAI_API_KEY` no ambiente do processo ou coloque um `.env` ao lado do executável. Embutir uma chave pessoal num instalador distribuído não é seguro; em produção, use um serviço intermediário com autenticação por utilizador.

## Arquitetura

```text
React UI
  └─ src/services/openai.ts (IPC invoke, sem segredo)
       └─ comando Tauri em src-tauri/src/lib.rs
            └─ HTTPS Responses API da OpenAI
```

- `src/components/`: apresentação e interação desacopladas
- `src/types/`: contratos de mensagens, estados e módulos futuros
- `src/config/`: configuração visível da experiência
- `src/services/`: fronteira IPC substituível por streaming via eventos
- `src-tauri/`: configuração nativa, personalidade autoritativa, segredo e cliente HTTP

O histórico é enviado em cada pedido e não é persistido. A propriedade `store: false` pede à API que não armazene a resposta para recuperação posterior.

## Funcionalidades planeadas

- Voz real: captura de microfone, speech-to-text, text-to-speech e wake word
- Ferramentas Windows com permissões explícitas e confirmação
- Integração Codex para projetos e testes
- Memória persistente controlável
- Visão por screenshots com consentimento

Nenhuma dessas capacidades é simulada nesta versão.

## Próximo passo: voz

Introduzir um `VoiceService` no backend e eventos Tauri para áudio/estado. Comece com push-to-talk e permissões explícitas; conecte transcription e TTS somente depois. O estado `listening` já existe no contrato e o componente `JarvisCore` já o suporta, sem o utilizar prematuramente.

## Segurança

O frontend nunca faz `fetch` à OpenAI. A Content Security Policy também impede conexões web arbitrárias no WebView. Logs não incluem chaves, tokens nem corpos completos dos pedidos.

## Voz push-to-talk (V2)

Clique no microfone para iniciar e clique novamente para concluir. O WebView solicita a permissão do microfone ao Windows; o áudio permanece em memória, é enviado ao backend Tauri para transcrição e é descartado após o pedido. A resposta usa TTS pelo mesmo backend. Durante a reprodução, o botão permite interromper a fala.

Os modelos e a voz podem ser alterados no `.env`. A captura usa `MediaRecorder`, mantendo a camada de browser reutilizável numa futura PWA; apenas as chamadas autenticadas estão isoladas no serviço IPC/Tauri.
## Providers V2.1

A configuração padrão usa Gemini para chat e Web Speech API para reconhecimento e síntese, sem chamadas à OpenAI:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=sua-chave-do-google-ai-studio
GEMINI_MODEL=gemini-3.1-flash-lite
STT_PROVIDER=browser
TTS_PROVIDER=browser
```

Para usar OpenAI no chat, altere `AI_PROVIDER=openai` e configure `OPENAI_API_KEY`. STT e TTS podem ser trocados de forma independente com `STT_PROVIDER=openai` e `TTS_PROVIDER=openai`. A UI consome a interface `AIProvider`; no desktop, sua implementação chama comandos Tauri. Uma futura implementação web deverá chamar um backend Vercel, nunca expor `GEMINI_API_KEY` como variável `VITE_`.

O reconhecimento browser começa somente ao clicar no microfone, usa inicialmente `pt-PT` e termina após a fala ou no segundo clique. Quando `SpeechRecognition`/`webkitSpeechRecognition` não existe, o painel mostra `VOICE LIMITED` e o chat digitado continua disponível. O TTS seleciona por pontuação uma voz local, priorizando inglês britânico masculino, depois português e finalmente a voz padrão do sistema.
## Web/PWA na Vercel

O projeto possui dois alvos sem expor chaves no navegador:

```text
Desktop: React → IPC Tauri → Gemini / Whisper local / Piper local
Web:     React → /api/chat → Gemini + Web Speech STT/TTS
```

`src/services/runtime.ts` detecta uma única vez a presença do runtime Tauri. `src/services/ai.ts` seleciona o provider Desktop ou Web; os componentes não acessam secrets.

### Desenvolvimento Web completo

A UI isolada abre com `npm run dev`. Para executar também `/api/chat`:

```powershell
npx vercel login
npm run dev:web
```

A CLI vincula o diretório a um projeto Vercel na primeira execução.

### Deploy pela branch main

1. Envie o projeto ao GitHub:

```powershell
git add .
git commit -m "Add JARVIS Web"
git push origin main
```

2. Na Vercel, escolha **Add New → Project**, importe o repositório e mantenha:
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Output directory: `dist`
3. Em **Settings → Environment Variables**, adicione somente:

```dotenv
GEMINI_API_KEY=sua-chave-do-Google-AI-Studio
GEMINI_MODEL=gemini-3.1-flash-lite
```

4. Aplique as variáveis a Production e Preview e execute **Deploy**.

As variáveis Desktop não precisam ser cadastradas na Vercel. Nunca crie `VITE_GEMINI_API_KEY`.

### Segurança da demo

`/api/chat` limita o corpo a 32 KB, 12 mensagens, 2.000 caracteres por mensagem, 12.000 caracteres totais, timeout de 20 segundos e 10 pedidos por IP por minuto em cada instância quente. Erros são sanitizados. O limite em memória é adequado para demo pequena, mas não é global entre instâncias serverless; para divulgação ampla, habilite Vercel Firewall ou armazenamento distribuído.

### Compatibilidade de voz Web

O STT usa `SpeechRecognition`/`webkitSpeechRecognition` com `pt-BR`. Sem suporte, o painel mostra `VOICE LIMITED` e o chat digitado continua ativo. O TTS prioriza voz masculina pt-BR, depois qualquer pt-BR, pt-PT e a voz padrão. Safari/iOS pode ter reconhecimento limitado conforme versão e região; áudio é desbloqueado após interação do usuário.

A PWA inclui manifest, ícones 192/512, metadados Apple, safe areas e service worker mínimo sem cache offline complexo.
