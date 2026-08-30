import {
	ErrorBoundary,
	ErrorContext,
	createErrorContext,
	type Component,
	type ErrorReport
} from '@exactjs/core';

let replacement: Component<{ asButton: boolean }> | undefined;
let eventBoundary: Component<{ errors: ErrorReport[] }> | undefined;
let directBoundary: Component<{ errors: ErrorReport[] }> | undefined;
let parentBoundary: Component<{ errors: ErrorReport[] }> | undefined;
let childBoundary: Component<{ errors: ErrorReport[] }> | undefined;
let constructionBoundary: Component<{ errors: ErrorReport[] }> | undefined;
let replacingHandler: Component<{ mode: 'a' | 'b' }> | undefined;
let removingHandler: Component<{ enabled: boolean }> | undefined;
let retryShouldFail = true;
let retryConstructions = 0;
let customReset: (() => void) | undefined;

/** Observable event and release counts for the compiled fixture. */
export const eventCounts = {
	replaced: 0,
	first: 0,
	second: 0,
	removable: 0
};

/** Resets event fixture observations. */
export function resetEventErrorFixtures() {
	eventCounts.replaced = 0;
	eventCounts.first = 0;
	eventCounts.second = 0;
	eventCounts.removable = 0;
	retryShouldFail = true;
	retryConstructions = 0;
	customReset = undefined;
}

/** Compiler-backed delegated-listener replacement fixture. */
export function DelegatedReplacement(this: Component<{ asButton: boolean }>) {
	replacement = this;
	this.state.asButton = true;
	return () =>
		this.state.asButton ? (
			<button onClick={() => eventCounts.replaced++}>Old</button>
		) : (
			<span>New</span>
		);
}

/** Reads the delegated-listener replacement instance. */
export function delegatedReplacementInstance() {
	if (!replacement) throw new Error('DelegatedReplacement is not mounted');
	return replacement;
}

/** Compiler-backed delegated event error boundary. */
export function EventFailureBoundary(this: Component<{ errors: ErrorReport[] }>) {
	eventBoundary = this;
	this.state.errors = [];
	this.setContext(ErrorContext, createErrorContext(this.state.errors));
	return () =>
		this.state.errors.length ? (
			<p>Recovered</p>
		) : (
			<button
				onClick={() => {
					throw new Error('click failed');
				}}
			>
				Break
			</button>
		);
}

/** Reads the delegated event error boundary instance. */
export function eventFailureBoundaryInstance() {
	if (!eventBoundary) throw new Error('EventFailureBoundary is not mounted');
	return eventBoundary;
}

/** Compiler-backed direct event error boundary. */
export function DirectEventFailureBoundary(this: Component<{ errors: ErrorReport[] }>) {
	directBoundary = this;
	this.state.errors = [];
	this.setContext(ErrorContext, createErrorContext(this.state.errors));
	return () =>
		this.state.errors.length ? (
			<p>Recovered</p>
		) : (
			<input
				onFocus={() => {
					throw new Error('focus failed');
				}}
			/>
		);
}

/** Reads the direct event error boundary instance. */
export function directEventFailureBoundaryInstance() {
	if (!directBoundary) throw new Error('DirectEventFailureBoundary is not mounted');
	return directBoundary;
}

function NestedChildBoundary(this: Component<{ errors: ErrorReport[] }>) {
	childBoundary = this;
	this.state.errors = [];
	this.setContext(ErrorContext, createErrorContext(this.state.errors));
	return () =>
		this.state.errors.length ? (
			<p>Child recovered</p>
		) : (
			<button
				onClick={() => {
					throw new Error('child failed');
				}}
			>
				Break child
			</button>
		);
}

/** Compiler-backed nested error boundary fixture. */
export function NestedParentBoundary(this: Component<{ errors: ErrorReport[] }>) {
	parentBoundary = this;
	this.state.errors = [];
	this.setContext(ErrorContext, createErrorContext(this.state.errors));
	return () =>
		this.state.errors.length ? (
			<p>Parent recovered</p>
		) : (
			<section>
				<NestedChildBoundary />
			</section>
		);
}

/** Reads the nested parent and child boundary instances. */
export function nestedBoundaryInstances() {
	if (!parentBoundary || !childBoundary) throw new Error('Nested boundaries are not mounted');
	return [parentBoundary, childBoundary] as const;
}

function ConstructionFailureChild() {
	throw new Error('construct failed');
	return () => null;
}

/** Compiler-backed child construction error boundary. */
export function ConstructionFailureBoundary(this: Component<{ errors: ErrorReport[] }>) {
	constructionBoundary = this;
	this.state.errors = [];
	this.setContext(ErrorContext, createErrorContext(this.state.errors));
	return () =>
		this.state.errors.length ? (
			<p>Child failed</p>
		) : (
			<section>
				<ConstructionFailureChild />
			</section>
		);
}

/** Reads the construction failure boundary instance. */
export function constructionFailureBoundaryInstance() {
	if (!constructionBoundary) throw new Error('ConstructionFailureBoundary is not mounted');
	return constructionBoundary;
}

function RetryChild() {
	retryConstructions++;
	if (retryShouldFail) throw new Error('construct failed');
	return () => <p>Recovered</p>;
}

/** Compiler-backed default ErrorBoundary retry fixture. */
export function DefaultRetryBoundary() {
	return () => (
		<ErrorBoundary>
			<RetryChild />
		</ErrorBoundary>
	);
}

/** Allows the next default-boundary retry to construct successfully. */
export function allowRetrySuccess() {
	retryShouldFail = false;
}

/** Reports retry-child construction attempts. */
export function retryConstructionCount() {
	return retryConstructions;
}

function CustomBoundaryBroken() {
	return () => (
		<button
			onClick={() => {
				throw new Error('event failed');
			}}
		>
			Break
		</button>
	);
}

/** Compiler-backed custom ErrorBoundary fallback fixture. */
export function CustomFallbackBoundary() {
	return () => (
		<ErrorBoundary
			fallback={({ error, reset }) => {
				customReset = reset;
				return (
					<p>
						{error.source}:{String(error.error)}
					</p>
				);
			}}
		>
			<CustomBoundaryBroken />
		</ErrorBoundary>
	);
}

/** Resets the custom ErrorBoundary fixture. */
export function resetCustomFallback() {
	if (!customReset) throw new Error('Custom fallback reset is unavailable');
	customReset();
}

function NestedFallbackBroken() {
	return () => (
		<button
			onClick={() => {
				throw new Error('child failed');
			}}
		>
			Break
		</button>
	);
}

/** Compiler-backed nested failing-fallback fixture. */
export function NestedFailingFallbackBoundary() {
	return () => (
		<ErrorBoundary fallback={({ error }) => <p>Outer: {String(error.error)}</p>}>
			<ErrorBoundary
				fallback={() => {
					throw new Error('fallback failed');
				}}
			>
				<NestedFallbackBroken />
			</ErrorBoundary>
		</ErrorBoundary>
	);
}

/** Compiler-backed delegated-handler update fixture. */
export function ReplacingEventHandler(this: Component<{ mode: 'a' | 'b' }>) {
	replacingHandler = this;
	this.state.mode = 'a';
	return () => (
		<button
			onClick={this.state.mode === 'a' ? () => eventCounts.first++ : () => eventCounts.second++}
		>
			Click
		</button>
	);
}

/** Reads the delegated-handler update instance. */
export function replacingEventHandlerInstance() {
	if (!replacingHandler) throw new Error('ReplacingEventHandler is not mounted');
	return replacingHandler;
}

/** Compiler-backed delegated-handler removal fixture. */
export function RemovingEventHandler(this: Component<{ enabled: boolean }>) {
	removingHandler = this;
	this.state.enabled = true;
	return () => (
		<button onClick={this.state.enabled ? () => eventCounts.removable++ : undefined}>Click</button>
	);
}

/** Reads the delegated-handler removal instance. */
export function removingEventHandlerInstance() {
	if (!removingHandler) throw new Error('RemovingEventHandler is not mounted');
	return removingHandler;
}
