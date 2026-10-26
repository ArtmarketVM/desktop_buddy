//! On-device dictation. Only public model weights are downloaded; audio stays in memory.
use ring::digest::{Context, SHA256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{Emitter, Manager};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub const MODEL_FILE: &str = "ggml-large-v3-turbo-q5_0.bin";
const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q5_0.bin";
const MODEL_BYTES: u64 = 574_041_195;
const MODEL_SHA256: &str = "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2";
static DOWNLOAD: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static RECOGNITION: Mutex<()> = Mutex::new(());
const NO_SPEECH: &str = "No speech was recognized. Try again or type your message.";
const VOICE_TERMS: &str =
    "sumi, sumi app, current goal, goals, steps, add a goal, rename a goal, AI keys";

/// Local vocabulary only: current/open goal titles, never chat history or screen text.
pub fn goal_titles(storage: &crate::storage::Storage) -> Result<Vec<String>, String> {
    select_titles(storage, None)
}
pub fn relevant_goal_titles(
    storage: &crate::storage::Storage,
    transcript: &str,
) -> Result<Vec<String>, String> {
    select_titles(storage, Some(transcript))
}
fn select_titles(
    storage: &crate::storage::Storage,
    transcript: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut query = storage.connection.prepare(
        "SELECT g.text,g.status='active' FROM goals g LEFT JOIN core_goals c ON c.goal_id=g.id \
         WHERE g.status='active' OR (g.status!='completed' AND c.state='open') \
         ORDER BY (g.status='active') DESC,g.id DESC LIMIT 500"
    ).map_err(|_| "Could not read local speech vocabulary")?;
    let mut titles: Vec<(String, bool)> = query
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|_| "Could not read local speech vocabulary")?
        .collect::<Result<_, _>>()
        .map_err(|_| "Could not read local speech vocabulary")?;
    if let Some(transcript) = transcript {
        let text = transcript.to_lowercase();
        let words: std::collections::HashSet<_> =
            text.split(|c: char| !c.is_alphanumeric()).collect();
        titles.sort_by_cached_key(|(title, active)| {
            let score: usize = title
                .to_lowercase()
                .split(|c: char| !c.is_alphanumeric())
                .filter(|word| {
                    word.chars().count() >= 3
                        && !["the", "and", "for", "goal", "current", "app", "with"].contains(word)
                        && words.contains(word)
                })
                .map(|word| word.chars().count())
                .sum();
            std::cmp::Reverse((*active, score))
        });
    }
    let mut titles_out = Vec::new();
    let mut characters = VOICE_TERMS.chars().count();
    for (title, _) in titles.into_iter().take(12) {
        let title: String = title
            .chars()
            .map(|c| if c.is_control() { ' ' } else { c })
            .collect();
        let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
        let title: String = title.chars().take(120).collect();
        if !title.is_empty() && characters + title.chars().count() + 2 <= 900 {
            characters += title.chars().count() + 2;
            titles_out.push(title);
        }
    }
    Ok(titles_out)
}

pub fn vocabulary(storage: &crate::storage::Storage) -> Result<String, String> {
    let titles = goal_titles(storage)?;
    Ok(std::iter::once(VOICE_TERMS.to_string())
        .chain(titles)
        .collect::<Vec<_>>()
        .join(", "))
}

fn verified(path: &Path, size: u64, hash: &str) -> bool {
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    if !file.metadata().is_ok_and(|m| m.len() == size) {
        return false;
    }
    let mut context = Context::new(&SHA256);
    let mut buffer = [0; 65536];
    loop {
        match file.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => context.update(&buffer[..n]),
            Err(_) => return false,
        }
    }
    let digest = context.finish();
    let actual: String = digest.as_ref().iter().map(|b| format!("{b:02x}")).collect();
    actual == hash
}

struct Partial(PathBuf);
impl Drop for Partial {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

async fn download(
    directory: &Path,
    url: &str,
    size: u64,
    hash: &str,
    progress: impl Fn(u64, u64),
) -> Result<(), String> {
    let target = directory.join(MODEL_FILE);
    if verified(&target, size, hash) {
        return Ok(());
    }
    fs::create_dir_all(directory).map_err(|_| "Could not create local speech storage")?;
    let temporary = Partial(directory.join(format!("{MODEL_FILE}.{}.partial", std::process::id())));
    let mut file = fs::File::create(&temporary.0).map_err(|_| "Could not save the speech model")?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|_| "Could not prepare the speech model download")?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|_| "The speech model could not download. Check your connection and try again.")?
        .error_for_status()
        .map_err(|_| "The speech model download is unavailable. Try again later.")?;
    let mut received = 0;
    let mut reported = 0;
    progress(0, size);
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The speech model download stopped. Try again.")?
    {
        received += chunk.len() as u64;
        if received > size {
            return Err("The speech model download failed its size check. Try again.".into());
        }
        file.write_all(&chunk)
            .map_err(|_| "Could not save the speech model. Check free disk space.")?;
        if received - reported >= 1024 * 1024 {
            progress(received, size);
            reported = received;
        }
    }
    file.sync_all()
        .map_err(|_| "Could not finish saving the speech model")?;
    drop(file);
    if !verified(&temporary.0, size, hash) {
        return Err("The speech model failed its integrity check. Try again.".into());
    }
    // Replace a corrupt cache only after its replacement is complete and verified.
    if target.exists() {
        fs::remove_file(&target).map_err(|_| "Could not replace the speech model")?;
    }
    fs::rename(&temporary.0, &target)
        .map_err(|_| "Could not finish installing the speech model")?;
    progress(size, size);
    Ok(())
}

#[tauri::command(async)]
pub async fn prepare_local_voice(window: tauri::WebviewWindow) -> Result<(), String> {
    if !["main", "buddy"].contains(&window.label()) {
        return Err("Open sumi chat first".into());
    }
    let directory = window
        .app_handle()
        .path()
        .app_data_dir()
        .map_err(|_| "Local speech storage is unavailable")?
        .join("speech");
    let _guard = DOWNLOAD.lock().await;
    download(
        &directory,
        MODEL_URL,
        MODEL_BYTES,
        MODEL_SHA256,
        |downloaded, total| {
            let _ = window.emit(
                "buddy://voice-model-progress",
                serde_json::json!({"downloaded":downloaded,"total":total}),
            );
        },
    )
    .await
}

fn samples(audio: &[u8]) -> Result<Vec<f32>, String> {
    if !crate::core_import::valid_voice_audio(audio) {
        return Err("Record up to 60 seconds of WAV audio".into());
    }
    let mut pcm: Vec<f32> = audio[44..]
        .as_chunks::<2>()
        .0
        .iter()
        .map(|p| i16::from_le_bytes([p[0], p[1]]) as f32 / 32768.)
        .collect();
    let peak = pcm.iter().fold(0f32, |a, b| a.max(b.abs()));
    let rms = (pcm.iter().map(|x| x * x).sum::<f32>() / pcm.len() as f32).sqrt();
    if peak < 0.003 || rms < 0.0005 {
        return Err(NO_SPEECH.into());
    }
    // Bounded gain for quiet microphones; never remove silence or trim either end.
    let gain = (0.9 / peak).clamp(1., 4.);
    for sample in &mut pcm {
        *sample *= gain;
    }
    Ok(pcm)
}

pub fn transcribe(
    model: &Path,
    audio: &[u8],
    language: &str,
    vocabulary: &str,
) -> Result<String, String> {
    if !["auto", "en", "ru"].contains(&language) {
        return Err("Choose a supported speech language".into());
    }
    let audio = samples(audio)?;
    let _guard = RECOGNITION
        .try_lock()
        .map_err(|_| "Another recording is being transcribed. Try again shortly.")?;
    if !verified(model, MODEL_BYTES, MODEL_SHA256) {
        return Err("Download the on-device speech model before recording.".into());
    }
    let mut options = WhisperContextParameters::default();
    options.use_gpu(cfg!(target_os = "macos"));
    // No transcript, microphone data or token text is written to native logs.
    whisper_rs::install_logging_hooks();
    let context = WhisperContext::new_with_params(model, options).map_err(|_| {
        "Could not load the local speech model. Close other large apps and try again."
    })?;
    let mut state = context
        .create_state()
        .map_err(|_| "Could not prepare local recognition")?;
    // Hints participate in decoding the audio, not in rewriting the transcript.
    // Keep the current goal first; Whisper otherwise keeps the tail of long hints.
    let safe_vocabulary = vocabulary.replace('\0', " ");
    let mut hint_tokens = context
        .tokenize(&safe_vocabulary, 4096)
        .map_err(|_| "Could not prepare local speech vocabulary")?;
    hint_tokens.truncate(180);
    let mut parameters = FullParams::new(SamplingStrategy::BeamSearch {
        beam_size: 5,
        patience: -1.,
    });
    parameters.set_language(if language == "auto" {
        None
    } else {
        Some(language)
    });
    parameters.set_translate(false);
    parameters.set_no_context(true);
    parameters.set_tokens(&hint_tokens);
    parameters
        .set_n_threads(std::thread::available_parallelism().map_or(4, |n| n.get().min(8)) as i32);
    parameters.set_print_special(false);
    parameters.set_print_progress(false);
    parameters.set_print_realtime(false);
    parameters.set_print_timestamps(false);
    parameters.set_suppress_blank(true);
    parameters.set_suppress_nst(true);
    state
        .full(parameters, &audio)
        .map_err(|_| "Local speech recognition failed. Try again or type your message.")?;
    let mut transcript = String::new();
    for segment in state.as_iter() {
        if segment.no_speech_probability() > 0.6 {
            continue;
        }
        let text = segment
            .to_str()
            .map_err(|_| "Local recognition returned unreadable text")?;
        if !transcript.is_empty() {
            transcript.push(' ');
        }
        transcript.push_str(text.trim());
    }
    let transcript = transcript.trim();
    if transcript.is_empty() || transcript.chars().count() > 4000 {
        return Err(NO_SPEECH.into());
    }
    Ok(transcript.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn goal(storage: &mut crate::storage::Storage, title: &str, status: &str, state: &str) -> i64 {
        storage
            .connection
            .execute(
                "INSERT OR IGNORE INTO core_areas(title) VALUES('General')",
                [],
            )
            .unwrap();
        storage
            .connection
            .execute(
                "INSERT INTO goals(text,status,created_at) VALUES(?1,?2,'2026-10-25T00:00:00Z')",
                rusqlite::params![title, status],
            )
            .unwrap();
        let id = storage.connection.last_insert_rowid();
        storage.connection.execute("INSERT INTO core_goals(goal_id,area_id,state) VALUES(?1,(SELECT id FROM core_areas WHERE title='General'),?2)", rusqlite::params![id,state]).unwrap();
        id
    }
    #[test]
    fn vocabulary_prioritizes_current_goal_and_excludes_history_and_closed_goals() {
        let mut storage = crate::storage::Storage::open(Path::new(":memory:")).unwrap();
        let current = goal(
            &mut storage,
            "Fix saved AI keys disconnecting",
            "active",
            "open",
        );
        goal(&mut storage, "Prepare pitch", "paused", "open");
        goal(
            &mut storage,
            "Closed private title",
            "completed",
            "completed",
        );
        goal(&mut storage, "Deferred private title", "paused", "deferred");
        storage
            .save_chat_turn(
                "Private chat history",
                &crate::ai_chat::ChatReply::default(),
                None,
            )
            .unwrap();
        let hint = vocabulary(&storage).unwrap();
        assert!(hint.starts_with(&format!("{VOICE_TERMS}, Fix saved AI keys disconnecting")));
        assert!(hint.contains("Prepare pitch"));
        for excluded in [
            "Private chat history",
            "Closed private title",
            "Deferred private title",
        ] {
            assert!(!hint.contains(excluded));
        }
        // A fresh lookup reflects current state, not vocabulary from a previous recording.
        storage
            .connection
            .execute("UPDATE goals SET status='completed' WHERE id=?1", [current])
            .unwrap();
        assert!(!vocabulary(&storage)
            .unwrap()
            .contains("Fix saved AI keys disconnecting"));
    }
    #[test]
    fn draft_context_can_find_an_older_named_goal_without_widening_the_bound() {
        let mut storage = crate::storage::Storage::open(Path::new(":memory:")).unwrap();
        goal(
            &mut storage,
            "Fix saved AI keys disconnecting",
            "deferred",
            "open",
        );
        for i in 0..20 {
            goal(
                &mut storage,
                &format!("Unrelated recent goal {i}"),
                "deferred",
                "open",
            );
        }
        let titles = relevant_goal_titles(
            &storage,
            "change safety eye keys disconnecting to the microphone issue",
        )
        .unwrap();
        assert_eq!(titles[0], "Fix saved AI keys disconnecting");
        assert!(titles.len() <= 12);
        assert!(
            titles
                .iter()
                .map(|title| title.chars().count() + 2)
                .sum::<usize>()
                <= 900
        );
        assert!(!goal_titles(&storage)
            .unwrap()
            .iter()
            .any(|title| title == "Fix saved AI keys disconnecting"));
    }
    #[test]
    fn vocabulary_bounds_titles_and_total_unicode_length_and_removes_controls() {
        let mut storage = crate::storage::Storage::open(Path::new(":memory:")).unwrap();
        for i in 0..15 {
            goal(
                &mut storage,
                &format!("{i} {}", "界".repeat(200)),
                "paused",
                "open",
            );
        }
        goal(
            &mut storage,
            "Current\0goal\nwith\tspacing",
            "active",
            "open",
        );
        let hint = vocabulary(&storage).unwrap();
        assert!(hint.contains("Current goal with spacing"));
        assert!(!hint.chars().any(char::is_control));
        assert!(hint.chars().count() <= 900);
        assert!(!hint.contains(&"界".repeat(121)));
        assert!(!hint.split(", ").any(|title| title.starts_with("0 ")));
    }
    fn directory() -> PathBuf {
        std::env::temp_dir().join(format!(
            "sumi-voice-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ))
    }
    fn hash(bytes: &[u8]) -> String {
        ring::digest::digest(&SHA256, bytes)
            .as_ref()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }
    #[tokio::test]
    async fn model_download_is_verified_atomic_cached_and_recovers_from_corruption() {
        use wiremock::{matchers::method, Mock, MockServer, ResponseTemplate};
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(b"model"))
            .expect(2)
            .mount(&server)
            .await;
        let dir = directory();
        for _ in 0..2 {
            download(&dir, &server.uri(), 5, &hash(b"model"), |_, _| {})
                .await
                .unwrap();
        }
        assert!(verified(&dir.join(MODEL_FILE), 5, &hash(b"model")));
        fs::write(dir.join(MODEL_FILE), b"bad").unwrap();
        download(&dir, &server.uri(), 5, &hash(b"model"), |_, _| {})
            .await
            .unwrap();
        assert!(verified(&dir.join(MODEL_FILE), 5, &hash(b"model")));
        fs::remove_dir_all(dir).unwrap();
    }
    #[tokio::test]
    async fn model_download_rejects_wrong_hash_and_size_without_installing_partial_files() {
        use wiremock::{matchers::method, Mock, MockServer, ResponseTemplate};
        for body in [b"wrong".as_slice(), b"mo", b"model-extra"] {
            let server = MockServer::start().await;
            Mock::given(method("GET"))
                .respond_with(ResponseTemplate::new(200).set_body_bytes(body))
                .mount(&server)
                .await;
            let dir = directory();
            assert!(download(&dir, &server.uri(), 5, &hash(b"model"), |_, _| {})
                .await
                .is_err());
            assert!(!dir.join(MODEL_FILE).exists());
            assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
            fs::remove_dir_all(dir).unwrap();
        }
    }
    fn wav(values: &[i16]) -> Vec<u8> {
        let mut data = b"RIFF".to_vec();
        data.extend((36 + values.len() as u32 * 2).to_le_bytes());
        data.extend(b"WAVEfmt ");
        data.extend(16u32.to_le_bytes());
        data.extend(1u16.to_le_bytes());
        data.extend(1u16.to_le_bytes());
        data.extend(16000u32.to_le_bytes());
        data.extend(32000u32.to_le_bytes());
        data.extend(2u16.to_le_bytes());
        data.extend(16u16.to_le_bytes());
        data.extend(b"data");
        data.extend((values.len() as u32 * 2).to_le_bytes());
        for value in values {
            data.extend(value.to_le_bytes());
        }
        data
    }
    #[test]
    fn audio_rejects_silence_and_malformed_wav_and_preserves_complete_quiet_speech() {
        assert!(samples(b"not audio").is_err());
        assert!(samples(&wav(&[0; 16000])).is_err());
        let values = [1000, 0, -1000, 500];
        let output = samples(&wav(&values)).unwrap();
        assert_eq!(output.len(), values.len());
        assert_eq!(
            output,
            vec![4000. / 32768., 0., -4000. / 32768., 2000. / 32768.]
        );
    }
    #[test]
    #[ignore = "Requires a downloaded model and local spoken WAV fixtures; never downloads in cargo test"]
    fn real_local_voice_preserves_add_goal_commands_and_actual_past_reports() {
        let model = PathBuf::from(
            std::env::var("SUMI_TEST_VOICE_MODEL").expect("Set SUMI_TEST_VOICE_MODEL"),
        );
        let fixtures = PathBuf::from(
            std::env::var("SUMI_TEST_VOICE_FIXTURES").expect("Set SUMI_TEST_VOICE_FIXTURES"),
        );
        for (file, command) in [("add-goal-us.wav", true), ("past-goal-us.wav", false)] {
            let transcript = transcribe(
                &model,
                &fs::read(fixtures.join(file)).unwrap(),
                "auto",
                VOICE_TERMS,
            )
            .unwrap();
            println!("{file}: {transcript}");
            let text = transcript.to_lowercase();
            if command {
                assert!(text.starts_with("please add") || text.starts_with("add "));
            } else {
                assert!(text.starts_with("i had"));
                assert!(text.contains("last month"));
            }
        }
    }
    #[test]
    #[ignore = "Requires a downloaded model and local spoken WAV fixtures; never downloads in cargo test"]
    fn real_local_voice_preserves_reels_feminist_account_jane_doe_and_organ() {
        let model = PathBuf::from(
            std::env::var("SUMI_TEST_VOICE_MODEL").expect("Set SUMI_TEST_VOICE_MODEL"),
        );
        let fixtures = PathBuf::from(
            std::env::var("SUMI_TEST_VOICE_FIXTURES").expect("Set SUMI_TEST_VOICE_FIXTURES"),
        );
        for name in ["reels-uk.wav", "reels-us.wav"] {
            let start = std::time::Instant::now();
            let transcript = transcribe(
                &model,
                &fs::read(fixtures.join(name)).unwrap(),
                "auto",
                VOICE_TERMS,
            )
            .unwrap();
            println!(
                "{name} ({:.1}s): {transcript}",
                start.elapsed().as_secs_f64()
            );
            let text = transcript.to_lowercase();
            for phrase in [
                "add a goal",
                "reel",
                "feminist account",
                "jane doe",
                "organ",
            ] {
                assert!(text.contains(phrase), "Missing {phrase} in {name}");
            }
            assert!(!text.contains("new orleans"));
        }
    }
    #[test]
    #[ignore = "Requires a downloaded model and local spoken WAV fixtures; never downloads in cargo test"]
    fn real_local_voice_context_recognizes_goal_rename_without_forcing_unrelated_speech() {
        let model = PathBuf::from(
            std::env::var("SUMI_TEST_VOICE_MODEL").expect("Set SUMI_TEST_VOICE_MODEL"),
        );
        let fixtures = PathBuf::from(
            std::env::var("SUMI_TEST_VOICE_FIXTURES").expect("Set SUMI_TEST_VOICE_FIXTURES"),
        );
        let mut storage = crate::storage::Storage::open(Path::new(":memory:")).unwrap();
        goal(
            &mut storage,
            "Fix saved AI keys disconnecting",
            "active",
            "open",
        );
        goal(&mut storage, "Write the hackathon pitch", "paused", "open");
        let hint = vocabulary(&storage).unwrap();
        for name in [
            "rename-uk.wav",
            "rename-us.wav",
            "colour-uk.wav",
            "unrelated-us.wav",
        ] {
            let audio = fs::read(fixtures.join(name)).unwrap();
            if name.starts_with("rename") {
                println!(
                    "{name} before: {}",
                    transcribe(&model, &audio, "auto", "").unwrap()
                );
            }
            let transcript = transcribe(&model, &audio, "auto", &hint).unwrap();
            println!("{name} with vocabulary: {transcript}");
            let text = transcript.to_lowercase();
            if name.starts_with("rename") {
                for phrase in ["current goal", "ai", "disconnecting", "microphone", "sumi"] {
                    assert!(text.contains(phrase), "Missing {phrase} in {name}");
                }
            } else {
                assert!(!text.contains("disconnecting"));
                assert!(!text.contains("current goal"));
                if name.starts_with("colour") {
                    assert!(text.contains("violet"));
                    assert!(text.contains("colour") || text.contains("color"));
                } else {
                    assert!(text.contains("bread"));
                    assert!(text.contains("tomatoes"));
                }
            }
        }
    }
}
