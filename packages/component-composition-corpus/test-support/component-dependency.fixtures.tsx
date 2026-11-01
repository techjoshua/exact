import { createRef, type Component } from '@exactjs/core';
import { render, type RenderOptions } from '@exactjs/dom/root';

/** Ref anchored by the shared transaction journey before any update. */
export const dependencyButton = createRef<HTMLButtonElement>('dependency transaction button');
/** Durable owner exposed for the same source and browser transition assertions. */
export let dependencyOwner: Component<{ count: number }>;

/** A direct component slot with parent-owned inputs and an ordinary scalar result. */
export function DependencyChild(props: { label: string }) {
	return () => <output data-dependency-child>{props.label}</output>;
}

/** Exercises mixed input subscription and state-only progress without authored forwarding. */
export function DependencyOwner(this: Component<{ count: number }>, props: { label: string }) {
	dependencyOwner = this;
	this.state.count = 0;
	return () => (
		<section data-dependency-owner title={props.label}>
			<DependencyChild label={props.label} />
			<output data-dependency-count>{this.state.count}</output>
			<button ref={this.ref(dependencyButton)} onClick={() => this.state.count++}>
				Next
			</button>
		</section>
	);
}

/** Publishes the same authored root for source and adapter browser journeys. */
export function mountDependencyOwner(host: Element, label: string, options: RenderOptions) {
	render(<DependencyOwner label={label} />, host, options);
}

/** Supplies the same authored component operation to marked SSR and strict client adoption. */
export function dependencyRoot(label: string) {
	return <DependencyOwner label={label} />;
}
