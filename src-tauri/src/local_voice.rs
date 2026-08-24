use std::{env, fs, io::Write, path::{Component, Path, PathBuf}, process::{Command, Stdio}, time::{Duration, SystemTime, UNIX_EPOCH}};
use wait_timeout::ChildExt;

const PROCESS_TIMEOUT: Duration = Duration::from_secs(120);
pub struct LocalVoiceStatus { pub stt_ready: bool, pub tts_ready: bool }
struct Paths { whisper_bin: PathBuf, whisper_model: PathBuf, piper_bin: PathBuf, piper_model: PathBuf, piper_config: PathBuf, piper_data: PathBuf }
struct TempFiles(Vec<PathBuf>);
impl Drop for TempFiles { fn drop(&mut self) { for path in &self.0 { let _ = fs::remove_file(path); } } }

fn safe_filename<'a>(value: &'a str, expected_extension: &str) -> Result<&'a str, String> {
    let path = Path::new(value);
    if path.components().count() != 1 || !matches!(path.components().next(), Some(Component::Normal(_))) || path.extension().and_then(|ext| ext.to_str()) != Some(expected_extension) {
        return Err("A configuração do modelo local contém um nome de ficheiro inválido.".to_owned());
    }
    Ok(value)
}
fn runtime_dir(resource_dir: Option<&Path>) -> PathBuf {
    if let Ok(configured) = env::var("JARVIS_LOCAL_RUNTIME_DIR") { if !configured.trim().is_empty() { return PathBuf::from(configured); } }
    if cfg!(debug_assertions) { return PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("local"); }
    if let Some(resources) = resource_dir { return resources.join("local"); }
    env::current_exe().ok().and_then(|path| path.parent().map(|parent| parent.join("local"))).unwrap_or_else(|| PathBuf::from("local"))
}
fn paths(resource_dir: Option<&Path>) -> Result<Paths, String> {
    let base = runtime_dir(resource_dir);
    let whisper_name = env::var("WHISPER_MODEL").unwrap_or_else(|_| "ggml-base.bin".to_owned());
    let voice_name = env::var("PIPER_VOICE").unwrap_or_else(|_| "en_GB-northern_english_male-medium.onnx".to_owned());
    let whisper_model = safe_filename(&whisper_name, "bin")?;
    let piper_voice = safe_filename(&voice_name, "onnx")?;
    Ok(Paths { whisper_bin: base.join("bin/whisper-cli.exe"), whisper_model: base.join("models").join(whisper_model), piper_bin: base.join("bin/piper.exe"), piper_model: base.join("models").join(piper_voice), piper_config: base.join("models").join(format!("{}.json", piper_voice)), piper_data: base.join("bin").join("espeak-ng-data") })
}
pub fn status(resource_dir: Option<&Path>) -> LocalVoiceStatus {
    match paths(resource_dir) {
        Ok(p) => {
            println!("[JARVIS VOICE] whisper path: {}", p.whisper_bin.display());
            println!("[JARVIS VOICE] whisper exists: {}", p.whisper_bin.is_file());
            println!("[JARVIS VOICE] whisper model path: {}", p.whisper_model.display());
            println!("[JARVIS VOICE] whisper model exists: {}", p.whisper_model.is_file());
            println!("[JARVIS VOICE] piper path: {}", p.piper_bin.display());
            println!("[JARVIS VOICE] piper exists: {}", p.piper_bin.is_file());
            println!("[JARVIS VOICE] voice path: {}", p.piper_model.display());
            println!("[JARVIS VOICE] voice exists: {}", p.piper_model.is_file());
            println!("[JARVIS VOICE] voice json exists: {}", p.piper_config.is_file());
            println!("[JARVIS VOICE] espeak data exists: {}", p.piper_data.is_dir());
            LocalVoiceStatus { stt_ready: p.whisper_bin.is_file() && p.whisper_model.is_file(), tts_ready: p.piper_bin.is_file() && p.piper_model.is_file() && p.piper_config.is_file() && p.piper_data.is_dir() }
        }
        Err(error) => {
            eprintln!("[JARVIS VOICE] invalid local voice configuration: {error}");
            LocalVoiceStatus { stt_ready: false, tts_ready: false }
        }
    }
}
fn temp_stem(label: &str) -> PathBuf { let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos(); env::temp_dir().join(format!("jarvis-{}-{}-{}", label, std::process::id(), nonce)) }
fn wait_for(mut child: std::process::Child, label: &str) -> Result<(), String> {
    match child.wait_timeout(PROCESS_TIMEOUT).map_err(|_| format!("Não foi possível aguardar o {} local.", label))? {
        Some(status) if status.success() => Ok(()), Some(_) => Err(format!("O {} local terminou com erro. Verifique os binários e modelos.", label)),
        None => { let _ = child.kill(); let _ = child.wait(); Err(format!("O {} local excedeu o tempo limite.", label)) }
    }
}
#[cfg(windows)] fn hide_window(command: &mut Command) { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
#[cfg(not(windows))] fn hide_window(_: &mut Command) {}

pub fn transcribe(wav: Vec<u8>, resource_dir: Option<PathBuf>) -> Result<String, String> {
    if wav.len() < 1_000 { return Err("A gravação local está vazia ou é demasiado curta.".to_owned()); }
    let p = paths(resource_dir.as_deref())?;
    if !p.whisper_bin.is_file() { return Err("whisper-cli.exe não foi encontrado em src-tauri/local/bin.".to_owned()); }
    if !p.whisper_model.is_file() { return Err("O modelo Whisper local não foi encontrado em src-tauri/local/models.".to_owned()); }
    let stem = temp_stem("stt"); let wav_path = stem.with_extension("wav"); let output_stem = stem.with_extension("transcript"); let output_txt = PathBuf::from(format!("{}.txt", output_stem.display()));
    let _cleanup = TempFiles(vec![wav_path.clone(), output_txt.clone()]);
    fs::write(&wav_path, wav).map_err(|_| "Não foi possível preparar o áudio local.".to_owned())?;
    let mut command = Command::new(&p.whisper_bin);
    command.args(["-m"]).arg(&p.whisper_model).args(["-f"]).arg(&wav_path).args(["-l", "pt", "-otxt", "-np", "-of"]).arg(&output_stem).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    hide_window(&mut command); wait_for(command.spawn().map_err(|_| "Não foi possível iniciar o whisper.cpp local.".to_owned())?, "reconhecimento de voz")?;
    let text = fs::read_to_string(&output_txt).map_err(|_| "O whisper.cpp não produziu uma transcrição.".to_owned())?.trim().to_owned();
    if text.is_empty() { Err("Não foi possível detetar fala na gravação.".to_owned()) } else { Ok(text) }
}

pub fn synthesize(text: String, resource_dir: Option<PathBuf>) -> Result<Vec<u8>, String> {
    if text.trim().is_empty() { return Err("Não existe texto para sintetizar.".to_owned()); }
    if text.len() > 20_000 { return Err("A resposta é demasiado longa para o TTS local.".to_owned()); }
    let p = paths(resource_dir.as_deref())?;
    if !p.piper_bin.is_file() { return Err("piper.exe não foi encontrado em src-tauri/local/bin.".to_owned()); }
    if !p.piper_model.is_file() || !p.piper_config.is_file() || !p.piper_data.is_dir() { return Err("A voz Piper local não foi encontrada em src-tauri/local/models.".to_owned()); }
    let wav_path = temp_stem("tts").with_extension("wav"); let _cleanup = TempFiles(vec![wav_path.clone()]);
    let mut command = Command::new(&p.piper_bin);
    command.args(["--model"]).arg(&p.piper_model).args(["--config"]).arg(&p.piper_config).args(["--output_file"]).arg(&wav_path).args(["--espeak_data"]).arg(&p.piper_data).args(["--length_scale", "1.08"]).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null());
    hide_window(&mut command); let mut child = command.spawn().map_err(|_| "Não foi possível iniciar o Piper local.".to_owned())?;
    if let Some(mut stdin) = child.stdin.take() { stdin.write_all(text.as_bytes()).and_then(|_| stdin.write_all(b"\n")).map_err(|_| "Não foi possível enviar o texto ao Piper local.".to_owned())?; }
    wait_for(child, "TTS")?;
    let audio = fs::read(&wav_path).map_err(|_| "O Piper não produziu áudio.".to_owned())?;
    if audio.is_empty() { Err("O Piper produziu áudio vazio.".to_owned()) } else { Ok(audio) }
}