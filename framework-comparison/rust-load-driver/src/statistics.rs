use hdrhistogram::Histogram;
use serde::Serialize;
use serde_json::{Value, json};
use std::{collections::BTreeMap, time::Instant};

#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counters {
    pub offered: u64,
    pub started: u64,
    pub completed: u64,
    pub completed_during_admission: u64,
    pub valid: u64,
    pub invalid: u64,
    pub errors: u64,
    pub timeouts: u64,
    pub missed_lag: u64,
    pub missed_capacity: u64,
    pub missed_deadline: u64,
}

pub struct Distributions([Histogram<u64>; 4]);
impl Default for Distributions {
    fn default() -> Self {
        Self(std::array::from_fn(|_| {
            Histogram::new_with_bounds(1, 3_600_000_000, 3).unwrap()
        }))
    }
}
impl Distributions {
    /// Uses bounded microsecond histograms with the same quantization and clamping as the Node driver.
    pub fn record(&mut self, index: usize, ms: f64) {
        self.0[index]
            .record((ms * 1000.0).round().clamp(1.0, 3_600_000_000.0) as u64)
            .unwrap();
    }
    pub fn snapshot(&self) -> Value {
        let mut object = serde_json::Map::new();
        for (name, h) in [
            "responseMs",
            "scheduledResponseMs",
            "ttfbMs",
            "schedulingLagMs",
        ]
        .iter()
        .zip(&self.0)
        {
            object.insert((*name).into(), if h.is_empty() { json!({"count":0,"mean":null,"p50":null,"p75":null,"p95":null,"p99":null,"max":null}) }
                else { json!({"count":h.len(),"mean":h.mean()/1000.0,"p50":h.value_at_quantile(0.5) as f64/1000.0,"p75":h.value_at_quantile(0.75) as f64/1000.0,"p95":h.value_at_quantile(0.95) as f64/1000.0,"p99":h.value_at_quantile(0.99) as f64/1000.0,"max":h.max() as f64/1000.0}) });
        }
        Value::Object(object)
    }
    pub fn reset(&mut self) {
        for h in &mut self.0 {
            h.reset();
        }
    }
}

#[derive(Default)]
pub struct Errors {
    total: u64,
    counts: BTreeMap<String, u64>,
    samples: Vec<Value>,
}
impl Errors {
    /// Bounds distinct error codes and samples, including failure storms, without retaining bodies.
    pub fn record(&mut self, code: &str, details: Value) {
        self.total += 1;
        let key = if self.counts.contains_key(code) || self.counts.len() < 32 {
            code
        } else {
            "OTHER"
        };
        *self.counts.entry(key.into()).or_default() += 1;
        if self.samples.len() < 32 {
            self.samples.push(details);
        }
    }
    pub fn snapshot(&self) -> Value {
        json!({"total":self.total,"counts":self.counts,"samples":self.samples,"omittedSamples":self.total-self.samples.len() as u64})
    }
}

pub struct Meter {
    previous: Instant,
    cpu: Option<f64>,
}
impl Meter {
    pub fn new() -> Self {
        Self {
            previous: Instant::now(),
            cpu: cpu_ms(),
        }
    }
    /// Reports process CPU when supported. Node event-loop and GC observations are explicitly unavailable.
    pub fn sample(&mut self) -> Value {
        let elapsed = self.previous.elapsed().as_secs_f64() * 1000.0;
        let cpu = cpu_ms();
        let spent = cpu.zip(self.cpu).map(|(now, old)| now - old);
        self.previous = Instant::now();
        self.cpu = cpu;
        json!({"pid":std::process::id(),"elapsedMs":elapsed,"cpuMs":spent,"cpuPercentOfOneCore":spent.map(|ms|100.0*ms/elapsed),"eventLoopUtilization":null,"eventLoopP99Ms":null,"gcAvailable":false,"gcCount":null,"gcMs":null})
    }
}
#[cfg(unix)]
fn cpu_ms() -> Option<f64> {
    let mut usage = std::mem::MaybeUninit::<libc::rusage>::uninit();
    // getrusage writes the complete output structure on success. No references alias this storage.
    if unsafe { libc::getrusage(libc::RUSAGE_SELF, usage.as_mut_ptr()) } != 0 {
        return None;
    }
    let usage = unsafe { usage.assume_init() };
    Some(
        (usage.ru_utime.tv_sec + usage.ru_stime.tv_sec) as f64 * 1000.0
            + (usage.ru_utime.tv_usec + usage.ru_stime.tv_usec) as f64 / 1000.0,
    )
}
#[cfg(not(unix))]
fn cpu_ms() -> Option<f64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn error_storm_is_bounded() {
        let mut e = Errors::default();
        for i in 0..1000 {
            e.record(&format!("E{i}"), json!({"code":i}));
        }
        let s = e.snapshot();
        assert_eq!(s["total"], 1000);
        assert_eq!(s["omittedSamples"], 968);
        assert_eq!(s["counts"].as_object().unwrap().len(), 33);
        assert_eq!(
            s["counts"]
                .as_object()
                .unwrap()
                .values()
                .map(|v| v.as_u64().unwrap())
                .sum::<u64>(),
            1000
        );
    }
}
