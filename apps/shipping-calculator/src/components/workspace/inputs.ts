import { packagePresets } from '../../model.js';
import type { ShipmentDraft } from '../../types.js';
import type { WorkspaceState } from './contracts.js';

/** Creates draft and provider-filter event handlers bound to one workspace state object. */
export function createWorkspaceInputs(state: WorkspaceState) {
	const change = <K extends keyof ShipmentDraft>(key: K, value: ShipmentDraft[K]) => {
		state.draft[key] = value;
		state.revision++;
	};
	const text =
		<K extends keyof ShipmentDraft>(key: K) =>
		(event: Event) =>
			change(key, (event.currentTarget as HTMLInputElement).value as ShipmentDraft[K]);
	const checked =
		<K extends keyof ShipmentDraft>(key: K) =>
		(event: Event) =>
			change(key, (event.currentTarget as HTMLInputElement).checked as ShipmentDraft[K]);
	const select =
		<K extends keyof ShipmentDraft>(key: K) =>
		(event: Event) =>
			change(key, (event.currentTarget as HTMLSelectElement).value as ShipmentDraft[K]);
	const applyPreset = (event: Event) => {
		const preset = (event.currentTarget as HTMLSelectElement).value as ShipmentDraft['preset'];
		Object.assign(state.draft, packagePresets[preset], { preset });
		state.revision++;
	};
	return { change, text, checked, select, applyPreset };
}

/** Performs the delay domain operation. */
export function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, milliseconds);
		const abort = () => {
			clearTimeout(timer);
			reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
		};
		if (signal.aborted) abort();
		else signal.addEventListener('abort', abort, { once: true });
	});
}
/** Performs the clone draft domain operation. */
export function cloneDraft(draft: ShipmentDraft): ShipmentDraft {
	return { ...draft };
}
