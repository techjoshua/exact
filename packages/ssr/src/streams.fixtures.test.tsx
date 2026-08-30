/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes enhancement namespace bindings from JSX attributes. */
import { TaskContext, type Component } from '@exactjs/core';
import * as stream from './stream-enhancements.fixtures.test.js' with { type: 'exact-enhancement' };

type ControlledTextProps = Readonly<{
	initial: string;
	settled: string;
}>;

let controlledReady: Promise<void> = Promise.resolve();
let routedTargetSetups = 0;

/** Supplies the next scheduled fixture's externally controlled settlement. */
export function configureControlledText(ready: Promise<void>): void {
	controlledReady = ready;
}

/** Resets setup observations for the compiled routed-stream fixture. */
export function resetRoutedStreamFixture(): void {
	routedTargetSetups = 0;
}

/** Reads setup observations without exposing the component instance. */
export function readRoutedStreamTargetSetups(): number {
	return routedTargetSetups;
}

/** Compiler-produced component used directly as an opaque component receipt. */
export function ReceiptStreamRoot() {
	return () => <p>receipt stream</p>;
}

function StreamTarget() {
	routedTargetSetups++;
	return () => <main stream:routed stream:root />;
}

/** Compiler-produced boundary with a nested designated enhancement root. */
export function RoutedStreamBoundary() {
	return () => (
		<>
			<header />
			<StreamTarget />
		</>
	);
}

/** Compiler-produced call site applying the routed enhancement to its component boundary. */
export function RoutedStreamPage() {
	return () => <RoutedStreamBoundary stream:routed />;
}

/** Compiled scheduled component controlled by an external test promise. */
export function ControlledText(this: Component<{ value: string }>, props: ControlledTextProps) {
	this.state.value = props.initial;
	const settle = async (_task: TaskContext = TaskContext.server().blocking()) => {
		await controlledReady;
		this.state.value = props.settled;
	};
	settle();
	return () => <p>{this.state.value}</p>;
}

/** Compiled lazy stream fixture with a section shell. */
export function LazySection(props: { constructed(): void }) {
	props.constructed();
	return () => (
		<section>
			<p>streamed</p>
		</section>
	);
}

/** Compiled lazy stream fixture with a paragraph root. */
export function LazyParagraph(props: { constructed(): void }) {
	props.constructed();
	return () => <p>lazy</p>;
}
