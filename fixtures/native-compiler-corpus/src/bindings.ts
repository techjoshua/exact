import type { Component } from '@exactjs/core';

type Item = { readonly label: string; value: number };

const outer = 1;
let changing = 2;

export function summarize(items: readonly Item[]) {
	let total = outer;
	const add = (item: Item) => {
		total += item.value;
		return item.label;
	};
	changing = total;
	return { labels: items.map(add), total, changing };
}

export function lexicalThis(this: Component<{ title: string }>) {
	const read = () => this.state.title;
	return read();
}

declare const values: readonly { name: string }[];
export const entries = new Map(values.flatMap((value) => [[value.name, value] as const]));

const signal = new AbortController().signal;
export const options = { signal };

export function siblingBindings(flag: boolean) {
	if (flag) {
		const value = 1;
		return value;
	}
	const value = 2;
	return value;
}
