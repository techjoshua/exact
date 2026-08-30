import { createRef, type Component } from '@exactjs/core';
import { MotionConfig } from './context.js';
import { LayoutGroup } from './layout.js';
import { MotionList } from './motion-list.js';
import { Motion } from './motion.js';
import { Presence } from './presence.js';
import { fade } from './presets.js';

type Item = { id: string };

let keyedView: Component<{ key: string }> | undefined;
let focusView: Component<{ shown: boolean }> | undefined;
let identityList: Component<{ items: Item[] }> | undefined;
let layoutList: Component<{ items: Item[] }> | undefined;
let poppingList: Component<{ items: Item[] }> | undefined;

/** Compiler-backed keyed Presence transition fixture. */
export function PresenceKeyedView(
	this: Component<{ key: string }>,
	props: { mode: 'out-in' | 'in-out'; reduced?: boolean }
) {
	keyedView = this;
	this.state.key = 'a';
	return () =>
		props.reduced ? (
			<MotionConfig reducedMotion="always">
				<Presence when mode={props.mode}>
					<Motion key={this.state.key} as="button" motion={fade}>
						{this.state.key}
					</Motion>
				</Presence>
			</MotionConfig>
		) : (
			<Presence when mode={props.mode}>
				<Motion key={this.state.key} as="button" motion={fade}>
					{this.state.key}
				</Motion>
			</Presence>
		);
}

/** Reads the current keyed Presence fixture instance. */
export function presenceKeyedViewInstance() {
	if (!keyedView) throw new Error('Keyed Presence fixture has not been mounted');
	return keyedView;
}

/** Compiler-backed focus restoration and release reversal fixture. */
export function FocusPresenceView(this: Component<{ shown: boolean }>) {
	focusView = this;
	this.state.shown = true;
	const opener = createRef<HTMLButtonElement>('opener');
	return () => (
		<section>
			<button ref={this.ref(opener)}>Open</button>
			<Presence when={this.state.shown} returnFocus={this.ref(opener)}>
				<Motion as="button" motion={fade}>
					Close
				</Motion>
			</Presence>
		</section>
	);
}

/** Reads the current focus Presence fixture instance. */
export function focusPresenceViewInstance() {
	if (!focusView) throw new Error('Focus Presence fixture has not been mounted');
	return focusView;
}

/** Compiler-backed keyed identity list fixture. */
export function MotionListIdentityView(this: Component<{ items: Item[] }>) {
	identityList = this;
	this.state.items = [{ id: 'a' }, { id: 'b' }];
	return () => (
		<MotionList
			items={this.state.items}
			getKey={(item: Item) => item.id}
			children={(item: Item) => <li>{item.id}</li>}
		/>
	);
}

/** Reads the keyed identity list fixture instance. */
export function motionListIdentityViewInstance() {
	if (!identityList) throw new Error('Motion list identity fixture has not been mounted');
	return identityList;
}

/** Compiler-backed duplicate-key failure fixture. */
export function DuplicateMotionListView() {
	const items = [{ id: 'a' }, { id: 'a' }];
	return () => (
		<MotionList
			items={items}
			getKey={(item: Item) => item.id}
			children={(item: Item) => <li>{item.id}</li>}
		/>
	);
}

/** Compiler-backed layout reorder fixture. */
export function LayoutMotionListView(this: Component<{ items: Item[] }>) {
	layoutList = this;
	this.state.items = [{ id: 'a' }, { id: 'b' }];
	return () => (
		<LayoutGroup id="cards">
			<MotionList
				items={this.state.items}
				getKey={(item: Item) => item.id}
				children={(item: Item) => (
					<Motion as="li" layout="position" layoutId={item.id}>
						{item.id}
					</Motion>
				)}
			/>
		</LayoutGroup>
	);
}

/** Reads the layout list fixture instance. */
export function layoutMotionListViewInstance() {
	if (!layoutList) throw new Error('Layout motion list fixture has not been mounted');
	return layoutList;
}

/** Compiler-backed popped-exit list fixture. */
export function PoppingMotionListView(this: Component<{ items: Item[] }>) {
	poppingList = this;
	this.state.items = [{ id: 'a' }];
	return () => (
		<MotionList
			items={this.state.items}
			getKey={(item: Item) => item.id}
			exitLayout="pop"
			children={(item: Item) => (
				<Motion as="li" motion={fade}>
					{item.id}
				</Motion>
			)}
		/>
	);
}

/** Reads the popped-exit list fixture instance. */
export function poppingMotionListViewInstance() {
	if (!poppingList) throw new Error('Popping motion list fixture has not been mounted');
	return poppingList;
}
