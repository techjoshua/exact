import type { Child, Component } from '@exactjs/core';
let owner: Component<{ show: boolean }> | undefined;
/** Tracks actual construction and disposal independently of parent child selection. */
export const childInputLifetime = { created: 0, disposed: 0 };
function Leaf(this: Component<{}>, props: { children?: Child }) {
	childInputLifetime.created++;
	this.onUnmount(() => childInputLifetime.disposed++);
	return () => <i>{props.children}</i>;
}
function Receiving(props: { children?: Child }) {
	return () => <aside>{props.children}</aside>;
}
function Selecting(props: { children?: Child | Child[] }) {
	const pick = (values: Child | Child[] | undefined) =>
		Array.isArray(values) ? values[1] : values;
	return () => <Receiving>{pick(props.children)}</Receiving>;
}
function Frame(props: { children?: Child | Child[] }) {
	return () => <section>{props.children}</section>;
}
/** Mixed fallback children keep component roots, fixed siblings and actual receiving scopes. */
export function ChildInputOwner(
	this: Component<{ show: boolean }>,
	props: { probe: { readonly value: string } }
) {
	owner = this;
	this.state.show = true;
	const choose = (show: boolean) => (show ? <span>visible</span> : null);
	const child = <Leaf>{props.probe.value}</Leaf>;
	return () => (
		<main>
			<Frame>
				{choose(this.state.show)}
				<button>fixed</button>
			</Frame>
			<Selecting>
				{child}
				{child}
			</Selecting>
		</main>
	);
}
/** Returns only the already constructed fixture owner for observable transitions. */
export function childInputOwner() {
	if (!owner) throw new Error('Child input owner has not mounted');
	return owner;
}

/** An owner can hand its ordinary callback a component-root recipe while it remains live. */
export function LateInputShell(props: {
	build: (label: string) => Child;
	children?: Child | Child[];
}) {
	return () => <section>{props.children}</section>;
}
/** Retains callback creation order without requiring the receiving root to accept ranges. */
export function LateInputOwner(this: Component<{ show: boolean }>) {
	this.state.show = true;
	const choose = (show: boolean) => (show ? <span>visible</span> : null);
	return () => (
		<LateInputShell
			build={(label) => (
				<Frame>
					{choose(this.state.show)}
					<button>{label}</button>
				</Frame>
			)}
		>
			{choose(this.state.show)}
			<button>outer</button>
		</LateInputShell>
	);
}
/** Direct children use the accepted value while unrelated prepared accessors stay live. */
export function ChildInputAccessor(props: { children?: Child; expected?: Child; other?: string }) {
	return () => (
		<section
			data-exact={props.children === props.expected}
			data-first={props.other}
			data-second={props.other}
		>
			{props.children}
		</section>
	);
}
export { Leaf as ChildInputLeaf };

/** Complete document exposes the same child acquisition boundary under document adoption. */
export function ChildInputDocument(props: { probe: { readonly value: string } }) {
	return () => (
		<html>
			<head>
				<title>Child input</title>
			</head>
			<body>
				<Frame>
					<Leaf>{props.probe.value}</Leaf>
				</Frame>
			</body>
		</html>
	);
}
