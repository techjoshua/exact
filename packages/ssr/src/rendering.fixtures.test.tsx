import {
	TaskContext,
	createContext,
	createEnhancementNode,
	type AnyAuthoredComponentFunction,
	type Child,
	type Component
} from '@exactjs/core';

declare const _target: AnyAuthoredComponentFunction;

export const contextEnhancementIdentity = '@exactjs/ssr:context-consumer#default';
export const routedEnhancementIdentity = '@exactjs/ssr:routed#default';
export const routedListEnhancementIdentity = '@exactjs/ssr:routed-list#default';
export const suspenseEnhancementIdentity = '@exactjs/ssr:suspense-route#default';
export const RenderingTheme = createContext('ssr enhancement theme');

let observedTone: unknown;
let boundarySetups = 0;
let targetSetups = 0;
let enhancementSetups = 0;
let renderedItems = 0;

/** Resets observations retained by the compiler-backed rendering fixtures. */
export function resetRenderingFixtureState(): void {
	observedTone = undefined;
	boundarySetups = 0;
	targetSetups = 0;
	enhancementSetups = 0;
	renderedItems = 0;
}

/** Reads observations without exposing request component instances. */
export function readRenderingFixtureState(): Readonly<{
	observedTone: unknown;
	boundarySetups: number;
	targetSetups: number;
	enhancementSetups: number;
	renderedItems: number;
}> {
	return { observedTone, boundarySetups, targetSetups, enhancementSetups, renderedItems };
}

/** Compiler-backed enhancement that records one supplied prop. */
export function ToneEnhancement(
	this: Component<{}>,
	props: { children?: Child | Child[]; tone?: string }
) {
	observedTone = props.tone;
	return () => <aside data-enhanced>{props.children}</aside>;
}

/** Compiler-backed structural enhancement. */
export function AsideEnhancement(this: Component<{}>, props: { children?: Child | Child[] }) {
	return () => <aside>{props.children}</aside>;
}

/** Compiler-backed target-forwarding field component. */
export function TargetField(this: Component<{}>, props: { children?: Child | Child[] }) {
	return () => (
		<label className="field">
			<span>Account</span>
			<_target
				className="control shared"
				style={{ color: 'red', paddingTop: '4px' }}
				aria-describedby="description shared"
			>
				{props.children}
			</_target>
			<small id="description">Help</small>
		</label>
	);
}

/** Enhancement consuming context published by the enhanced component. */
export function ContextConsumerEnhancement(
	this: Component<{}>,
	props: { children?: Child | Child[] }
) {
	const theme = this.getContext(RenderingTheme);
	return () => <strong data-theme={theme}>{props.children}</strong>;
}

/** Component publishing context before its boundary enhancement activates. */
export function ContextBoundary(this: Component<{}>) {
	this.setContext(RenderingTheme, 'dark');
	return () => <button>Save</button>;
}

/** Enhancement used to observe bounded root routing setup counts. */
export function RoutedEnhancement(this: Component<{}>, props: { children?: Child | Child[] }) {
	enhancementSetups++;
	return () => <aside data-enhanced>{props.children}</aside>;
}

function RoutedTarget() {
	targetSetups++;
	return () => (
		<main
			__exactEnhancements={createEnhancementNode([
				{ identity: routedEnhancementIdentity, props: {}, root: true }
			])}
		>
			Target
		</main>
	);
}

/** Component whose later nested frame declares the route cut. */
export function RoutedBoundary() {
	boundarySetups++;
	return () => (
		<>
			<button>Fallback</button>
			<RoutedTarget />
		</>
	);
}

/** Enhancement used by the compiler-backed keyed route fixture. */
export function RoutedListEnhancement(this: Component<{}>, props: { children?: Child | Child[] }) {
	return () => <strong>{props.children}</strong>;
}

/** Compiler-backed keyed list containing one designated route root. */
export function RoutedListBoundary(this: Component<{}>) {
	const items = ['first', 'target'] as const;
	return () => (
		<>
			{this.map(
				items,
				(item) => item,
				(item) => {
					renderedItems++;
					return (
						<li
							__exactEnhancements={createEnhancementNode([
								{
									identity: routedListEnhancementIdentity,
									props: {},
									root: item === 'target'
								}
							])}
						>
							{item}
						</li>
					);
				}
			)}
		</>
	);
}

/** Blocking server component used by synchronous and settled Suspense lanes. */
export function AsyncPanel(this: Component<{ label: string }>) {
	this.state.label = '';
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		const label = await Promise.resolve('ready');
		this.state.label = label;
	};
	load();
	return () => <p>{this.state.label}</p>;
}

/** Blocking server component whose selected root receives target contributions. */
export function AsyncTarget(this: Component<{ label: string }>) {
	this.state.label = '';
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		const label = await Promise.resolve('ready');
		this.state.label = label;
	};
	load();
	return () => <p>{this.state.label}</p>;
}

/** Enhancement used by the compiler-backed Suspense route fixture. */
export function SuspenseRouteEnhancement(
	this: Component<{}>,
	props: { children?: Child | Child[] }
) {
	return () => <strong>{props.children}</strong>;
}

/** Blocking component that designates its settled intrinsic as an enhancement root. */
export function EnhancedAsyncPanel(this: Component<{ label: string }>) {
	this.state.label = '';
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		const label = await Promise.resolve('ready');
		this.state.label = label;
	};
	load();
	return () => (
		<p
			__exactEnhancements={createEnhancementNode([
				{ identity: suspenseEnhancementIdentity, props: {}, root: true }
			])}
		>
			{this.state.label}
		</p>
	);
}
