# Runtime local de voz

Binários e modelos são instalados manualmente e não entram no Git.

## Estrutura esperada

```text
local/
├── bin/
│   ├── whisper-cli.exe
│   ├── piper.exe
│   └── DLLs e espeak-ng-data dos pacotes
└── models/
    ├── ggml-base.bin
    ├── en_GB-northern_english_male-medium.onnx
    └── en_GB-northern_english_male-medium.onnx.json
```

## Instalação do whisper.cpp

Execute na raiz do projeto:

```powershell
$setup = Join-Path $env:TEMP "jarvis-local-voice"
New-Item -ItemType Directory -Force $setup | Out-Null
Invoke-WebRequest "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-bin-x64.zip" -OutFile "$setup\whisper.zip"
Expand-Archive "$setup\whisper.zip" "$setup\whisper" -Force
$whisperDir = Split-Path (Get-ChildItem "$setup\whisper" -Recurse -Filter whisper-cli.exe | Select-Object -First 1).FullName
Copy-Item "$whisperDir\*" "src-tauri\local\bin" -Recurse -Force
Invoke-WebRequest "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin?download=true" -OutFile "src-tauri\local\models\ggml-base.bin"
```

`ggml-base.bin` é multilíngue, suporta português e ocupa cerca de 142 MB.

## Instalação do Piper

```powershell
$setup = Join-Path $env:TEMP "jarvis-local-voice"
Invoke-WebRequest "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_windows_amd64.zip" -OutFile "$setup\piper.zip"
Expand-Archive "$setup\piper.zip" "$setup\piper" -Force
$piperDir = Split-Path (Get-ChildItem "$setup\piper" -Recurse -Filter piper.exe | Select-Object -First 1).FullName
Copy-Item "$piperDir\*" "src-tauri\local\bin" -Recurse -Force
Invoke-WebRequest "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx?download=true" -OutFile "src-tauri\local\models\en_GB-northern_english_male-medium.onnx"
Invoke-WebRequest "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx.json?download=true" -OutFile "src-tauri\local\models\en_GB-northern_english_male-medium.onnx.json"
```

A voz britânica masculina ocupa cerca de 63 MB. Para trocar a voz, coloque outro par `.onnx`/`.onnx.json` na pasta `models` e altere `PIPER_VOICE` no `.env`.

## Configuração

```dotenv
STT_PROVIDER=local
TTS_PROVIDER=local
WHISPER_MODEL=ggml-base.bin
PIPER_VOICE=en_GB-northern_english_male-medium.onnx
```

Reinicie `npm run tauri:dev` após instalar ou trocar modelos. Nada é baixado durante a inicialização.
