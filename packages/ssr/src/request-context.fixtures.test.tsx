import { createContext, TaskContext, type Component } from '@exactjs/core';
import { RequestContext, type RequestContextValue } from '@exactjs/request';

export const ApplicationName = createContext<string>('ssr.application', {
	reactive: false,
	scope: 'application'
});

export const RequestName = createContext<string>('ssr.request', {
	reactive: false,
	scope: 'request'
});

let activeRequest: RequestContextValue | undefined;

export function resetActiveRequest(): void {
	activeRequest = undefined;
}

export function readActiveRequest(): RequestContextValue | undefined {
	return activeRequest;
}

export function RequestContextPage(this: Component<{ ready: string }>) {
	const request = this.getContext(RequestContext);
	const name = this.getContext(RequestName);
	this.state.ready = 'loading';
	const prepare = async (_task: TaskContext = TaskContext.server().blocking()) => {
		await Promise.resolve();
		this.state.ready = `${name}:${request.method}`;
		request.setStatus(201);
		request.setHeader('x-rendered', 'yes');
	};
	prepare();
	return () => <p>{this.state.ready}</p>;
}

export function SettledRequestPage(this: Component<{ value: string }>) {
	const request = this.getContext(RequestContext);
	this.state.value = 'pending';
	const settle = async (_task: TaskContext = TaskContext.server().blocking()) => {
		await Promise.resolve();
		this.state.value = 'settled';
		request.setStatus(206);
		request.setHeader('x-precommit', 'settled');
	};
	settle();
	return () => <p>{this.state.value}</p>;
}

export function RedirectRequestPage(this: Component<{}>) {
	activeRequest = this.getContext(RequestContext);
	activeRequest.redirect('/sign-in', 307);
	return () => <p>Redirecting</p>;
}

export function RefreshProfile(this: Component<{}>) {
	const requestName = this.getContext(RequestName);
	const request = this.getContext(RequestContext);
	return () => (
		<p>
			{requestName}:{request.method}
		</p>
	);
}
