import { type Component, type RootLifecycle } from '@exactjs/core';

let greetingLifecycle: RootLifecycle<Element> | undefined;
interface KeyedItem {
	/** @exact key */
	id: string;
	label: string;
}
let keyedListOwner: Component<{ items: KeyedItem[] }> | undefined;

/** Compiler-backed component-boundary adoption fixture. */
export function HydratedGreeting(this: Component<Record<string, never>>) {
	greetingLifecycle = this.refs.root();
	return () => <span>server</span>;
}

/** Returns the lifecycle captured by the mounted greeting fixture. */
export function hydratedGreetingLifecycle() {
	if (!greetingLifecycle) throw new Error('HydratedGreeting is not mounted');
	return greetingLifecycle;
}

/** Compiler-backed markerless component adoption fixture. */
export function MarkerlessGreeting(props: { text: string }) {
	return () => <span>{props.text}</span>;
}

/** Compiler-backed empty component bounded by its following intrinsic sibling. */
function EmptyAdoptionChild() {
	return () => null;
}

/** Compiler-backed empty component bounded by its following intrinsic sibling. */
export function BoundedEmptyGreeting() {
	return () => (
		<main>
			<EmptyAdoptionChild />
			<span>After</span>
		</main>
	);
}

/** Compiler-backed markerless fragment adoption fixture. */
export function FragmentAdoptionRoot() {
	return () => (
		<>
			<i>first</i>
			<b>second</b>
		</>
	);
}

/** Compiler-backed keyed hydration and reorder fixture. */
export function KeyedAdoptionList(this: Component<{ items: KeyedItem[] }>) {
	keyedListOwner = this;
	this.state.items = [
		{ id: 'a', label: 'A' },
		{ id: 'b', label: 'B' }
	];
	return () =>
		this.map(
			this.state.items,
			(item) => item.id,
			(item) => <li>{item.label}</li>,
			'tasks'
		);
}

/** Returns the mounted keyed adoption fixture instance. */
export function keyedAdoptionListInstance() {
	if (!keyedListOwner) throw new Error('KeyedAdoptionList is not mounted');
	return keyedListOwner;
}

/** Compiler-backed complete-document adoption fixture. */
export function DocumentAdoptionRoot() {
	return () => (
		<html>
			<head>
				<title>Fixture</title>
			</head>
			<body>
				<main>server</main>
			</body>
		</html>
	);
}
