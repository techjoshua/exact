use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Complete response length and stable SHA-256, verified before and throughout measured load.
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub bytes: usize,
    pub hash: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
/// A bounded admission interval, with milliseconds and requests/second matching the Node plan.
pub struct Stage {
    pub name: String,
    pub mode: String,
    pub duration_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub concurrency: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rate: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_rate: Option<f64>,
    #[serde(default)]
    pub discard: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
/// Validated driver limits and workload, owned for the entire run without per-request cloning.
pub struct Plan {
    pub url: String,
    pub stages: Vec<Stage>,
    #[serde(default = "in_flight")]
    pub max_in_flight: usize,
    #[serde(default = "timeout")]
    pub timeout_ms: u64,
    #[serde(default = "lag")]
    pub max_lag_ms: u64,
    #[serde(default = "body_limit")]
    pub max_response_bytes: usize,
    pub contains: Option<String>,
    pub expected_identity: Option<Identity>,
}
fn in_flight() -> usize {
    512
}
fn timeout() -> u64 {
    10_000
}
fn lag() -> u64 {
    50
}
fn body_limit() -> usize {
    1_048_576
}

impl Plan {
    /// Rejects unsupported plans before opening a socket. This driver deliberately supports HTTP/1 only.
    pub fn validate(&self) -> Result<(), String> {
        let url = url::Url::parse(&self.url).map_err(|e| e.to_string())?;
        if url.scheme() != "http"
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("Rust driver requires an HTTP URL without credentials".into());
        }
        if !(1..=100).contains(&self.stages.len())
            || !(1..=4096).contains(&self.max_in_flight)
            || !(1..=120_000).contains(&self.timeout_ms)
            || !(1..=10_000).contains(&self.max_lag_ms)
            || !(1..=16_777_216).contains(&self.max_response_bytes)
        {
            return Err("Invalid stage count or load bounds".into());
        }
        let mut names = HashSet::new();
        for s in &self.stages {
            if s.name.is_empty()
                || !names.insert(&s.name)
                || !(1..=3_600_000).contains(&s.duration_ms)
            {
                return Err("Invalid or duplicate stage name or duration".into());
            }
            match s.mode.as_str() {
                "concurrency"
                    if s.concurrency
                        .is_some_and(|n| n > 0 && n <= self.max_in_flight) => {}
                "arrival"
                    if s.rate.is_some_and(valid_rate) && s.end_rate.is_none_or(valid_rate) => {}
                _ => return Err("Invalid stage mode, concurrency or arrival rate".into()),
            }
        }
        Ok(())
    }
}
fn valid_rate(rate: f64) -> bool {
    rate.is_finite() && rate > 0.0 && rate <= 100_000.0
}

/// Integral and inverse of the same linear demand ramp as the Node driver, independent of completion.
pub fn demand(s: &Stage, elapsed_ms: f64) -> f64 {
    let seconds = elapsed_ms.clamp(0.0, s.duration_ms as f64) / 1000.0;
    let rate = s.rate.unwrap();
    let slope = (s.end_rate.unwrap_or(rate) - rate) / (s.duration_ms as f64 / 1000.0);
    rate * seconds + slope * seconds * seconds / 2.0
}
pub fn offset(s: &Stage, index: u64) -> f64 {
    let rate = s.rate.unwrap();
    let slope = (s.end_rate.unwrap_or(rate) - rate) / (s.duration_ms as f64 / 1000.0);
    if slope == 0.0 {
        index as f64 / rate * 1000.0
    } else {
        2.0 * index as f64 / (rate + (rate * rate + 2.0 * slope * index as f64).sqrt()) * 1000.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ramp_conserves_demand() {
        for end in [50.0, 100.0, 200.0] {
            let s: Stage = serde_json::from_value(serde_json::json!({"name":"ramp","mode":"arrival","durationMs":2000,"rate":100,"endRate":end})).unwrap();
            assert_eq!(demand(&s, 2000.0), 100.0 + end);
            for i in 0..(100 + end as u64) {
                assert!((demand(&s, offset(&s, i)) - i as f64).abs() < 1e-8);
            }
        }
    }
    #[test]
    fn bounds_fail_before_io() {
        let valid = serde_json::json!({"url":"http://localhost/","stages":[{"name":"a","mode":"concurrency","concurrency":1,"durationMs":10}]});
        for (key, value) in [
            ("url", serde_json::json!("https://localhost/")),
            ("maxInFlight", serde_json::json!(0)),
            ("timeoutMs", serde_json::json!(120001)),
            ("maxResponseBytes", serde_json::json!(16777217)),
        ] {
            let mut input = valid.clone();
            input[key] = value;
            assert!(
                serde_json::from_value::<Plan>(input)
                    .unwrap()
                    .validate()
                    .is_err()
            );
        }
        assert!(
            serde_json::from_value::<Plan>(valid)
                .unwrap()
                .validate()
                .is_ok()
        );
    }
}
