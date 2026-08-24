use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{env, time::Duration};

const RESPONSES_URL: &str = "https://api.openai.com/v1/responses";
const TRANSCRIPTION_URL: &str = "https://api.openai.com/v1/audio/transcriptions";
const SPEECH_URL: &str = "https://api.openai.com/v1/audio/speech";
const DEFAULT_MODEL: &str = "gpt-5.6";
const DEFAULT_TRANSCRIPTION_MODEL: &str = "gpt-transcribe";
const DEFAULT_TTS_MODEL: &str = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE: &str = "onyx";
const MAX_AUDIO_BYTES: usize = 25 * 1024 * 1024;
const PERSONALITY: &str = r#"You are J.A.R.V.I.S., a sophisticated personal intelligence assistant. Be intelligent, calm, extremely competent, natural, and concise. Use occasional subtle dry humor, never emojis, and never sound like customer support. Do not begin with phrases such as 'Certainly! I would be happy to help.' Give short answers when sufficient and detail when requested. Clearly admit uncertainty and distinguish facts from hypotheses. You may occasionally address the user as 'sir' or 'senhor', but not routinely. Always respond in the same language as the user; use natural European-neutral Portuguese when addressed in Portuguese. You have no computer-control tools, persistent memory, live browsing, camera, email, or calendar access in this version. Never claim those capabilities."#;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatMessage { role: String, content: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenAiStatus { configured: bool, model: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AssistantResponse { content: String, model: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptionResponse { text: String, model: String }

#[derive(Deserialize)]
struct ApiResponse { output: Option<Vec<OutputItem>>, error: Option<ApiError> }
#[derive(Deserialize)]
struct OutputItem { content: Option<Vec<ContentItem>> }
#[derive(Deserialize)]
struct ContentItem { #[serde(rename = "type")] kind: String, text: Option<String> }
#[derive(Deserialize)]
struct ApiError { message: Option<String> }
#[derive(Deserialize)]
struct TranscriptionPayload { text: String }

fn load_environment() {
    let _ = dotenvy::dotenv();
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() { let _ = dotenvy::from_path(dir.join(".env")); }
    }
}

fn env_or(name: &str, default: &str) -> String {
    env::var(name).ok().filter(|value| !value.trim().is_empty()).unwrap_or_else(|| default.to_owned())
}

fn api_key() -> Result<String, String> {
    env::var("OPENAI_API_KEY").ok().filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "OPENAI CONNECTION REQUIRED — configure a sua API key para ativar o JARVIS.".to_owned())
}

fn http_client() -> Result<reqwest::Client, String> {
    let timeout = env::var("OPENAI_TIMEOUT_SECONDS").ok().and_then(|value| value.parse().ok()).unwrap_or(60_u64);
    reqwest::Client::builder().timeout(Duration::from_secs(timeout)).build()
        .map_err(|_| "Não foi possível inicializar a conexão segura.".to_owned())
}

fn network_error(error: reqwest::Error) -> String {
    if error.is_timeout() { "A ligação à OpenAI excedeu o tempo limite. Tente novamente.".to_owned() }
    else { "Não foi possível contactar a OpenAI. Verifique a ligação de rede.".to_owned() }
}

fn status_error(status: reqwest::StatusCode, api_message: Option<String>) -> String {
    match status.as_u16() {
        401 => "A API key da OpenAI é inválida ou não está autorizada.".to_owned(),
        429 => "O limite de pedidos da OpenAI foi atingido. Aguarde e tente novamente.".to_owned(),
        500..=599 => "O serviço da OpenAI está temporariamente indisponível.".to_owned(),
        _ => api_message.unwrap_or_else(|| "A OpenAI não conseguiu processar o pedido.".to_owned()),
    }
}

fn extension_for(mime_type: &str) -> &'static str {
    if mime_type.contains("mp4") { "m4a" }
    else if mime_type.contains("ogg") { "ogg" }
    else if mime_type.contains("wav") { "wav" }
    else { "webm" }
}

#[tauri::command]
fn get_openai_status() -> OpenAiStatus {
    load_environment();
    OpenAiStatus {
        configured: env::var("OPENAI_API_KEY").is_ok_and(|value| !value.trim().is_empty()),
        model: env_or("OPENAI_MODEL", DEFAULT_MODEL),
    }
}

#[tauri::command]
async fn ask_jarvis(messages: Vec<ChatMessage>) -> Result<AssistantResponse, String> {
    load_environment();
    let api_key = api_key()?;
    if messages.is_empty() || messages.iter().any(|message| message.content.trim().is_empty()) {
        return Err("A mensagem não pode estar vazia.".to_owned());
    }
    let model = env_or("OPENAI_MODEL", DEFAULT_MODEL);
    let input: Vec<_> = messages.into_iter().map(|message| json!({
        "role": message.role,
        "content": [{ "type": "input_text", "text": message.content }]
    })).collect();

    println!("[JARVIS] Sending request");
    let result = http_client()?.post(RESPONSES_URL).bearer_auth(api_key).json(&json!({
        "model": model, "instructions": PERSONALITY, "input": input,
        "store": false, "text": { "verbosity": "low" }
    })).send().await.map_err(network_error)?;
    let status = result.status();
    let payload: ApiResponse = result.json().await.map_err(|_| "A OpenAI devolveu uma resposta inválida.".to_owned())?;
    if !status.is_success() {
        return Err(status_error(status, payload.error.and_then(|error| error.message)));
    }
    let content = payload.output.unwrap_or_default().into_iter().flat_map(|item| item.content.unwrap_or_default())
        .filter(|item| item.kind == "output_text").filter_map(|item| item.text).collect::<Vec<_>>().join("\n");
    if content.trim().is_empty() { return Err("A OpenAI devolveu uma resposta vazia.".to_owned()); }
    println!("[JARVIS] Response received");
    Ok(AssistantResponse { content, model })
}

#[tauri::command]
async fn transcribe_audio(audio: Vec<u8>, mime_type: String) -> Result<TranscriptionResponse, String> {
    load_environment();
    if audio.len() < 512 { return Err("A gravação está vazia ou é demasiado curta.".to_owned()); }
    if audio.len() > MAX_AUDIO_BYTES { return Err("A gravação excede o limite permitido.".to_owned()); }
    let api_key = api_key()?;
    let model = env_or("OPENAI_TRANSCRIPTION_MODEL", DEFAULT_TRANSCRIPTION_MODEL);
    let filename = format!("recording.{}", extension_for(&mime_type));
    let part = reqwest::multipart::Part::bytes(audio).file_name(filename).mime_str(&mime_type)
        .map_err(|_| "O formato de áudio gravado não é suportado.".to_owned())?;
    let form = reqwest::multipart::Form::new().text("model", model.clone()).part("file", part);
    println!("[JARVIS] Transcribing recording");
    let result = http_client()?.post(TRANSCRIPTION_URL).bearer_auth(api_key).multipart(form).send().await.map_err(network_error)?;
    let status = result.status();
    let body = result.bytes().await.map_err(|_| "A transcrição devolveu uma resposta inválida.".to_owned())?;
    if !status.is_success() {
        let message = serde_json::from_slice::<serde_json::Value>(&body).ok()
            .and_then(|value| value.pointer("/error/message").and_then(|message| message.as_str()).map(str::to_owned));
        return Err(status_error(status, message));
    }
    let payload: TranscriptionPayload = serde_json::from_slice(&body).map_err(|_| "A transcrição devolveu uma resposta inválida.".to_owned())?;
    if payload.text.trim().is_empty() { return Err("Não foi possível detetar fala na gravação.".to_owned()); }
    println!("[JARVIS] Transcription received");
    Ok(TranscriptionResponse { text: payload.text, model })
}

#[tauri::command]
async fn synthesize_speech(text: String) -> Result<Vec<u8>, String> {
    load_environment();
    if text.trim().is_empty() { return Err("Não existe texto para sintetizar.".to_owned()); }
    let api_key = api_key()?;
    let model = env_or("OPENAI_TTS_MODEL", DEFAULT_TTS_MODEL);
    let voice = env_or("OPENAI_TTS_VOICE", DEFAULT_TTS_VOICE);
    println!("[JARVIS] Synthesizing speech");
    let result = http_client()?.post(SPEECH_URL).bearer_auth(api_key).json(&json!({
        "model": model,
        "voice": voice,
        "input": text,
        "instructions": "Speak calmly and clearly, with a sophisticated, restrained delivery and moderate pace. Avoid theatricality.",
        "response_format": "mp3"
    })).send().await.map_err(network_error)?;
    let status = result.status();
    let body = result.bytes().await.map_err(|_| "A síntese de voz devolveu áudio inválido.".to_owned())?;
    if !status.is_success() {
        let message = serde_json::from_slice::<serde_json::Value>(&body).ok()
            .and_then(|value| value.pointer("/error/message").and_then(|message| message.as_str()).map(str::to_owned));
        return Err(status_error(status, message));
    }
    if body.is_empty() { return Err("A síntese de voz devolveu áudio vazio.".to_owned()); }
    println!("[JARVIS] Speech received");
    Ok(body.to_vec())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_environment();
    println!("[JARVIS] Application started");
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_openai_status, ask_jarvis, transcribe_audio, synthesize_speech])
        .run(tauri::generate_context!())
        .expect("error while running JARVIS");
}