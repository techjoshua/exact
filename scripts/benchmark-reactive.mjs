import { flushSync, reactive, watch, writeReactive } from "../packages/reactive/dist/index.js";

const records = Array.from({ length: 10_000 }, (_, id) => ({ id: String(id), title: `Task ${id}` }));
const state = reactive({ records });
let renders = 0;
watch(() => {
  renders++;
  return state.records.map(record => record.title).join(",");
});

const start = performance.now();
writeReactive(state, ["records"], JSON.parse(JSON.stringify(records)));
flushSync();
const elapsed = performance.now() - start;

if (renders !== 1) throw new Error(`Identical 10k refresh triggered ${renders - 1} unexpected observer runs`);
if (elapsed > 1_000) throw new Error(`Identical 10k refresh exceeded 1000ms budget (${elapsed.toFixed(1)}ms)`);
console.log(`identical 10k refresh: ${elapsed.toFixed(1)}ms; observer runs: ${renders}`);
