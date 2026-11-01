import { TaskContext, type Component } from '@exactjs/core';
import { push, reverse } from './helper.js';
export function UnionPushDirect(this: Component<{ rows: number[] | (number | string)[] }>) {
	this.state.rows = [1];
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		this.state.rows.push(2);
	}
	return () => (
		<main>
			<button onClick={() => void run()}>Run</button>
			<output>{this.state.rows.length}</output>
		</main>
	);
}
export function UnionPushHelper(this: Component<{ rows: number[] | (number | string)[] }>) {
	this.state.rows = [1];
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		push(this.state);
	}
	return () => (
		<main>
			<button onClick={() => void run()}>Run</button>
			<output>{this.state.rows.length}</output>
		</main>
	);
}
export function UnionReverseDirect(this: Component<{ rows: number[] | (number | string)[] }>) {
	this.state.rows = [1, 2];
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		this.state.rows.reverse();
	}
	return () => (
		<main>
			<button onClick={() => void run()}>Run</button>
			<output>{this.state.rows.length}</output>
		</main>
	);
}
export function UnionReverseHelper(this: Component<{ rows: number[] | (number | string)[] }>) {
	this.state.rows = [1, 2];
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		reverse(this.state);
	}
	return () => (
		<main>
			<button onClick={() => void run()}>Run</button>
			<output>{this.state.rows.length}</output>
		</main>
	);
}
export function TuplePush(this: Component<{ rows: [number] | [number, number] }>) {
	this.state.rows = [1];
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		this.state.rows.push(2);
	}
	return () => (
		<main>
			<button onClick={() => void run()}>Run</button>
			<output>{this.state.rows.length}</output>
		</main>
	);
}

export function Scalar(this: Component<{ value: number }>) {
	this.state.value = 0;
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		this.state.value = 1;
	}
	return () => <button onClick={() => void run()}>Set</button>;
}
