mod identity;
mod plan;
mod stage;
mod statistics;
mod transport;

use plan::{Identity, Plan};
use serde_json::{Value, json};
use std::{
    io::{BufRead, Read, Write},
    sync::Arc,
};
use transport::{Transport, client, request};

/// Flushes bounded NDJSON messages. A broken owner pipe fails the run rather than losing evidence.
fn emit(value: &Value) -> Result<(), String> {
    let mut output = std::io::stdout().lock();
    serde_json::to_writer(&mut output, value).map_err(|e| e.to_string())?;
    output
        .write_all(b"\n")
        .and_then(|_| output.flush())
        .map_err(|e| e.to_string())
}

async fn run(plan: Plan) -> Result<Value, String> {
    plan.validate()?;
    let url = reqwest::Url::parse(&plan.url).map_err(|e| e.to_string())?;
    let mut transport = Arc::new(Transport {
        client: client(&plan).map_err(|e| e.to_string())?,
        plan: plan.clone(),
        url: url.clone(),
        identity: None,
    });
    let first = request(transport.clone(), Vec::new()).await;
    if first.error.is_some()
        || first.status != Some(200)
        || plan.contains.as_ref().is_some_and(|needle| {
            !needle.is_empty()
                && !first
                    .body
                    .windows(needle.len())
                    .any(|s| s == needle.as_bytes())
        })
    {
        return Err(format!(
            "Load preflight failed: {:?} / {:?}",
            first.error, first.status
        ));
    }
    let identity = Identity {
        bytes: first.body.len(),
        hash: identity::stable_hash(&first.body),
    };
    if plan
        .expected_identity
        .as_ref()
        .is_some_and(|expected| expected.bytes != identity.bytes || expected.hash != identity.hash)
    {
        return Err("Load preflight artifact response identity mismatch".into());
    }
    Arc::get_mut(&mut transport)
        .expect("preflight request has settled")
        .identity = Some(identity.clone());
    let mut stages = Vec::new();
    for s in &plan.stages {
        stages.push(stage::run(s, transport.clone()).await?);
    }
    Ok(
        json!({"kind":"sustained-ssr-load-v1","complete":true,"identity":identity,"plan":plan,"driver":{"pid":std::process::id(),"implementation":"rust","version":env!("CARGO_PKG_VERSION"),"rustc":env!("EXACT_RUSTC_VERSION"),"platform":std::env::consts::OS,"runtime":"tokio-current-thread","http":"HTTP/1.1","tracingGc":false},"stages":stages}),
    )
}

fn main() {
    if let Err(error) = owned_main() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

/// The parent owns stdin. EOF cancels all in-flight work by dropping the run and then its runtime.
fn owned_main() -> Result<(), String> {
    emit(&json!({"type":"ready","pid":std::process::id()}))?;
    let mut input = String::new();
    std::io::stdin()
        .lock()
        .take(1_048_577)
        .read_line(&mut input)
        .map_err(|e| e.to_string())?;
    if input.len() > 1_048_576 || !input.ends_with('\n') {
        return Err("Expected a bounded newline-terminated run message".into());
    }
    let message: Value = serde_json::from_str(&input).map_err(|e| e.to_string())?;
    if message["type"] != "run" {
        return Err("Expected run message".into());
    }
    let plan: Plan = serde_json::from_value(message["plan"].clone()).map_err(|e| e.to_string())?;
    let (sender, closed) = tokio::sync::oneshot::channel();
    std::thread::spawn(move || {
        let mut byte = [0];
        let _ = std::io::stdin().read(&mut byte);
        let _ = sender.send(());
    });
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;
    runtime.block_on(async {
        tokio::select! {
            result=run(plan) => emit(&json!({"type":"complete","result":result?})),
            _=closed => Err("Load owner closed stdin".into()),
            _=shutdown_signal() => Err("Load driver cancelled".into()),
        }
    })
}
#[cfg(unix)]
async fn shutdown_signal() {
    let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        .expect("SIGTERM handler");
    tokio::select! { _=term.recv()=>(), _=tokio::signal::ctrl_c()=>() }
}
#[cfg(not(unix))]
async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
