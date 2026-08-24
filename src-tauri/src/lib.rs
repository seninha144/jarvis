mod local_voice;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{env, path::PathBuf, time::Duration};
use tauri::Manager;

const OPENAI_RESPONSES_URL: &str = "https://api.openai.com/v1/responses";
const OPENAI_TRANSCRIPTION_URL: &str = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_SPEECH_URL: &str = "https://api.openai.com/v1/audio/speech";
const GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_OPENAI_MODEL: &str = "gpt-5.6";
const DEFAULT_GEMINI_MODEL: &str = "gemini-3.1-flash-lite";
const DEFAULT_TRANSCRIPTION_MODEL: &str = "gpt-transcribe";
const DEFAULT_TTS_MODEL: &str = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE: &str = "onyx";
const MAX_AUDIO_BYTES: usize = 25 * 1024 * 1024;
const PERSONALITY: &str = include_str!("../../shared/personality.txt");

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatMessage { role: String, content: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AiStatus { configured: bool, provider: String, model: String, stt_provider: String, tts_provider: String, stt_configured: bool, tts_configured: bool }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AssistantResponse { content: String, model: String, provider: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptionResponse { text: String, model: String }

#[derive(Deserialize)]
struct OpenAiResponse { output: Option<Vec<OpenAiOutputItem>>, error: Option<ApiError> }
#[derive(Deserialize)]
struct OpenAiOutputItem { content: Option<Vec<OpenAiContentItem>> }
#[derive(Deserialize)]
struct OpenAiContentItem { #[serde(rename = "type")] kind: String, text: Option<String> }
#[derive(Deserialize)]
struct ApiError { message: Option<String> }
#[derive(Deserialize)]
struct TranscriptionPayload { text: String }
#[derive(Deserialize)]
struct GeminiResponse { candidates: Option<Vec<GeminiCandidate>>, error: Option<GeminiApiError> }
#[derive(Deserialize)]
struct GeminiCandidate { content: Option<GeminiContent> }
#[derive(Deserialize)]
struct GeminiContent { parts: Option<Vec<GeminiPart>> }
#[derive(Deserialize)]
struct GeminiPart { text: Option<String> }
#[derive(Deserialize)]
struct GeminiApiError { message: Option<String> }

fn load_environment() {
    let manifest_env = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().map(|path| path.join(".env"));
    if let Some(path) = manifest_env { let _ = dotenvy::from_path(path); }
    let _ = dotenvy::dotenv();
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() { let _ = dotenvy::from_path(dir.join(".env")); }
    }
}

fn env_or(name: &str, default: &str) -> String {
    env::var(name).ok().filter(|value| !value.trim().is_empty()).unwrap_or_else(|| default.to_owned())
}

fn ai_provider() -> String { env_or("AI_PROVIDER", "gemini").to_lowercase() }

fn provider_key(provider: &str) -> Result<String, String> {
    let (name, label) = if provider == "gemini" { ("GEMINI_API_KEY", "Gemini") } else { ("OPENAI_API_KEY", "OpenAI") };
    env::var(name).ok().filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("{} CONNECTION REQUIRED — configure a API key para ativar o JARVIS.", label.to_uppercase()))
}

fn http_client() -> Result<reqwest::Client, String> {
    let timeout = env::var("AI_TIMEOUT_SECONDS").or_else(|_| env::var("OPENAI_TIMEOUT_SECONDS")).ok()
        .and_then(|value| value.parse().ok()).unwrap_or(60_u64);
    reqwest::Client::builder().timeout(Duration::from_secs(timeout)).build()
        .map_err(|_| "Não foi possível inicializar a conexão segura.".to_owned())
}

fn network_error(error: reqwest::Error) -> String {
    if error.is_timeout() { "A ligação ao provider excedeu o tempo limite. Tente novamente.".to_owned() }
    else { "Não foi possível contactar o provider de IA. Verifique a ligação de rede.".to_owned() }
}

fn status_error(status: reqwest::StatusCode, api_message: Option<String>) -> String {
    match status.as_u16() {
        400 => api_message.unwrap_or_else(|| "O provider rejeitou o pedido.".to_owned()),
        401 | 403 => "A API key é inválida ou não está autorizada.".to_owned(),
        429 => "O limite de pedidos do provider foi atingido. Aguarde e tente novamente.".to_owned(),
        500..=599 => "O serviço de IA está temporariamente indisponível.".to_owned(),
        _ => api_message.unwrap_or_else(|| "O provider não conseguiu processar o pedido.".to_owned()),
    }
}

fn validate_messages(messages: &[ChatMessage]) -> Result<(), String> {
    if messages.is_empty() || messages.iter().any(|message| message.content.trim().is_empty()) {
        Err("A mensagem não pode estar vazia.".to_owned())
    } else if messages.iter().any(|message| message.role != "user" && message.role != "assistant") {
        Err("O histórico contém uma função de mensagem inválida.".to_owned())
    } else { Ok(()) }
}

#[tauri::command]
fn get_ai_status(app: tauri::AppHandle) -> AiStatus {
    load_environment();
    let provider = ai_provider();
    let (key_name, model) = if provider == "openai" {
        ("OPENAI_API_KEY", env_or("OPENAI_MODEL", DEFAULT_OPENAI_MODEL))
    } else {
        ("GEMINI_API_KEY", env_or("GEMINI_MODEL", DEFAULT_GEMINI_MODEL))
    };
    let stt_provider = env_or("STT_PROVIDER", "local").to_lowercase();
    let tts_provider = env_or("TTS_PROVIDER", "local").to_lowercase();
    println!("[JARVIS VOICE] STT provider: {stt_provider}");
    println!("[JARVIS VOICE] TTS provider: {tts_provider}");
    let openai_configured = env::var("OPENAI_API_KEY").is_ok_and(|value| !value.trim().is_empty());
    let resource_dir = app.path().resource_dir().ok();
    let local_status = local_voice::status(resource_dir.as_deref());
    AiStatus {
        configured: env::var(key_name).is_ok_and(|value| !value.trim().is_empty()),
        provider,
        model,
        stt_configured: match stt_provider.as_str() { "local" => local_status.stt_ready, "browser" => true, "openai" => openai_configured, _ => false },
        tts_configured: match tts_provider.as_str() { "local" => local_status.tts_ready, "browser" => true, "openai" => openai_configured, _ => false },
        stt_provider,
        tts_provider,
    }
}

#[tauri::command]
async fn send_message(messages: Vec<ChatMessage>) -> Result<AssistantResponse, String> {
    load_environment();
    validate_messages(&messages)?;
    match ai_provider().as_str() {
        "gemini" => send_gemini(messages).await,
        "openai" => send_openai(messages).await,
        "local" => Err("O provider local ainda não está instalado.".to_owned()),
        _ => Err("AI_PROVIDER inválido. Use gemini, openai ou local.".to_owned()),
    }
}

async fn send_gemini(messages: Vec<ChatMessage>) -> Result<AssistantResponse, String> {
    let api_key = provider_key("gemini")?;
    let model = env_or("GEMINI_MODEL", DEFAULT_GEMINI_MODEL);
    if !model.chars().all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')) {
        return Err("GEMINI_MODEL contém caracteres inválidos.".to_owned());
    }
    let contents: Vec<_> = messages.into_iter().map(|message| json!({
        "role": if message.role == "assistant" { "model" } else { "user" },
        "parts": [{ "text": message.content }]
    })).collect();
    let url = format!("{}/{}:generateContent", GEMINI_BASE_URL, model);
    println!("[JARVIS] Sending request via Gemini");
    let result = http_client()?.post(url).header("x-goog-api-key", api_key).json(&json!({
        "systemInstruction": { "parts": [{ "text": PERSONALITY }] },
        "contents": contents,
        "generationConfig": { "maxOutputTokens": 1200 }
    })).send().await.map_err(network_error)?;
    let status = result.status();
    let payload: GeminiResponse = result.json().await.map_err(|_| "O Gemini devolveu uma resposta inválida.".to_owned())?;
    if !status.is_success() { return Err(status_error(status, payload.error.and_then(|error| error.message))); }
    let content = payload.candidates.unwrap_or_default().into_iter().flat_map(|candidate| candidate.content)
        .flat_map(|content| content.parts.unwrap_or_default()).filter_map(|part| part.text).collect::<Vec<_>>().join("\n");
    if content.trim().is_empty() { return Err("O Gemini devolveu uma resposta vazia.".to_owned()); }
    println!("[JARVIS] Response received via Gemini");
    Ok(AssistantResponse { content, model, provider: "gemini".to_owned() })
}

async fn send_openai(messages: Vec<ChatMessage>) -> Result<AssistantResponse, String> {
    let api_key = provider_key("openai")?;
    let model = env_or("OPENAI_MODEL", DEFAULT_OPENAI_MODEL);
    let input: Vec<_> = messages.into_iter().map(|message| json!({
        "role": message.role, "content": [{ "type": "input_text", "text": message.content }]
    })).collect();
    println!("[JARVIS] Sending request via OpenAI");
    let result = http_client()?.post(OPENAI_RESPONSES_URL).bearer_auth(api_key).json(&json!({
        "model": model, "instructions": PERSONALITY, "input": input, "store": false, "text": { "verbosity": "low" }
    })).send().await.map_err(network_error)?;
    let status = result.status();
    let payload: OpenAiResponse = result.json().await.map_err(|_| "A OpenAI devolveu uma resposta inválida.".to_owned())?;
    if !status.is_success() { return Err(status_error(status, payload.error.and_then(|error| error.message))); }
    let content = payload.output.unwrap_or_default().into_iter().flat_map(|item| item.content.unwrap_or_default())
        .filter(|item| item.kind == "output_text").filter_map(|item| item.text).collect::<Vec<_>>().join("\n");
    if content.trim().is_empty() { return Err("A OpenAI devolveu uma resposta vazia.".to_owned()); }
    println!("[JARVIS] Response received via OpenAI");
    Ok(AssistantResponse { content, model, provider: "openai".to_owned() })
}

fn extension_for(mime_type: &str) -> &'static str {
    if mime_type.contains("mp4") { "m4a" } else if mime_type.contains("ogg") { "ogg" }
    else if mime_type.contains("wav") { "wav" } else { "webm" }
}

#[tauri::command]
async fn transcribe_audio(audio: Vec<u8>, mime_type: String) -> Result<TranscriptionResponse, String> {
    load_environment();
    if env_or("STT_PROVIDER", "browser").to_lowercase() != "openai" { return Err("O provider STT ativo é o browser.".to_owned()); }
    if audio.len() < 512 { return Err("A gravação está vazia ou é demasiado curta.".to_owned()); }
    if audio.len() > MAX_AUDIO_BYTES { return Err("A gravação excede o limite permitido.".to_owned()); }
    let api_key = provider_key("openai")?;
    let model = env_or("OPENAI_TRANSCRIPTION_MODEL", DEFAULT_TRANSCRIPTION_MODEL);
    let filename = format!("recording.{}", extension_for(&mime_type));
    let part = reqwest::multipart::Part::bytes(audio).file_name(filename).mime_str(&mime_type)
        .map_err(|_| "O formato de áudio gravado não é suportado.".to_owned())?;
    let form = reqwest::multipart::Form::new().text("model", model.clone()).part("file", part);
    println!("[JARVIS] Transcribing via OpenAI");
    let result = http_client()?.post(OPENAI_TRANSCRIPTION_URL).bearer_auth(api_key).multipart(form).send().await.map_err(network_error)?;
    let status = result.status();
    let body = result.bytes().await.map_err(|_| "A transcrição devolveu uma resposta inválida.".to_owned())?;
    if !status.is_success() {
        let message = serde_json::from_slice::<serde_json::Value>(&body).ok().and_then(|value| value.pointer("/error/message").and_then(|message| message.as_str()).map(str::to_owned));
        return Err(status_error(status, message));
    }
    let payload: TranscriptionPayload = serde_json::from_slice(&body).map_err(|_| "A transcrição devolveu uma resposta inválida.".to_owned())?;
    if payload.text.trim().is_empty() { return Err("Não foi possível detetar fala na gravação.".to_owned()); }
    Ok(TranscriptionResponse { text: payload.text, model })
}

#[tauri::command]
async fn synthesize_speech(text: String) -> Result<Vec<u8>, String> {
    load_environment();
    if env_or("TTS_PROVIDER", "browser").to_lowercase() != "openai" { return Err("O provider TTS ativo é o browser.".to_owned()); }
    if text.trim().is_empty() { return Err("Não existe texto para sintetizar.".to_owned()); }
    let api_key = provider_key("openai")?;
    let model = env_or("OPENAI_TTS_MODEL", DEFAULT_TTS_MODEL);
    let voice = env_or("OPENAI_TTS_VOICE", DEFAULT_TTS_VOICE);
    let result = http_client()?.post(OPENAI_SPEECH_URL).bearer_auth(api_key).json(&json!({
        "model": model, "voice": voice, "input": text,
        "instructions": "Speak calmly and clearly, with a sophisticated, restrained delivery and moderate pace.",
        "response_format": "mp3"
    })).send().await.map_err(network_error)?;
    let status = result.status();
    let body = result.bytes().await.map_err(|_| "A síntese de voz devolveu áudio inválido.".to_owned())?;
    if !status.is_success() {
        let message = serde_json::from_slice::<serde_json::Value>(&body).ok().and_then(|value| value.pointer("/error/message").and_then(|message| message.as_str()).map(str::to_owned));
        return Err(status_error(status, message));
    }
    if body.is_empty() { return Err("A síntese de voz devolveu áudio vazio.".to_owned()); }
    Ok(body.to_vec())
}

#[tauri::command]
async fn transcribe_local(app: tauri::AppHandle, audio: Vec<u8>) -> Result<String, String> {
    let resource_dir = app.path().resource_dir().ok();
    tauri::async_runtime::spawn_blocking(move || local_voice::transcribe(audio, resource_dir)).await
        .map_err(|_| "O processo local de reconhecimento terminou inesperadamente.".to_owned())?
}

#[tauri::command]
async fn synthesize_local_speech(app: tauri::AppHandle, text: String) -> Result<Vec<u8>, String> {
    let resource_dir = app.path().resource_dir().ok();
    tauri::async_runtime::spawn_blocking(move || local_voice::synthesize(text, resource_dir)).await
        .map_err(|_| "O processo local de TTS terminou inesperadamente.".to_owned())?
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_environment();
    println!("[JARVIS] Application started");
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_ai_status, send_message, transcribe_audio, synthesize_speech, transcribe_local, synthesize_local_speech])
        .run(tauri::generate_context!()).expect("error while running JARVIS");
}