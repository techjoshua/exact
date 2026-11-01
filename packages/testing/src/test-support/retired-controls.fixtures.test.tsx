import type { Component } from '@exactjs/core';

/** Replaces controls while retaining their enclosing component and test view. */
export function RetiredControls(this: Component<{ retired: boolean }>) {
	this.state.retired = false;
	return () => (this.state.retired ? <span>Replacement</span> : <RetiredChild />);
}

/** Exposes inspectable child state until its conditional range is removed. */
export function RetiredChild(this: Component<{ count: number }>, props: { initial?: number }) {
	this.state.count = props.initial ?? 0;
	return () => (
		<form>
			<input value="before" />
			<button onClick={() => this.state.count++}>Save {this.state.count}</button>
		</form>
	);
}

/** Places inspectable sibling components behind different intrinsic wrapper depths. */
export function OrderedControls(this: Component<{}>) {
	return () => (
		<section>
			<div>
				<RetiredChild initial={1} />
				<div>
					<RetiredChild initial={2} />
				</div>
			</div>
			<RetiredChild initial={3} />
		</section>
	);
}
