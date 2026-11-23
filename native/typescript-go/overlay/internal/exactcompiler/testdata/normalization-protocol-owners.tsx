import type { Component } from '@exactjs/core';

function direct() { return this.onMount; }
function nestedArrow() { const visit = () => this.getContext; return visit; }
function nestedFunction() {
	function inner(this: { onMount: number }) { return this.onMount; }
	return inner;
}
function objectMethod() {
	const receiver = { value: 1, run() { return this.onUnmount; } };
	return receiver;
}
function classMethod() {
	class Local { run() { return this.task; } }
	return Local;
}
function classStatic() {
	class Local { static { void this.reactive; } }
	return Local;
}
function typedForeign(this: { onMount: number }) { return this.onMount; }
function typedCore(this: Component<{ label?: string }>) { return () => this.onRender; }
function identifierReceiver(owner: { onMount: number }) { return owner.onMount; }
function aliasReceiver() { const alias = this; return alias.onMount; }
function bracketReceiver() { return this["onMount"]; }
function parenthesizedReceiver() { return (this).onMount; }
function wrongMember() { return this.render; }
function optionalReceiver() { return this?.onMount; }
const beforeOutside = () => 1;
const outsideOwners = { call() { return this.onMount; } };
const initializerOnly: { [this.onMount]: unknown } = () => 1;
const firstVariable = () => 1, secondVariable = () => this.onMount;
const afterSibling = () => 2;
