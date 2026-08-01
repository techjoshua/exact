import type { Component } from '@exactjs/core';

type Item = { readonly label: string; value: number };

/** @exact shared */
export function Summary(props: { items: readonly Item[] }) {
	const labels = props.items.map((item) => item.label);
	return () => (
		<section data-count={labels.length}>
			{labels.map((label) => (
				<span>{label}</span>
			))}
		</section>
	);
}

export async function AsyncStatus(this: Component<{ status?: string }>) {
	try {
		this.state.status = await Promise.resolve('ready');
	} catch (error) {
		this.state.status = String(error);
	} finally {
		await Promise.resolve();
	}
	return () => <output>{this.state.status}</output>;
}

export function Article(this: Component<{ copyrightText: string }>) {
	const Footer = () => <footer>{this.state.copyrightText}</footer>;
	const Page = () => (
		<article>
			<Footer />
		</article>
	);
	return () => <Page />;
}
