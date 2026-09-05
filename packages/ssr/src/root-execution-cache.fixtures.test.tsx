import { TaskContext, type Component } from '@exactjs/core';

/** Compiler-backed root used to verify request blueprint caching. */
export function CachedRoot(this: Component<{ value: string }>) {
	this.state.value = 'root';
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		this.state.value = await Promise.resolve('ready');
	};
	load();
	return () => <main>{this.state.value}</main>;
}

/** Compiler-backed dynamic candidate used to verify nested contract caching. */
export function CachedDynamic(this: Component<{ value: string }>) {
	this.state.value = 'dynamic';
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		this.state.value = await Promise.resolve('settled');
	};
	load();
	return () => <p>{this.state.value}</p>;
}

/** Independently compiled authority used to replace a cached candidate contract. */
export function ReplacementDynamic(this: Component<{ value: string }>) {
	this.state.value = 'replacement';
	const replace = async (_task: TaskContext = TaskContext.server().blocking()) => {
		this.state.value = await Promise.resolve('replaced');
	};
	replace();
	return () => <p>{this.state.value}</p>;
}
