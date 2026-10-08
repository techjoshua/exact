use regex::Regex;
use sha2::{Digest, Sha256};
use std::sync::LazyLock;

static TIMESTAMP: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?-u:\b)u:[0-9]+,s:").unwrap());
const MARKER: &[u8] = b"name=\"framework-participant\" content=\"tanstack-start\"";

/// SHA-256 of complete bytes, with exactly the Node driver's participant-specific timestamp exception.
pub fn stable_hash(bytes: &[u8]) -> String {
    let normalized;
    let source = if bytes.windows(MARKER.len()).any(|p| p == MARKER) {
        normalized = TIMESTAMP
            .replace_all(&String::from_utf8_lossy(bytes), "u:<request-time>,s:")
            .into_owned();
        normalized.as_bytes()
    } else {
        bytes
    };
    format!("{:x}", Sha256::digest(source))
}
