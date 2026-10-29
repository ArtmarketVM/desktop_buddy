#[cfg(target_os = "macos")]
use std::ffi::{c_char, CStr, CString};

#[cfg(target_os = "macos")]
#[allow(
    clippy::duplicated_attributes,
    reason = "each #[link] names a different library; the shared kind is not a duplicate"
)]
#[link(name = "buddy_speech", kind = "static")]
#[link(name = "Foundation", kind = "framework")]
#[link(name = "AVFoundation", kind = "framework")]
#[link(name = "Speech", kind = "framework")]
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
    // requests from the workspace and desktop sumi without locking app state.
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
    struct Failure {
        domain: String,
        code: i64,
    }
    #[derive(serde::Deserialize)]
    struct Response {
        error: Option<String>,
        candidates: Option<serde_json::Value>,
        failure: Option<Failure>,
    }
    let response: Response =
        serde_json::from_str(json).map_err(|_| "macOS returned an unreadable speech response")?;
    if let Some(error) = response.error {
        if let Some(failure) = response.failure {
            return Err(match (failure.domain.as_str(),failure.code) {
                ("kLSRErrorDomain",201)=>"Dictation is disabled on this Mac. Enable it in System Settings > Keyboard > Dictation, then select your spoken language. Buddy uses on-device recognition only.".into(),
                ("kLSRErrorDomain",102)=>"The local speech model for this language is not installed. Open System Settings > Keyboard > Dictation > Languages and wait for the language download to finish. Each language needs its own downloaded model.".into(),
                ("kAFAssistantErrorDomain",1700)=>"Allow sumi in System Settings > Privacy & Security > Speech Recognition.".into(),
                ("kAFAssistantErrorDomain",1100)=>"The local speech recognizer is busy. Finish the current recording and try again.".into(),
                ("kAFAssistantErrorDomain",1101|1107)=>"The local speech service stopped. Check that Dictation is enabled and the spoken language has finished downloading, then retry the recording.".into(),
                _=>error,
            });
        }
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
    #[test]
    fn system_speech_failures_explain_disabled_dictation_and_missing_assets() {
        for (domain, code, expected) in [
            ("kLSRErrorDomain", 201, "Dictation is disabled"),
            ("kLSRErrorDomain", 102, "not installed"),
            ("kAFAssistantErrorDomain", 1700, "Privacy & Security"),
            ("kAFAssistantErrorDomain", 1100, "busy"),
            ("kAFAssistantErrorDomain", 1101, "speech service stopped"),
        ] {
            let value = serde_json::json!({"error":"Local speech recognition failed.","failure":{"domain":domain,"code":code}});
            assert!(transcript(&value.to_string())
                .unwrap_err()
                .contains(expected));
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
