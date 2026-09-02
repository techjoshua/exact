import { createContext, type Component, TaskContext } from '@exactjs/core';

export const ResumptionStatus = createContext<{ message: string }>('status');

let searchRuns = 0;
let statusRuns = 0;

/** Compiled state contract used by compact wire-index tests. */
export function ResumableCounter(this: Component<{ label: string }>) {
	this.state.label = authoredInitialValue('client');
	return () => <p>{this.state.label}</p>;
}

/** First compiled state contract used to verify per-type activation ordering. */
export function ResumableFirst(this: Component<{ label: string }>) {
	this.state.label = authoredInitialValue('first');
	return () => <p>{this.state.label}</p>;
}

/** Second compiled state contract used to verify per-type activation ordering. */
export function ResumableSecond(this: Component<{ label: string }>) {
	this.state.label = authoredInitialValue('second');
	return () => <p>{this.state.label}</p>;
}

// These fixtures intentionally retain a resumption contract so resolver tests can inject values
// that differ from setup. Ordinary primitive defaults are correctly classified reconstructible.
function authoredInitialValue(value: string): string {
	return value;
}

function InitialPage(this: Component<{ label: string }>) {
	this.state.label = 'initial';
	return () => <p>{this.state.label}</p>;
}

function NavigatedPage(this: Component<{ label: string }>) {
	this.state.label = 'navigated';
	return () => <p>{this.state.label}</p>;
}

function PreHydrationShell(this: Component<{}>, props: { route: 'initial' | 'navigated' }) {
	return () => (props.route === 'initial' ? <InitialPage /> : <NavigatedPage />);
}

function ResumableSearch(this: Component<{ query: string; result: string }>) {
	this.state.query = 'first';
	this.state.result = 'waiting';
	const load = async (query: string) => {
		searchRuns++;
		await Promise.resolve();
		this.state.result = query.toUpperCase();
	};
	load(this.state.query);
	return () => (
		<section>
			<button onClick={() => (this.state.query = 'second')}>Change</button>
			<output>{this.state.result}</output>
		</section>
	);
}

function ResumptionConsumer(this: Component<{}>) {
	return () => <output>{this.getContext(ResumptionStatus).message}</output>;
}

function ResumptionProvider(this: Component<{ published: boolean }>) {
	this.state.published = false;
	const publishStatus = async (_task: TaskContext = TaskContext.latest()) => {
		void _task.signal;
		statusRuns++;
		await Promise.resolve();
		this.state.published = true;
		this.setContext(ResumptionStatus, { message: 'ready' });
	};
	publishStatus();
	return () => <ResumptionConsumer />;
}

function BuildMismatchRoot(this: Component<{}>) {
	return () => <p>server</p>;
}

/** Compiler-issued initial and navigation roots. */
export const initialPageRoot = <InitialPage />;
export const navigatedPageRoot = <NavigatedPage />;

/** Target-paired roots for a route change before adoption. */
export const prerenderedShellRoot = <PreHydrationShell route="initial" />;
export const navigatedShellRoot = <PreHydrationShell route="navigated" />;

/** Target-paired resumable task and context roots. */
export const resumableSearchRoot = <ResumableSearch />;
export const resumptionProviderRoot = <ResumptionProvider />;

/** Compiler-issued root used before immutable-build validation rejects adoption. */
export const buildMismatchRoot = <BuildMismatchRoot />;

export function readSearchRuns(): number {
	return searchRuns;
}

export function readStatusRuns(): number {
	return statusRuns;
}
