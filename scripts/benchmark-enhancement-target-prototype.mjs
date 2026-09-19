import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

// Executable prototype measurement, not a build-script test dependency. It consumes source only.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'packages/component-composition-corpus/src/prototypes');
const bundle = await build({
	stdin: {
		contents:
			"export * from './target-bindings.ts'; export { FragmentPresentationHosts } from '../../../core/src/framework/fragment-hosts.ts';",
		resolveDir: source,
		loader: 'ts'
	},
	bundle: true,
	write: false,
	platform: 'node',
	format: 'esm'
});
const { PrototypeTargetBindings, FragmentPresentationHosts } = await import(
	`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const candidate = { identity: Symbol(), kind: 'fragment', target: {} };
const bindings = new PrototypeTargetBindings();
for (let index = 0; index < 1000; index++)
	bindings.stage('motion', Symbol(), index === 999, index === 999 ? candidate : undefined);
bindings.publish();
const visits = bindings.candidateVisits;
let observed;
const measurements = {};
measurements.retainedReads100000 = measure(() => {
	for (let index = 0; index < 100000; index++) observed = bindings.read('motion');
});
const unrelatedVisits = bindings.candidateVisits - visits;
const slots = Array.from({ length: 1000 }, (_, index) => ({ eligible: index === 999, candidate }));
measurements.referenceScan100000 = measure(() => {
	for (let index = 0; index < 100000; index++) observed = slots.find((slot) => slot.eligible);
});
const owners = Array.from({ length: 32 }, () => ({
	owner: Symbol(),
	props: { className: undefined }
}));
const hosts = new FragmentPresentationHosts();
hosts.reconcile(owners);
measurements.structuralHostPlans1000 = measure(() => {
	for (let index = 0; index < 1000; index++) observed = hosts.reconcile(owners);
});
let retainedHeapDelta = null;
if (globalThis.gc) {
	globalThis.gc();
	const before = process.memoryUsage().heapUsed;
	for (let index = 0; index < 10000; index++) {
		const discarded = new PrototypeTargetBindings();
		discarded.stage('motion', Symbol(), true, candidate);
		discarded.read('motion');
		discarded.dispose();
	}
	globalThis.gc();
	retainedHeapDelta = process.memoryUsage().heapUsed - before;
}
if (!observed || unrelatedVisits !== 0) throw new Error('Prototype performed unexpected discovery');
bindings.dispose();
hosts.dispose();
const report = {
	kind: 'enhancement-target-prototype',
	measuredAt: new Date().toISOString(),
	environment: {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		cpu: os.cpus()[0]?.model
	},
	limitations: [
		'Isolated binding and host-planning algorithms, not compiled application performance.',
		'Reference scan is a cost model, not the previous DOM resolver or a release baseline.',
		'Heap delta is a coarse GC observation, not proof that all renderer resources are released.'
	],
	candidates: 1000,
	additionalCandidateVisitsDuringRetainedReads: unrelatedVisits,
	sharedHostsFor32Contributors: observed.length,
	retainedHeapDelta,
	measurements
};
const directory = path.join(root, '.tmp/enhancement-target-prototype');
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

/** Collects warm samples without asserting noisy wall-clock thresholds in correctness tests. */
function measure(action) {
	for (let index = 0; index < 5; index++) action();
	const samples = [];
	for (let index = 0; index < 11; index++) {
		const start = performance.now();
		action();
		samples.push(performance.now() - start);
	}
	const sorted = [...samples].sort((left, right) => left - right);
	return { samplesMs: samples, medianMs: sorted[5], minMs: sorted[0], maxMs: sorted[10] };
}
