import { TaskContext, type Component } from '@exactjs/core';
import { root, member, opaque } from './helper.js';
type Row = { label: string };
export function RootDirect(this: Component<{ rows: Row[] }>) {
	this.state.rows = [{ label: 'A' }, { label: 'B' }];
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		this.state.rows.push({ label: 'added' });
	}
	return () => <button onClick={() => void run()}>Run</button>;
}
export function RootHelper(this: Component<{ rows: Row[] }>) {
	this.state.rows = [{ label: 'A' }, { label: 'B' }];
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		root(this.state);
	}
	return () => <button onClick={() => void run()}>Run</button>;
}
export function MemberDirect(this: Component<{ rows: Row[] }>) {
	this.state.rows = [{ label: 'A' }, { label: 'B' }];
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		this.state.rows[0]!.label = 'changed';
	}
	return () => <button onClick={() => void run()}>Run</button>;
}
export function MemberHelper(this: Component<{ rows: Row[] }>) {
	this.state.rows = [{ label: 'A' }, { label: 'B' }];
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		member(this.state);
	}
	return () => <button onClick={() => void run()}>Run</button>;
}
export function ReplacementMutation(this: Component<{ rows: Row[] }>) {
	this.state.rows = [{ label: 'A' }, { label: 'B' }];
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		this.state.rows = [{ label: 'replacement' }];
		this.state.rows.push({ label: 'added' });
	}
	return () => <button onClick={() => void run()}>Run</button>;
}
export function TupleMember(this: Component<{ rows: [Row, Row] }>) {
	this.state.rows = [{ label: 'A' }, { label: 'B' }];
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		this.state.rows[0].label = 'changed';
	}
	return () => <button onClick={() => void run()}>Run</button>;
}
export function Opaque(this: Component<{ rows: unknown }>) {
	this.state.rows = [{ label: 'A' }, { label: 'B' }];
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		opaque(this.state);
	}
	return () => <button onClick={() => void run()}>Run</button>;
}
