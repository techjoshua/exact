import { TimeWindowProbe } from './time-plan.js';
import { FormBindingProbe } from './form-binding.js';
import { IntlNumericRangeProbe } from './intl-numeric-range.js';
import { NamespaceProbe } from './render-namespace.js';
import { KeyedSpreadWorkbench } from './keyed-spread-updates.js';
import { TargetAttributeOwnershipProbe } from './target-attribute-ownership.js';
import { MutationContractProbe, ServerMutationContractProbe } from './mutation-contract.js';
import { DerivedPatternProbe } from './derived-pattern.js';
import { CollectionProjectionProbe } from './collection-projection.js';
import { HoverProbe, MapProjectionProbe } from './keyed-prop-replacement.js';
import { ClipboardProbe, ClipboardPromiseProbe } from './cancelled-task-catch.js';
import {
	createComponentRegistry,
	createContext,
	createEnhancementNode,
	LocalizationContext,
	TaskContext,
	taskStatus,
	type Child,
	type Component
} from '@exactjs/core';

import {
	createCompiledFragmentReceipt,
	createCompiledComponentReceipt,
	createDeferredServerIntrinsicSpreadReceipt
} from '@exactjs/core/runtime/component-operations';

const FragmentScope = createContext<string>('runtime.fragment-scope', { reactive: false });

/** Native host fixture with ordinary server continuations and stable hydrated DOM. */
export function RuntimePage(
	this: Component<{
		slow: number;
		returned: number;
		localized: string;
		profile: { label: string };
		count: number;
		fragments: string[];
		fragmentStep: number;
		rows: Map<string, { total: number }>;
		selected: Set<string>;
	}>,
	props: { label?: string }
) {
	this.setContext(FragmentScope, 'root');
	this.state.localized = '';
	this.state.profile = { label: 'pending' };
	this.state.count = 0;
	this.state.fragments = ['first', ' / ', 'second 😀'];
	this.state.fragmentStep = 0;
	this.state.slow = 0;
	this.state.returned = 0;
	async function slow(id: string, _task: TaskContext = TaskContext.server()) {
		const response = await fetch('__EXACT_CONTROL__/gate?id=' + id, { signal: _task.signal });
		await response.text();
		this.state.slow = 42;
	}
	this.state.rows = new Map([['first', { total: 0 }]]);
	this.state.selected = new Set(['first']);
	function increment(_task: TaskContext = TaskContext.server()) {
		void _task;
		const field = 'label' as const;
		const previous = this.state.profile[field];
		this.state.profile.label = props.label ?? (previous === 'pending' ? 'native' : previous);
		this.state.count++;
		this.state.localized = new Intl.NumberFormat('en-US').format(1234.5 + this.state.count);
		this.state.rows.set('first', { total: this.state.count });
		this.state.selected.add('updated');
		return this.state.count;
	}
	const local = async (_task: TaskContext = TaskContext.client()) => {
		void _task;
		await Promise.resolve();
	};
	const localStatus = taskStatus(local);
	return () => (
		<section>
			<IntlNumericRangeProbe />
			<FormBindingProbe modal />
			{this.state.count >= 0 &&
				scopedFragment(
					scopedFragment(
						createCompiledComponentReceipt(RuntimeScopeValue, { id: 'fragment-scope' })
					),
					'outer'
				)}
			<RuntimeScopeValue id="fragment-sibling" />
			{this.state.count >= 0 &&
				createDeferredServerIntrinsicSpreadReceipt(
					'span',
					{
						key: 'deferred',
						__exactEnhancements: createEnhancementNode([
							{ identity: 'runtime-scope', props: { value: 'deferred' } }
						])
					},
					() => ({
						id: 'deferred-spread',
						'data-spread': this.state.count === 0 ? 'ready' : 'updated'
					}),
					'ready'
				)}
			<span id="client-status">
				{localStatus.pendingCount}:{localStatus.pending ? 'pending' : 'idle'}
			</span>
			<p id="escaped">{'<script>unsafe</script> café 😀'}</p>
			<p id="scalar-run">{this.state.fragments}</p>
			<button
				id="scalar-change"
				onClick={() => {
					this.state.fragmentStep++;
					this.state.fragments =
						this.state.fragmentStep === 1
							? ['next', ' / ', 'last 😀']
							: this.state.fragmentStep === 2
								? []
								: ['again', '!'];
				}}
			>
				Change scalar run
			</button>
			<input id="draft" value="initial" />
			<button
				id="increment"
				onClick={async () => {
					this.state.returned = await increment();
				}}
			>
				Increment
			</button>
			<button id="slow" onClick={() => slow(window.location.pathname)}>
				Slow
			</button>
			<output id="slow-result">{this.state.slow}</output>
			<output id="profile-label">{this.state.profile.label}</output>
			<span id="intl-initial">{new Intl.NumberFormat('en-US').format(1234.5)}</span>
			<output id="intl-result">{this.state.localized}</output>
			<output id="count">{this.state.count}</output>
			<output id="returned">{this.state.returned}</output>
			<output id="map-total">{this.state.rows.get('first')?.total}</output>
			<output id="set-size">{this.state.selected.size}</output>
			<KeyedSpreadWorkbench path="spread-key" />
			<KeyedSpreadWorkbench path="overwritten-key" />
			<KeyedSpreadWorkbench path="hidden-key" />
			<NamespaceProbe />
			<TimeWindowProbe />
			<HoverProbe />
			<MapProjectionProbe />
			<ClipboardProbe />
			<ClipboardPromiseProbe />
			<CollectionProjectionProbe />
			<DerivedPatternProbe />
			<MutationContractProbe />
			<TargetAttributeOwnershipProbe />
		</section>
	);
}

/** Server-only document keeps the application hydration root independent of shell ownership.
 * @exact server
 */
export function RuntimeShell(
	this: Component<{}>,
	props: { children: Child; gate?: string; unavailable?: boolean }
) {
	this.setContext(LocalizationContext, { locale: 'de-DE', sourceLocale: 'en-US' });
	return () => (
		<html>
			<head>
				<title>Runtime acceptance</title>
			</head>
			<body>
				<ServerMutationContractProbe />
				<output id="server-availability">{props.unavailable ? 'unavailable' : 'available'}</output>
				<main id="root">{props.children}</main>
				<SettledTarget>
					<span id="settled-target">settled contribution</span>
				</SettledTarget>
				{props.gate && <DelayedContent url={props.gate} />}
			</body>
		</html>
	);
}

/** Pending server work makes accidental response buffering observable. */
export async function DelayedContent(this: Component<{ text: string }>, props: { url: string }) {
	const response = await fetch(props.url);
	this.state.text = await response.text();
	return () => <p id="server-delayed">{this.state.text}</p>;
}

/** Server task output must resolve before a contributed attribute is serialized.
 * @exact server
 */
function SettledTarget(this: Component<{ title: string }>) {
	this.state.title = 'pending';
	async function prepare(_task: TaskContext = TaskContext.server().blocking()) {
		void _task;
		await Promise.resolve();
		this.state.title = 'settled';
	}
	prepare();
	return () => <_target title={this.state.title} />;
}

/** Shared registry supplies the same server fallback and client selection. */
export const RuntimeViews = createComponentRegistry(({ lazy }) => ({
	page: lazy(() => import('./Page.js').then((module) => module.RuntimePage))
}));

/** An extracted island owns the resumptions of its component descendants. */
export function RuntimeIsland(this: Component<{}>) {
	this.setContext(LocalizationContext, { locale: 'de-DE', sourceLocale: 'en-US' });
	const Current = RuntimeViews.page;
	return () => <Current />;
}

/** Transparent contributors retain their contexts even when they share a presentation host. */
export function RuntimeScope(this: Component<{}>, props: { value?: string; children?: Child }) {
	const value = props.value ?? readFragmentScope(this);
	this.setContext(FragmentScope, value);
	return () => <_target data-scope={value} />;
}

/** Reads the nearest logical provider independently of presentation wrappers. */
function RuntimeScopeValue(this: Component<{}>, props: { id: string }) {
	return () => createCompiledComponentReceipt(RuntimeScopeBridge, props);
}

/** A second closed forwarding level keeps receipt ownership separate from child markers. */
function RuntimeScopeBridge(this: Component<{}>, props: { id: string }) {
	return () => createCompiledComponentReceipt(RuntimeScopeLeaf, props);
}

/** A marked context consumer beneath an omitted compiled parent retains its server host. */
function RuntimeScopeLeaf(this: Component<{}>, props: { id: string }) {
	const value = readFragmentScope(this);
	return () => <output id={props.id}>{value}</output>;
}

function scopedFragment(child: Child, value?: string): Child {
	return createCompiledFragmentReceipt(
		{
			key: value ?? 'inherited',
			__exactEnhancements: createEnhancementNode([
				{ identity: 'runtime-scope', props: { value } },
				{ identity: 'runtime-scope-peer', props: {} }
			])
		},
		child
	);
}

const deadlineCleanups: { id: string; aborted: boolean }[] = [];
/** Reports owned timeout cleanup independently of the HTTP response. */
export function deadlineState() {
	return deadlineCleanups;
}

/** Gated blocking work proves request limits cancel owned tasks without poisoning the next render. */
export function RuntimeDeadline(this: Component<{ text: string }>, props: { id: string }) {
	this.state.text = 'pending';
	async function prepare(task: TaskContext = TaskContext.server().blocking()) {
		task.cleanup(() => {
			deadlineCleanups.push({ id: props.id, aborted: task.signal.aborted });
		});
		const response = await fetch('__EXACT_CONTROL__/gate?id=' + props.id, { signal: task.signal });
		this.state.text = await response.text();
	}
	prepare();
	return () => <output id="deadline-result">{this.state.text}</output>;
}

/** Reads the inherited scope through ordinary helpers without giving the helper a component this. */
function readFragmentScope(owner: Component<{}>): string {
	const receiver = owner;
	return resolveFragmentScope(receiver);
}

/** Keeps the shared native-host context check on the parameter-forwarding boundary. */
function resolveFragmentScope(owner: Component<{}>): string {
	return owner.getContext(FragmentScope);
}
