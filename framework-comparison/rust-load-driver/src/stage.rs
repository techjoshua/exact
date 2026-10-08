use crate::{
    plan::{Stage, demand, offset},
    statistics::{Counters, Distributions, Errors, Meter},
    transport::{Observation, Transport, request},
};
use futures_util::{StreamExt, stream::FuturesUnordered};
use serde_json::{Value, json};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

struct Totals {
    whole: Counters,
    interval: Counters,
    distributions: Distributions,
    interval_distributions: Distributions,
    errors: Errors,
    interval_errors: Errors,
    validation: f64,
    interval_validation: f64,
    max_in_flight: usize,
    interval_max_in_flight: usize,
}
impl Totals {
    fn new() -> Self {
        Self {
            whole: Counters::default(),
            interval: Counters::default(),
            distributions: Distributions::default(),
            interval_distributions: Distributions::default(),
            errors: Errors::default(),
            interval_errors: Errors::default(),
            validation: 0.0,
            interval_validation: 0.0,
            max_in_flight: 0,
            interval_max_in_flight: 0,
        }
    }
    fn add(&mut self, edit: impl Fn(&mut Counters)) {
        edit(&mut self.whole);
        edit(&mut self.interval);
    }
    fn record(&mut self, index: usize, ms: f64) {
        self.distributions.record(index, ms);
        self.interval_distributions.record(index, ms);
    }
    fn started(&mut self, active: usize) {
        self.add(|c| {
            c.offered += 1;
            c.started += 1;
        });
        self.max_in_flight = self.max_in_flight.max(active);
        self.interval_max_in_flight = self.interval_max_in_flight.max(active);
    }
    /// Records transport completion before validation time, including admitted work that drains after cutoff.
    fn completed(
        &mut self,
        response: &Observation,
        scheduled: Instant,
        start: Instant,
        deadline: Instant,
    ) {
        self.add(|c| {
            c.completed += 1;
            if response.completed <= deadline {
                c.completed_during_admission += 1;
            }
            if response.error.is_some() {
                c.errors += 1;
                if response.invalid {
                    c.invalid += 1;
                }
                if response.error.as_deref() == Some("LOAD_TIMEOUT") {
                    c.timeouts += 1;
                }
            } else {
                c.valid += 1;
            }
        });
        self.record(0, ms(response.completed.duration_since(response.issued)));
        self.record(1, ms(response.completed.duration_since(scheduled)));
        self.record(3, ms(response.issued.duration_since(scheduled)));
        if let Some(ttfb) = response.ttfb_ms {
            self.record(2, ttfb);
        }
        self.validation += response.validation_ms;
        self.interval_validation += response.validation_ms;
        if let Some(code) = &response.error {
            let details = json!({"code":code,"offsetMs":ms(response.completed.duration_since(start)),"status":response.status});
            self.errors.record(code, details.clone());
            self.interval_errors.record(code, details);
        }
    }
    fn emit(
        &mut self,
        s: &Stage,
        start: Instant,
        last: &mut Instant,
        active: usize,
        final_row: bool,
        meter: &mut Meter,
    ) -> Result<Value, String> {
        let now = Instant::now();
        let mut row = serde_json::to_value(&self.interval).map_err(|e| e.to_string())?;
        let object = row.as_object_mut().unwrap();
        object.extend(
            json!({"stage":s.name,
        "final":final_row,
        "offsetMs":ms(now.duration_since(start)),
        "elapsedMs":ms(now.duration_since(*last)),
        "errorDetails":self.interval_errors.snapshot(),
        "inFlight":active,
        "maxInFlight":self.interval_max_in_flight,
        "validationMs":self.interval_validation,
        "distributions":self.interval_distributions.snapshot(),
        "process":meter.sample()})
            .as_object()
            .unwrap()
            .clone(),
        );
        crate::emit(&json!({"type":"interval","row":row}))?;
        self.interval = Counters::default();
        self.interval_distributions.reset();
        self.interval_errors = Errors::default();
        self.interval_validation = 0.0;
        self.interval_max_in_flight = active;
        *last = now;
        Ok(row)
    }
}
fn ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}
async fn dispatch(
    context: Arc<Transport>,
    body: Vec<u8>,
    scheduled: Instant,
) -> (Observation, Instant) {
    (request(context, body).await, scheduled)
}

/// Owns admission and bounded slots. Arrival ticks never await a response, and cutoff accounts for unsent demand.
pub async fn run(s: &Stage, transport: Arc<Transport>) -> Result<Value, String> {
    let start = Instant::now();
    let started_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let deadline = start + Duration::from_millis(s.duration_ms);
    let mut last = start;
    let mut meter = Meter::new();
    let mut totals = Totals::new();
    let mut rows = Vec::new();
    let limit = if s.mode == "concurrency" {
        s.concurrency.unwrap()
    } else {
        transport.plan.max_in_flight
    };
    let mut free: Vec<Vec<u8>> = (0..limit).map(|_| Vec::new()).collect();
    let mut active = FuturesUnordered::new();
    let mut next = 0_u64;
    let mut admitting = true;
    let mut tick = tokio::time::interval_at(
        (start + Duration::from_secs(1)).into(),
        Duration::from_secs(1),
    );
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut arrival_tick = tokio::time::interval(Duration::from_millis(1));
    arrival_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        let now = Instant::now();
        if admitting && now >= deadline {
            admitting = false;
            if s.mode == "arrival" {
                let remaining =
                    (demand(s, s.duration_ms as f64).ceil() as u64).saturating_sub(next);
                totals.add(|c| {
                    c.offered += remaining;
                    c.missed_deadline += remaining;
                });
            }
        }
        if admitting && s.mode == "concurrency" {
            while let Some(body) = free.pop() {
                if Instant::now() >= deadline {
                    free.push(body);
                    break;
                }
                let scheduled = Instant::now();
                let context = transport.clone();
                active.push(dispatch(context, body, scheduled));
                totals.started(active.len());
            }
        }
        if !admitting && active.is_empty() {
            break;
        }
        tokio::select! {
            Some((response,scheduled))=active.next(), if !active.is_empty() => {
                totals.completed(&response,scheduled,start,deadline);free.push(response.body);
            }
            _=tokio::time::sleep_until(deadline.into()), if admitting => (),
            _=tick.tick() => rows.push(totals.emit(s,start,&mut last,active.len(),false,&mut meter)?),
            _=arrival_tick.tick(), if admitting && s.mode=="arrival" => {
                if Instant::now()>=deadline { continue; }
                let elapsed=ms(start.elapsed()).min(s.duration_ms as f64);
                let due=demand(s,elapsed).ceil() as u64;
                let expired=due.min(demand(s,elapsed-transport.plan.max_lag_ms as f64).ceil() as u64);
                if expired>next { let missed=expired-next;totals.add(|c|{c.offered+=missed;c.missed_lag+=missed;});next=expired; }
                while next<due {
                    let scheduled=start+Duration::from_secs_f64(offset(s,next)/1000.0);next+=1;
                    if let Some(body)=free.pop() {
                        let context=transport.clone();active.push(dispatch(context,body,scheduled));
                        totals.started(active.len());
                    } else { totals.add(|c|{c.offered+=1;c.missed_capacity+=1;}); }
                }
            }
        }
    }
    let elapsed = ms(start.elapsed());
    rows.push(totals.emit(s, start, &mut last, 0, true, &mut meter)?);
    let mut result = serde_json::to_value(s).map_err(|e| e.to_string())?;
    let out = result.as_object_mut().unwrap();
    out.extend(
        serde_json::to_value(&totals.whole)
            .unwrap()
            .as_object()
            .unwrap()
            .clone(),
    );
    out.extend(json!({"startedAt":started_at,
        "elapsedMs":elapsed,
        "admissionMs":s.duration_ms,
        "drainMs":(elapsed-s.duration_ms as f64).max(0.0),
        "errorDetails":totals.errors.snapshot(),
        "maxInFlight":totals.max_in_flight,
        "validationMs":totals.validation,
        "offeredRps":totals.whole.offered as f64/s.duration_ms as f64*1000.0,
        "completedRps":totals.whole.completed as f64/elapsed*1000.0,
        "validRps":totals.whole.valid as f64/elapsed*1000.0,
        "completedDuringAdmissionRps":totals.whole.completed_during_admission as f64/s.duration_ms as f64*1000.0,
        "distributions":totals.distributions.snapshot(),
        "intervals":rows}).as_object().unwrap().clone());
    Ok(result)
}
