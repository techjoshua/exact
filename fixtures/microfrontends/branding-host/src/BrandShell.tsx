import type { Child } from '@exactjs/core';

export default function BrandShell(props: {
	navigation?: Child;
	content?: Child;
	account?: Child;
}) {
	return () => (
		<div class="brand-shell">
			<header>
				{props.navigation}
				{props.account}
			</header>
			<main>{props.content}</main>
		</div>
	);
}
