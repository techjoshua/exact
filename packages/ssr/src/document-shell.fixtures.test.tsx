import { createContext, TaskContext, type Child, type Component } from '@exactjs/core';
import { renderToHydratableString } from './index.js';

const ShellContext = createContext<string>('ssr.shell-boundary', { reactive: false });

/** Minimal application isolates invalid shell structure from context requirements. */
export function PlainShellApplication() {
	return () => <main>Application</main>;
}

/** Directly requested documents retain ordinary state publication. */
export function ReactiveDocument(this: Component<{ title: string }>) {
	this.state.title = String('reactive document title');
	return () => (
		<html>
			<head>
				<title>{this.state.title}</title>
			</head>
			<body>Application</body>
		</html>
	);
}
let gate: Promise<void> = Promise.resolve();
let disposed = 0;
let started: Promise<void> = Promise.resolve();
let notifyStarted = () => {};
let rejectTask = (_error: unknown) => {};
let documentReads: string[] = [];

/** Owns the pending application task for one isolated test. */
export function resetShellApplication() {
	disposed = 0;
	documentReads = [];
	started = new Promise<void>((resolve) => {
		notifyStarted = resolve;
	});
	let release!: () => void;
	gate = new Promise<void>((resolve, reject) => {
		release = resolve;
		rejectTask = reject;
	});
	return release;
}

/** Rejects the gated task to exercise cleanup after the document head has committed. */
export function failShellApplication(error: unknown) {
	rejectTask(error);
}

/** Reads application cleanup without exposing renderer implementation state. */
export function shellApplicationDisposals() {
	return disposed;
}

/** Lets cancellation tests wait until the task actually owns resources. */
export function shellApplicationStarted() {
	return started;
}

/** Observes whether a task-owned document read its output before settlement. */
export function taskOwnedDocumentReads() {
	return [...documentReads];
}

function readDocumentValue(value: string) {
	documentReads.push(value);
	if (value === 'pending') throw new Error('Document read an unsettled task value');
	return value;
}

/** A task on the document must settle before the current eager view reads its output. */
export function TaskOwnedDocument(this: Component<{ value: string }>) {
	this.state.value = 'pending';
	this.onUnmount(() => {
		disposed++;
	});
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		notifyStarted();
		await gate;
		this.state.value = 'ready';
	};
	load();
	return () => (
		<html>
			<head>
				<title>Static head</title>
			</head>
			<body>
				<main>{readDocumentValue(this.state.value)}</main>
			</body>
		</html>
	);
}

/** Static intrinsic head can precede this document's task-dependent intrinsic body. */
export function StreamingTaskDocument(this: Component<{ value: string }>) {
	this.state.value = 'pending';
	this.onUnmount(() => {
		disposed++;
	});
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		notifyStarted();
		await gate;
		this.state.value = 'ready';
	};
	load();
	return () => (
		<html>
			<head>
				<title>Static head</title>
				<link rel="stylesheet" href="/app.css" />
			</head>
			<body>
				<main>{this.state.value}</main>
			</body>
		</html>
	);
}

/** The requested application owns its published props, settled state, and inherited context. */
export function ShellApplication(this: Component<{ value: string }>, props: { message: string }) {
	const inherited = this.getContext(ShellContext);
	this.state.value = 'pending';
	this.onUnmount(() => {
		disposed++;
	});
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		notifyStarted();
		await gate;
		this.state.value = props.message + ': ready';
	};
	load();
	return () => (
		<main>
			<h1>{this.state.value}</h1>
			<p>{inherited}</p>
		</main>
	);
}

function ShellSibling(this: Component<{ value: string }>) {
	this.state.value = String('shell sibling state');
	return () => <aside>{this.state.value}</aside>;
}

/** A normal compiled document forwards its opaque children without inspecting their structure. */
export function ApplicationShell(
	this: Component<{ title: string }>,
	props: { children?: Child; title: string }
) {
	this.state.title = String(props.title);
	this.setContext(ShellContext, 'inherited from shell');
	return () => (
		<html>
			<head>
				<title>{this.state.title}</title>
			</head>
			<body>
				<div id="app">{props.children}</div>
				<ShellSibling />
			</body>
		</html>
	);
}

/** Exercises compiler-closed public rendering with a separate enclosing shell. */
export function renderShellApplication(message: string) {
	return renderToHydratableString(<ShellApplication message={message} />, {
		publishRootProps: true,
		documentShell: (application) => (
			<ApplicationShell title="private shell title">{application}</ApplicationShell>
		)
	});
}
