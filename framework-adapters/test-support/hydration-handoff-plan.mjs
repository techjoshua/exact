import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import inspector from 'node:inspector';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const { entries, evidence, mode } = JSON.parse(process.argv[2]),
	root = process.cwd();
const dom = new JSDOM('<!doctype html><body><div id="app"></div><div id="sibling"></div>', {
	url: 'http://localhost/'
});
for (const name of Object.getOwnPropertyNames(dom.window)) {
	if (name === 'localStorage' || name === 'sessionStorage') continue;
	if (!(name in globalThis))
		try {
			globalThis[name] = dom.window[name];
		} catch {}
}
for (const name of [
	'window',
	'document',
	'Node',
	'NodeFilter',
	'Text',
	'Comment',
	'Document',
	'DocumentFragment',
	'ShadowRoot',
	'Element',
	'HTMLElement',
	'HTMLInputElement',
	'HTMLTextAreaElement',
	'HTMLSelectElement',
	'HTMLOptionElement',
	'HTMLFormElement',
	'HTMLButtonElement',
	'HTMLDialogElement',
	'HTMLScriptElement',
	'SVGElement',
	'MathMLElement',
	'Event',
	'MouseEvent',
	'CustomEvent',
	'MutationObserver',
	'DOMParser',
	'CSSStyleDeclaration'
])
	if (dom.window[name]) globalThis[name] = dom.window[name];
globalThis.__handoff = {
	mode,
	qualifications: [],
	injections: [],
	constructions: [],
	events: [],
	completions: 0,
	errors: []
};
const data = globalThis.__handoff;
const session = new inspector.Session();
session.connect();
const post = (method, params = {}) => {
	let answer, failure;
	session.post(method, params, (error, value) => {
		failure = error;
		answer = value;
	});
	if (failure) throw failure;
	return answer;
};
post('Debugger.enable');
const locations = new Map();
let stepping;
const evaluate = (frame, expression) =>
	post('Debugger.evaluateOnCallFrame', {
		callFrameId: frame.callFrameId,
		expression,
		returnByValue: true
	});
session.on('Debugger.scriptParsed', ({ params }) => {
	if (!params.url.startsWith(pathToFileURL(path.join(root, 'out-client')).href)) return;
	try {
		const source = post('Debugger.getScriptSource', { scriptId: params.scriptId }).scriptSource;
		const add = (needle, kind, start = 0) => {
			const offset = source.indexOf(needle, start);
			if (offset < 0) return;
			const before = source.slice(0, offset),
				lineNumber = before.split('\n').length - 1,
				columnNumber = offset - (before.lastIndexOf('\n') + 1);
			const answer = post('Debugger.setBreakpoint', {
				location: { scriptId: params.scriptId, lineNumber, columnNumber }
			});
			locations.set(answer.breakpointId, kind);
		};
		add('plan.adoptEnhancement(adoption);', 'enqueue');
		add('commitTargetAdoption(this.root, step.entry);', 'target');
		const enhancement = source.indexOf('var StructuralEnhancementAdoption = class');
		if (enhancement >= 0) add('if (!this.mounted.scope.active) return;', 'completion', enhancement);
		const provider = source.indexOf('function ThemeActionEnhancement(props)');
		if (provider >= 0) add('return () =>', 'construct', provider);
	} catch (error) {
		data.errors.push('script observer: ' + error.stack);
	}
});
session.on('Debugger.paused', ({ params }) => {
	try {
		const frame = params.callFrames[0];
		if (stepping) {
			const point = stepping;
			stepping = undefined;
			if (point === 'enqueue') {
				const observation = evaluate(
					frame,
					`(()=>{const q=globalThis.__handoff;const target=plan.steps.find(s=>s.kind==='adopt-target');if(q.active)return null;q.active={plan,root,adoption,target:target?.entry.mounted,provider:adoption.owner};const value={point:'enqueue',pending:plan.pending,current:plan.isCurrent(),saved:plan.enhancementAdoptions.get(adoption.owner)?.includes(adoption)===true,targetChildren:target?.entry.mounted.children.length,queuedButton:target?.entry.nodes.slice(target.entry.start,target.entry.end).some(n=>n===q.originalButton)};q.qualifications.push(value);return value;})()`
				);
				if (observation.exceptionDetails) throw Error(observation.exceptionDetails.text);
				if (mode === 'enqueue-dispose') inject(frame);
			} else {
				const observation = evaluate(
					frame,
					`(()=>{const q=globalThis.__handoff;const value={point:'target',current:this.isCurrent(),pending:this.enhancementAdoptions.get(q.active.provider)?.includes(q.active.adoption)===true,targetChildren:step.entry.mounted.children.length,sameButton:step.entry.mounted.children.some(m=>m.dom===q.originalButton)};q.qualifications.push(value);return value;})()`
				);
				if (observation.exceptionDetails) throw Error(observation.exceptionDetails.text);
				if (mode === 'target-dispose' || mode === 'target-replace') inject(frame);
			}
			post('Debugger.resume');
			return;
		}
		const kind = locations.get(params.hitBreakpoints?.[0]);
		if (kind === 'construct') evaluate(frame, 'globalThis.__handoff.constructions.push(this)');
		if (kind === 'completion')
			evaluate(
				frame,
				'if(this===globalThis.__handoff.active?.adoption)globalThis.__handoff.completions++'
			);
		if (kind === 'enqueue' && !data.active) {
			stepping = 'enqueue';
			post('Debugger.stepOver');
			return;
		}
		if (
			kind === 'target' &&
			evaluate(
				frame,
				'this===globalThis.__handoff.active?.plan && step.entry.mounted===globalThis.__handoff.active?.target'
			).result.value
		) {
			stepping = 'target';
			post('Debugger.stepOver');
			return;
		}
	} catch (error) {
		data.errors.push('pause observer: ' + error.stack);
	}
	post('Debugger.resume');
});
function inject(frame) {
	post('Debugger.setSkipAllPauses', { skip: true });
	try {
		const result = evaluate(
			frame,
			`(()=>{const q=globalThis.__handoff;q.injections.push({mode:q.mode,before:q.active.root.container.innerHTML});if(q.mode==='target-replace'){q.api.replacePage(q.active.root.container);q.replacementButton=q.active.root.container.querySelector('button');}else q.api.unmount(q.active.root.container);q.injections[0].currentAfter=q.active.plan.isCurrent();q.injections[0].htmlAfter=q.active.root.container.innerHTML;})()`
		);
		if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
	} finally {
		post('Debugger.setSkipAllPauses', { skip: false });
	}
}
let client;
try {
	const html = await readFile(path.join(root, 'ssr.html'), 'utf8');
	const host = document.querySelector('#app');
	host.innerHTML = html;
	data.originalButton = host.querySelector('button');
	data.originalList = host.querySelector('.handoff-items');
	data.before = host.innerHTML;
	const api = await import(pathToFileURL(path.resolve(root, entries.client)).href);
	data.api = api;
	const sibling = document.querySelector('#sibling');
	api.replacePage(sibling);
	const siblingButton = sibling.querySelector('button');
	const owner = api.createExactRuntimeInspectionOwner({
		buildKey: 'handoff-observer',
		executionRoot: 'page'
	});
	const publish = owner.publish;
	owner.publish = (input) => {
		data.events.push({ kind: input.kind, component: input.component });
		publish(input);
	};
	const hydration = [];
	client = api.mountPage(host, {
		inspection: owner,
		onHydration: (event) => hydration.push(event),
		onErrorReport: (report) => data.errors.push(String(report))
	});
	await client.whenSettled();
	const active = data.active;
	data.after = host.innerHTML;
	if (mode === 'control') {
		data.originalButton.click();
		await client.whenSettled();
	}
	const beforeDispose = {
		sameButton: host.querySelector('button') === data.originalButton,
		sameList: host.querySelector('.handoff-items') === data.originalList,
		expanded: host.querySelector('button')?.getAttribute('aria-expanded')
	};
	if (mode === 'target-replace') data.replacementButton?.click();
	const replacementBeforeDispose = data.replacementButton?.getAttribute('aria-expanded');
	client.dispose();
	client = undefined;
	siblingButton.click();
	if (mode === 'target-replace') data.replacementButton?.click();
	const result = {
		mode,
		before: data.before,
		after: data.after,
		hydration,
		qualifications: data.qualifications,
		injections: data.injections,
		completions: data.completions,
		errors: data.errors,
		beforeDispose,
		constructions: data.constructions.filter((instance) => instance === active?.provider).length,
		mounts: data.events.filter(
			(event) => event.component === active?.provider && event.kind === 'component.mount'
		).length,
		cleanups: data.events.filter(
			(event) => event.component === active?.provider && event.kind === 'component.unmount'
		).length,
		providerActive: active?.provider?.scope.active,
		planCurrent: active?.plan.isCurrent(),
		pendingCompletions: active?.plan.enhancementAdoptions.size,
		pendingActions: active?.plan.steps.length,
		siblingExpanded: siblingButton.getAttribute('aria-expanded'),
		replacementBeforeDispose,
		replacementRetained:
			!!data.replacementButton &&
			active.root.container.querySelector('button') === data.replacementButton,
		replacementExpanded: data.replacementButton?.getAttribute('aria-expanded'),
		afterDispose: host.innerHTML
	};
	if (evidence) {
		await mkdir(evidence, { recursive: true });
		await writeFile(path.join(evidence, 'plan-' + mode + '.json'), JSON.stringify(result, null, 2));
	}
	assert.deepEqual(result.errors, []);
	assert.ok(
		result.qualifications.some(
			(q) =>
				q.point === 'enqueue' &&
				q.pending &&
				q.current &&
				q.saved &&
				q.targetChildren === 0 &&
				q.queuedButton
		),
		'Actual pending Target branch was not qualified'
	);
	assert.equal(result.constructions, 1);
	assert.equal(result.cleanups, 1);
	assert.equal(result.providerActive, false);
	assert.equal(result.pendingCompletions, 0);
	assert.equal(result.pendingActions, 0);
	if (mode === 'control') {
		assert.equal(result.completions, 1);
		assert.equal(result.mounts, 1);
		assert.equal(hydration[0]?.outcome, 'adopted');
		assert.equal(result.beforeDispose.sameButton, true);
		assert.equal(result.beforeDispose.sameList, true);
	} else {
		assert.equal(result.injections.length, 1);
		assert.equal(result.injections[0].currentAfter, false);
		assert.equal(result.completions, 0);
		assert.equal(result.mounts, 0);
		assert.deepEqual(hydration, []);
	}
	if (mode === 'target-replace') {
		assert.equal(result.replacementRetained, true);
		assert.equal(result.replacementBeforeDispose, 'true');
		assert.equal(result.replacementExpanded, 'true');
		api.unmount(active.root.container);
	}
	assert.equal(result.siblingExpanded, 'true');
	api.unmount(sibling);
	console.log('Qualified packaged plan control passed: ' + mode);
} finally {
	client?.dispose();
	session.disconnect();
	dom.window.close();
}
