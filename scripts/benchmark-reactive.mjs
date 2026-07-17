import { cpus, platform, release } from "node:os";
import process from "node:process";
import * as reactiveRuntime from "../packages/reactive/dist/index.js";

const {
  batch,
  flushSync,
  reactive,
  registerReactiveListKey,
  watch,
  writeReactive
} = reactiveRuntime;

const size = Number(process.env.EXACT_REACTIVE_BENCH_SIZE ?? 10_000);
const warmups = Number(process.env.EXACT_REACTIVE_BENCH_WARMUPS ?? 3);
const samples = Number(process.env.EXACT_REACTIVE_BENCH_SAMPLES ?? 10);
const encodeProtocol = typeof reactiveRuntime.encodeReactiveProtocolValue === "function"
  ? reactiveRuntime.encodeReactiveProtocolValue
  : value => value;
const decodeProtocol = typeof reactiveRuntime.decodeReactiveProtocolValue === "function"
  ? reactiveRuntime.decodeReactiveProtocolValue
  : value => value;

function records() {
  return Array.from({ length: size }, (_, index) => ({
    id: String(index),
    title: `Task ${index}`,
    detail: { done: false, owner: `Owner ${index % 20}` }
  }));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function observe(state) {
  let renders = 0;
  const stop = watch(() => {
    renders++;
    return state.records.map(record => `${record.title}:${record.detail.done}`).join(",");
  });
  return { get renders() { return renders; }, stop };
}

function keyedState() {
  const state = reactive({ records: records() });
  registerReactiveListKey(state.records, item => item.id, "reactive benchmark", "member:id");
  return state;
}

function timeReconcile(prepare, expectedRenders) {
  const { state, next, assert } = prepare();
  const observation = observe(state);
  const start = performance.now();
  writeReactive(state, ["records"], next);
  flushSync();
  const elapsed = performance.now() - start;
  if (observation.renders !== expectedRenders) {
    throw new Error(`Expected ${expectedRenders} observer runs, received ${observation.renders}`);
  }
  assert?.(state);
  observation.stop();
  return elapsed;
}

const scenarios = [
  {
    name: "unkeyed identical 10k refresh",
    run: () => timeReconcile(() => {
      const original = records();
      const state = reactive({ records: original });
      const retained = state.records[Math.floor(size / 2)];
      return {
        state,
        next: clone(original),
        assert: current => {
          if (current.records[Math.floor(size / 2)] !== retained) throw new Error("Unkeyed identical refresh lost item identity");
        }
      };
    }, 1)
  },
  {
    name: "keyed identical 10k refresh",
    run: () => timeReconcile(() => {
      const state = keyedState();
      const retained = state.records[Math.floor(size / 2)];
      return {
        state,
        next: clone(state.records),
        assert: current => {
          if (current.records[Math.floor(size / 2)] !== retained) throw new Error("Keyed identical refresh lost item identity");
        }
      };
    }, 1)
  },
  {
    name: "keyed one-item change",
    run: () => timeReconcile(() => {
      const state = keyedState();
      const changedIndex = Math.floor(size / 2);
      const retained = state.records[changedIndex - 1];
      const next = clone(state.records);
      next[changedIndex].title = "Changed";
      return {
        state,
        next,
        assert: current => {
          if (current.records[changedIndex].title !== "Changed") throw new Error("One-item change was not applied");
          if (current.records[changedIndex - 1] !== retained) throw new Error("One-item change lost adjacent identity");
        }
      };
    }, 2)
  },
  {
    name: "keyed one-percent change",
    run: () => timeReconcile(() => {
      const state = keyedState();
      const next = clone(state.records);
      for (let index = 0; index < size; index += 100) next[index].detail.done = true;
      return {
        state,
        next,
        assert: current => {
          if (!current.records[0].detail.done || current.records[1].detail.done) throw new Error("One-percent change was not applied precisely");
        }
      };
    }, 2)
  },
  {
    name: "keyed 10k rotation",
    run: () => timeReconcile(() => {
      const state = keyedState();
      const first = state.records[0];
      const next = clone(state.records);
      next.unshift(next.pop());
      return {
        state,
        next,
        assert: current => {
          if (current.records[1] !== first || current.records[0].id !== String(size - 1)) throw new Error("Rotation lost keyed identity or order");
        }
      };
    }, 2)
  },
  {
    name: "keyed add-delete",
    run: () => timeReconcile(() => {
      const state = keyedState();
      const retained = state.records[100];
      const next = clone(state.records.slice(100));
      for (let index = 0; index < 100; index++) {
        next.push({ id: `new-${index}`, title: `New ${index}`, detail: { done: false, owner: "New" } });
      }
      return {
        state,
        next,
        assert: current => {
          if (current.records.length !== size || current.records[0] !== retained || current.records.at(-1).id !== "new-99") {
            throw new Error("Add-delete reconciliation produced the wrong collection");
          }
        }
      };
    }, 2)
  },
  {
    name: "local mutation then matching fetch",
    run: () => {
      const state = keyedState();
      const observation = observe(state);
      const index = Math.floor(size / 2);
      const retained = state.records[index];
      const next = clone(state.records);
      next[index].detail.done = true;
      const start = performance.now();
      state.records[index].detail.done = true;
      flushSync();
      writeReactive(state, ["records"], next);
      flushSync();
      const elapsed = performance.now() - start;
      if (observation.renders !== 2 || state.records[index] !== retained) {
        throw new Error("Matching fetch after a local mutation notified twice or lost identity");
      }
      observation.stop();
      return elapsed;
    }
  },
  {
    name: "100 local mutations then matching fetch",
    run: () => {
      const state = keyedState();
      const observation = observe(state);
      const retained = state.records[1];
      const next = clone(state.records);
      for (let index = 0; index < size; index += 100) next[index].detail.done = true;
      const start = performance.now();
      batch(() => {
        for (let index = 0; index < size; index += 100) state.records[index].detail.done = true;
      });
      flushSync();
      writeReactive(state, ["records"], next);
      flushSync();
      const elapsed = performance.now() - start;
      if (observation.renders !== 2 || state.records[1] !== retained) {
        throw new Error("Matching fetch after batched mutations notified twice or lost identity");
      }
      observation.stop();
      return elapsed;
    }
  },
  {
    name: "keyed protocol roundtrip",
    run: () => {
      const state = keyedState();
      const start = performance.now();
      const encoded = encodeProtocol(state.records);
      const json = JSON.stringify(encoded);
      const decoded = decodeProtocol(JSON.parse(json));
      const elapsed = performance.now() - start;
      if (!Array.isArray(decoded) || decoded.length !== size || decoded[Math.floor(size / 2)].id !== String(Math.floor(size / 2))) {
        throw new Error("Protocol roundtrip changed keyed collection data");
      }
      return { elapsed, bytes: Buffer.byteLength(json) };
    }
  }
];

const results = [];
for (const scenario of scenarios) {
  for (let index = 0; index < warmups; index++) scenario.run();
  const timings = [];
  const byteSamples = [];
  for (let index = 0; index < samples; index++) {
    const result = scenario.run();
    if (typeof result === "number") timings.push(result);
    else {
      timings.push(result.elapsed);
      if (result.bytes !== undefined) byteSamples.push(result.bytes);
    }
  }
  timings.sort((left, right) => left - right);
  const median = percentile(timings, 0.5);
  const p95 = percentile(timings, 0.95);
  const bytes = byteSamples.length ? Math.round(byteSamples.reduce((sum, value) => sum + value, 0) / byteSamples.length) : undefined;
  results.push({ name: scenario.name, medianMs: median, p95Ms: p95, ...(bytes === undefined ? {} : { bytes }) });
  console.log(`${scenario.name}: median ${median.toFixed(2)}ms; p95 ${p95.toFixed(2)}ms${bytes === undefined ? "" : `; ${bytes} bytes`}`);
}

const report = {
  environment: {
    node: process.version,
    platform: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    size,
    warmups,
    samples
  },
  results
};
console.log(`REACTIVE_BENCHMARK_JSON=${JSON.stringify(report)}`);

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}
