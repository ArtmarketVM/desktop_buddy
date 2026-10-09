#[cfg(target_os = "macos")]
use std::ffi::{c_char, CStr, CString};

#[cfg(target_os = "macos")]
extern "C" {
    fn buddy_speech_languages() -> *mut c_char;
    fn buddy_speech_transcribe(
        audio: *const u8,
        length: usize,
        language: *const c_char,
    ) -> *mut c_char;
    fn buddy_speech_free(value: *mut c_char);
}

#[cfg(target_os = "macos")]
unsafe fn take_json(value: *mut c_char) -> Result<String, String> {
    if value.is_null() {
        return Err("macOS speech recognition could not prepare a response".into());
    }
    let result = CStr::from_ptr(value)
        .to_str()
        .map(str::to_owned)
        .map_err(|_| "macOS returned an unreadable speech response".to_string());
    buddy_speech_free(value);
    result
}

#[cfg(target_os = "macos")]
pub fn languages() -> Result<Vec<String>, String> {
    let json = unsafe { take_json(buddy_speech_languages())? };
    serde_json::from_str(&json).map_err(|_| "Could not read macOS speech languages".into())
}

#[cfg(target_os = "macos")]
pub fn transcribe(audio: &[u8], language: &str) -> Result<String, String> {
    // Apple recognition owns callbacks and permission state. Serialize concurrent
    // requests from the workspace and desktop Buddy without locking app state.
    static RECOGNITION: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = RECOGNITION
        .try_lock()
        .map_err(|_| "Another voice recording is being transcribed. Try again shortly.")?;
    let language = CString::new(language).map_err(|_| "Invalid speech language")?;
    let json = unsafe {
        take_json(buddy_speech_transcribe(
            audio.as_ptr(),
            audio.len(),
            language.as_ptr(),
        ))?
    };
    transcript(&json)
}

fn transcript(json: &str) -> Result<String, String> {
    #[derive(serde::Deserialize)]
    struct Response {
        error: Option<String>,
        candidates: Option<serde_json::Value>,
    }
    let response: Response =
        serde_json::from_str(json).map_err(|_| "macOS returned an unreadable speech response")?;
    if let Some(error) = response.error {
        return Err(error);
    }
    crate::core_import::select_transcript(
        &response
            .candidates
            .ok_or("macOS returned no speech candidates")?
            .to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_only_clear_final_candidates_and_preserves_permission_errors() {
        assert_eq!(
            transcript(
                r#"{"candidates":[{"text":"Ship the update","confidence":0.9,"start":0,"end":2}]}"#
            )
            .unwrap(),
            "Ship the update"
        );
        assert_eq!(
            transcript(r#"{"error":"Speech recognition permission denied"}"#).unwrap_err(),
            "Speech recognition permission denied"
        );
        for invalid in [
            "{}",
            "invalid",
            r#"{"candidates":[]}"#,
            r#"{"candidates":[{"text":"noise","confidence":0.1,"start":0,"end":2}]}"#,
        ] {
            assert!(transcript(invalid).is_err());
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn discovers_only_local_languages_without_prompting_or_recording() {
        let installed = languages().unwrap();
        assert!(installed
            .iter()
            .all(|name| ["en-US", "ru-RU"].contains(&name.as_str())));
    }
}
