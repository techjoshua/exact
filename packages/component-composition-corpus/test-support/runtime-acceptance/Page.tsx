import { TaskContext, type Child, type Component } from '@exactjs/core';

/** Native host fixture with ordinary server continuations and stable hydrated DOM. */
export function RuntimePage(
	this: Component<{ count: number; rows: Map<string, { total: number }>; selected: Set<string> }>
) {
	this.state.count = 0;
	this.state.rows = new Map([['first', { total: 0 }]]);
	this.state.selected = new Set(['first']);
	function increment(_task: TaskContext = TaskContext.server()) {
		void _task;
		this.state.count++;
		this.state.rows.set('first', { total: this.state.count });
		this.state.selected.add('updated');
		return this.state.count;
	}
	return () => (
		<section>
			<p id="escaped">{'<script>unsafe</script> café 😀'}</p>
			<input id="draft" value="initial" />
			<button id="increment" onClick={() => increment()}>
				Increment
			</button>
			<output id="count">{this.state.count}</output>
			<output id="map-total">{this.state.rows.get('first')?.total}</output>
			<output id="set-size">{this.state.selected.size}</output>
		</section>
	);
}

/** Server-only document keeps the application hydration root independent of shell ownership. */
export function RuntimeShell(props: { children: Child; gate?: string }) {
	return () => (
		<html>
			<head>
				<title>Runtime acceptance</title>
			</head>
			<body>
				<main id="root">{props.children}</main>
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
