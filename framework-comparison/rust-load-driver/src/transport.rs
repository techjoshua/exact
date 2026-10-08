use crate::{
    identity::stable_hash,
    plan::{Identity, Plan},
};
use bytes::Bytes;
use http_body_util::{BodyExt, Empty};
use hyper::{Request, Uri};
use hyper_util::{
    client::legacy::{Client, connect::HttpConnector},
    rt::{TokioExecutor, TokioTimer},
};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

pub struct Transport {
    pub client: Client<HttpConnector, Empty<Bytes>>,
    pub plan: Plan,
    pub uri: Uri,
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
pub fn client(plan: &Plan) -> Client<HttpConnector, Empty<Bytes>> {
    let mut connector = HttpConnector::new();
    connector.set_nodelay(true);
    Client::builder(TokioExecutor::new())
        .pool_timer(TokioTimer::new())
        .retry_canceled_requests(false)
        .pool_idle_timeout(Duration::from_millis(plan.timeout_ms))
        .pool_max_idle_per_host(plan.max_in_flight)
        .build(connector)
}

/// Drains the complete response into an owned reusable buffer with an absolute request deadline.
pub async fn request(transport: Arc<Transport>, mut body: Vec<u8>) -> Observation {
    let plan = &transport.plan;
    body.clear();
    let issued = Instant::now();
    let mut ttfb_ms = None;
    let mut status = None;
    let received = tokio::time::timeout(Duration::from_millis(plan.timeout_ms), async {
        // Match the Node driver's header set. Higher-level clients may add Accept or compression.
        let outgoing = Request::builder()
            .uri(transport.uri.clone())
            .header("connection", "keep-alive")
            .body(Empty::<Bytes>::new())
            .map_err(|_| "LOAD_REQUEST".to_string())?;
        let mut response = transport
            .client
            .request(outgoing)
            .await
            .map_err(|_| "LOAD_TRANSPORT".to_string())?;
        ttfb_ms = Some(issued.elapsed().as_secs_f64() * 1000.0);
        status = Some(response.status().as_u16());
        while let Some(frame) = response.body_mut().frame().await {
            let frame = frame.map_err(|_| "LOAD_RESPONSE".to_string())?;
            let Ok(chunk) = frame.into_data() else {
                continue;
            };
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
