//! Shared CLI-only corpus/report helpers. No installed database or credential writes.
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use std::{collections::HashSet, io::Write, path::PathBuf};

pub fn data_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test-data")
}

pub fn cases<T: DeserializeOwned>(name: &str) -> Result<Vec<T>, String> {
    let bytes = std::fs::read(data_dir().join(name))
        .map_err(|_| format!("Cannot read test-data/{name}"))?;
    let cases: Vec<T> = serde_json::from_slice(&bytes).map_err(|e| {
        format!(
            "Invalid {name} JSON at line {}, column {}",
            e.line(),
            e.column()
        )
    })?;
    if cases.is_empty() {
        return Err(format!("{name} contains no cases"));
    }
    Ok(cases)
}

pub fn unique_ids<'a>(ids: impl Iterator<Item = &'a str>) -> Result<(), String> {
    let mut seen = HashSet::new();
    for id in ids {
        if id.trim().is_empty() || !seen.insert(id) {
            return Err("Case IDs must be nonempty and unique".into());
        }
    }
    Ok(())
}

pub fn envelope(value: Value) -> Value {
    json!({"choices":[{"finish_reason":"stop","message":{"content":value.to_string()}}]})
}

pub fn cell(value: impl ToString) -> String {
    value
        .to_string()
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .replace('|', "\\|")
}

pub fn rate(numerator: usize, denominator: usize) -> Option<f64> {
    (denominator > 0).then(|| 100.0 * numerator as f64 / denominator as f64)
}

pub fn percentage(value: Option<f64>) -> String {
    value
        .map(|n| format!("{n:.2}%"))
        .unwrap_or_else(|| "N/A".into())
}

pub fn save(prefix: &str, report: &Value) -> Result<PathBuf, String> {
    let directory = data_dir().join("results");
    std::fs::create_dir_all(&directory).map_err(|_| "Cannot create test-data/results")?;
    let timestamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.9fZ");
    let path = directory.join(format!("{prefix}-{timestamp}.json"));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&path)
        .map_err(|_| "Cannot create a new result file")?;
    let bytes = serde_json::to_vec_pretty(report).map_err(|_| "Cannot serialize results")?;
    file.write_all(&bytes)
        .and_then(|_| file.write_all(b"\n"))
        .map_err(|_| "Cannot write results")?;
    Ok(path)
}

pub fn error(error: &str) -> String {
    crate::engine_observability::error_category(error).to_string()
}
