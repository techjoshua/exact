import { Suspense, TaskContext, type Component } from '@exactjs/core';

let optionsReady: Promise<void> = Promise.resolve();

/** Supplies the next document Suspense fixture's externally controlled settlement. */
export function configureDocumentOptions(ready: Promise<void>): void {
	optionsReady = ready;
}

/** Compiler-backed root document used to verify document normalization through components. */
export function ExactDocument() {
	return () => (
		<html lang="en">
			<head>
				<title>Exact</title>
			</head>
			<body>
				<main>ready</main>
			</body>
		</html>
	);
}

function InnerDocument() {
	return () => (
		<html>
			<head></head>
			<body>streamed</body>
		</html>
	);
}

/** Compiler-backed component layer around a document root. */
export function LayeredDocument() {
	return () => <InnerDocument />;
}

function SettledOptions(this: Component<{ label: string }>) {
	this.state.label = '';
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		await optionsReady;
		this.state.label = 'Ground';
	};
	load();
	return () => <p>{this.state.label}</p>;
}

/** Compiler-backed scheduled document range used by progressive Suspense. */
export function SuspenseDocument() {
	return () => (
		<main>
			<h1>Shipping</h1>
			<Suspense fallback={<i>Loading</i>}>
				<SettledOptions />
			</Suspense>
		</main>
	);
}

/** Compiler-backed never-settling task used to verify request cancellation. */
export function PendingDocument() {
	const wait = async (task: TaskContext = TaskContext.server().blocking()) =>
		new Promise<void>((_resolve, reject) => {
			task.signal.addEventListener('abort', () => reject(task.signal.reason), { once: true });
		});
	wait();
	return () => <p>Loading</p>;
}
