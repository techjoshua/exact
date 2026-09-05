import { Suspense, type Component } from '@exactjs/core';
import { createCompiledDynamicComponent } from '@exactjs/core/runtime/dynamic-components';
import { reactive } from '@exactjs/reactive';

let pendingSource: Promise<typeof LoadedPanel> | undefined;
const replacementSelection = reactive({ selected: true });
let signals: AbortSignal[] = [];
let unmounts = 0;

/** Compiler-backed component resolved by the dynamic-component fixtures. */
export function LoadedPanel(this: Component<{}>, props: { label: string }) {
	this.onUnmount(() => unmounts++);
	return () => <p>{props.label}</p>;
}

/** Compiler-backed host for an asynchronously resolved component. */
export function AsyncPanelHost() {
	const child = createCompiledDynamicComponent({
		id: 'fixture:async-panel',
		source: () => pendingSource,
		props: { label: 'ready' }
	});
	return () => <Suspense fallback={<span>loading</span>}>{child}</Suspense>;
}

/** Compiler-backed host for a replaceable dynamic component. */
export function ReplacementPanelHost() {
	const child = createCompiledDynamicComponent({
		id: 'fixture:replace-panel',
		source: (signal: AbortSignal) => {
			signals.push(signal);
			return replacementSelection.selected ? LoadedPanel : undefined;
		},
		props: { label: 'selected' }
	});
	return () => child;
}

/** Supplies the promise used by the asynchronous host. */
export function setPendingPanelSource(source: Promise<typeof LoadedPanel>) {
	pendingSource = source;
}

/** Resets observable state owned by the replacement fixture. */
export function resetReplacementPanelFixture() {
	replacementSelection.selected = true;
	signals = [];
	unmounts = 0;
}

/** Removes the selected component from the replacement fixture. */
export function clearSelectedPanel() {
	replacementSelection.selected = false;
}

/** Returns abort signals observed by the replacement fixture. */
export function getReplacementSignals() {
	return signals;
}

/** Returns the number of disposed loaded panels. */
export function getLoadedPanelUnmounts() {
	return unmounts;
}
