use crate::{
    identity::stable_hash,
    plan::{Identity, Plan},
};
use reqwest::Client;
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

pub struct Transport {
    pub client: Client,
    pub plan: Plan,
    pub url: reqwest::Url,
    pub identity: Option<Identity>,
}

pub struct Observation {
    pub issued: Instant,
    pub completed: Instant,
    pub ttfb_ms: Option<f64>,
    pub status: Option<u16>,
    pub error: Option<String>,
    pub invalid: bool,
    pub validation_ms: f64,
    pub body: Vec<u8>,
}

/// Reuses one connection pool, never redirects, decompresses or retries a failed request implicitly.
pub fn client(plan: &Plan) -> Result<Client, reqwest::Error> {
    Client::builder()
        .http1_only()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .pool_idle_timeout(Duration::from_millis(plan.timeout_ms))
        .pool_max_idle_per_host(plan.max_in_flight)
        .build()
}

/// Drains the complete response into an owned reusable buffer with an absolute request deadline.
pub async fn request(transport: Arc<Transport>, mut body: Vec<u8>) -> Observation {
    let plan = &transport.plan;
    body.clear();
    let issued = Instant::now();
    let mut ttfb_ms = None;
    let mut status = None;
    let received = tokio::time::timeout(Duration::from_millis(plan.timeout_ms), async {
        let mut response = transport
            .client
            .get(transport.url.clone())
            .header("connection", "keep-alive")
            .send()
            .await
            .map_err(|_| "LOAD_TRANSPORT".to_string())?;
        ttfb_ms = Some(issued.elapsed().as_secs_f64() * 1000.0);
        status = Some(response.status().as_u16());
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "LOAD_RESPONSE".to_string())?
        {
            if chunk.len() > plan.max_response_bytes - body.len() {
                return Err("LOAD_BODY_LIMIT".into());
            }
            body.extend_from_slice(&chunk);
        }
        Ok::<(), String>(())
    })
    .await;
    let completed = Instant::now();
    let mut error = match received {
        Ok(Ok(())) => None,
        Ok(Err(e)) => Some(e),
        Err(_) => Some("LOAD_TIMEOUT".into()),
    };
    let checking = Instant::now();
    let mut invalid = false;
    if error.is_none() {
        if let Some(expected) = &transport.identity {
            error = if status != Some(200) {
                Some(format!("HTTP_{}", status.unwrap_or(0)))
            } else if body.len() != expected.bytes {
                Some("LOAD_LENGTH_MISMATCH".into())
            } else if stable_hash(&body) != expected.hash {
                Some("LOAD_HASH_MISMATCH".into())
            } else {
                None
            };
            invalid = error.is_some();
        }
    }
    Observation {
        issued,
        completed,
        ttfb_ms,
        status,
        error,
        invalid,
        validation_ms: checking.elapsed().as_secs_f64() * 1000.0,
        body,
    }
}
