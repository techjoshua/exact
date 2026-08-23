import { TaskContext, taskTimeout, type Component } from '@exactjs/core';
import { renderToStringAsync } from '@exactjs/ssr';

type ServerHttpState = { value: number };

function ServerHttpLeaf(
	this: Component<ServerHttpState>,
	props: { request: number; value: number }
) {
	this.state.value = 0;
	const prepare = async (
		request: number,
		value: number,
		task: TaskContext = TaskContext.server().blocking()
	) => {
		await new Promise<void>((resolve) => taskTimeout(task.signal, resolve, 1));
		this.state.value = request * 10_000 + value;
	};
	void prepare(props.request, props.value);
	return () => <li>{this.state.value}</li>;
}

function ServerHttpTree(props: { request: number }) {
	return () => (
		<main>
			<h1>Request {props.request}</h1>
			<ul>
				<ServerHttpLeaf key={`${props.request}:0`} request={props.request} value={0} />
				<ServerHttpLeaf key={`${props.request}:1`} request={props.request} value={1} />
				<ServerHttpLeaf key={`${props.request}:2`} request={props.request} value={2} />
				<ServerHttpLeaf key={`${props.request}:3`} request={props.request} value={3} />
				<ServerHttpLeaf key={`${props.request}:4`} request={props.request} value={4} />
				<ServerHttpLeaf key={`${props.request}:5`} request={props.request} value={5} />
				<ServerHttpLeaf key={`${props.request}:6`} request={props.request} value={6} />
				<ServerHttpLeaf key={`${props.request}:7`} request={props.request} value={7} />
			</ul>
		</main>
	);
}

/** Renders one independent compiler-closed request for the production HTTP load fixture. */
export async function renderServerHttpRequest(request: number): Promise<string> {
	const result = await renderToStringAsync(<ServerHttpTree request={request} />, {
		markers: false,
		maxAsyncSsrConcurrency: 4
	});
	const expected = request * 10_000 + 7;
	if (!result.html.includes(`<li>${expected}</li>`))
		throw new Error(`SSR request ${request} published another request's state`);
	return result.html;
}
