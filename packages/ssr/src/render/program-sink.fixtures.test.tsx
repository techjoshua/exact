import { TaskContext, type Component } from '@exactjs/core';

let gate: Promise<void> = Promise.resolve();
let release = () => {};
let disposals = 0;
let starts = 0;

/** Starts an isolated scheduled-body fixture and returns its settlement control. */
export function resetSinkFixture() {
	disposals = 0;
	starts = 0;
	gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	return () => release();
}

/** Reads completed lifecycle cleanup for the current fixture request. */
export function sinkFixtureDisposals() {
	return disposals;
}

/** Reads acquired component owners so cancellation can assert balanced cleanup. */
export function sinkFixtureStarts() {
	return starts;
}

function PendingBody(this: Component<{ value: string }>) {
	starts++;
	this.state.value = 'Waiting';
	this.onUnmount(() => {
		disposals++;
	});
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		await gate;
		this.state.value = 'Ready';
	};
	load();
	return () => <em>{this.state.value}</em>;
}

/** Authored full document whose static head precedes a scheduled body component. */
export function SinkDocument() {
	return () => (
		<html>
			<head>
				<title>Sink fixture</title>
				<link rel="stylesheet" href="/app.css" />
			</head>
			<body>
				<p>Before</p>
				<PendingBody />
				<p>After</p>
			</body>
		</html>
	);
}

/** Mixed transparent and intrinsic boundaries around scheduled component output. */
export function SinkFragments() {
	return () => (
		<>
			<span>Prefix</span>
			<article>
				<PendingBody />
			</article>
			<span>Tail</span>
		</>
	);
}

function SynchronousBody(this: Component<{ value: string }>) {
	starts++;
	this.state.value = 'Ready';
	this.onUnmount(() => {
		disposals++;
	});
	return () => <em>{this.state.value}</em>;
}

/** Synchronous child boundaries remain owned by the enclosing compiled document. */
export function SynchronousSinkDocument() {
	return () => (
		<html>
			<head>
				<title>Synchronous sink fixture</title>
			</head>
			<body>
				<p>Before</p>
				<SynchronousBody />
				<p>After</p>
			</body>
		</html>
	);
}

/** Large authored body exercises repeated transport demand without pending application tasks. */
export function BufferedSinkDocument(props: { content: string }) {
	return () => (
		<html>
			<head>
				<title>Buffered body</title>
			</head>
			<body>
				<main>{props.content}</main>
			</body>
		</html>
	);
}
