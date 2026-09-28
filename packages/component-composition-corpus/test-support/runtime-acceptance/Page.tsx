import {
	createComponentRegistry,
	TaskContext,
	taskStatus,
	type Child,
	type Component
} from '@exactjs/core';

/** Native host fixture with ordinary server continuations and stable hydrated DOM. */
export function RuntimePage(
	this: Component<{
		slow: number;
		returned: number;
		profile: { label: string };
		count: number;
		rows: Map<string, { total: number }>;
		selected: Set<string>;
	}>,
	props: { label?: string }
) {
	this.state.profile = { label: 'pending' };
	this.state.count = 0;
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
		this.state.profile.label = props.label ?? 'native';
		this.state.count++;
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
			<span id="client-status">
				{localStatus.pendingCount}:{localStatus.pending ? 'pending' : 'idle'}
			</span>
			<p id="escaped">{'<script>unsafe</script> café 😀'}</p>
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
			<output id="count">{this.state.count}</output>
			<output id="returned">{this.state.returned}</output>
			<output id="map-total">{this.state.rows.get('first')?.total}</output>
			<output id="set-size">{this.state.selected.size}</output>
		</section>
	);
}

/** Server-only document keeps the application hydration root independent of shell ownership.
 * @exact server
 */
export function RuntimeShell(props: { children: Child; gate?: string }) {
	return () => (
		<html>
			<head>
				<title>Runtime acceptance</title>
			</head>
			<body>
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
export function RuntimeIsland() {
	const Current = RuntimeViews.page;
	return () => <Current />;
}
