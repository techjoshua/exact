/** Browser-owned control state retained while an interaction artifact loads. */
export type InteractionControlState = Readonly<{
	value?: string;
	checked?: boolean;
	selected?: readonly string[];
	selectionStart?: number;
	selectionEnd?: number;
	selectionDirection?: 'forward' | 'backward' | 'none';
}>;

/** Captures only the value fields authorized by input/change replay. */
export function captureInteractionControlState(target: Element): InteractionControlState {
	if (target instanceof HTMLSelectElement)
		return {
			value: target.value,
			selected: optionIdentities(target)
				.filter(({ option }) => option.selected)
				.map(({ identity }) => identity)
		};
	if (target instanceof HTMLInputElement && target.type === 'file') return {};
	if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
		const selectionStart = target.selectionStart;
		const selectionEnd = target.selectionEnd;
		return {
			value: target.value,
			...(target instanceof HTMLInputElement ? { checked: target.checked } : {}),
			...(selectionStart === null ? {} : { selectionStart }),
			...(selectionEnd === null ? {} : { selectionEnd }),
			...(target.selectionDirection ? { selectionDirection: target.selectionDirection } : {})
		};
	}
	return {};
}

/** Restores a queued value before notifying the newly adopted handler. */
export function restoreInteractionControlState(
	target: Element,
	state: InteractionControlState
): void {
	if (target instanceof HTMLSelectElement) {
		if (state.selected) {
			const selected = new Set(state.selected);
			const options = optionIdentities(target);
			if (!target.multiple) {
				// Setting each option separately lets the browser silently select a fallback.
				target.selectedIndex = options.findIndex(({ identity }) => selected.has(identity));
			} else {
				for (const { option, identity } of options) option.selected = selected.has(identity);
			}
		} else if (state.value !== undefined) target.value = state.value;
		return;
	}
	if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
	// Browsers own file selections. Assigning a path throws, and assigning an empty value clears them.
	if (target instanceof HTMLInputElement && target.type === 'file') return;
	if (state.value !== undefined) target.value = state.value;
	if (target instanceof HTMLInputElement && state.checked !== undefined)
		target.checked = state.checked;
	if (state.selectionStart === undefined || state.selectionEnd === undefined) return;
	try {
		target.setSelectionRange(
			state.selectionStart,
			state.selectionEnd,
			state.selectionDirection ?? 'none'
		);
	} catch {
		// Input types without a text selection surface reject setSelectionRange.
	}
}

/** Values survive option reordering, with occurrence counts distinguishing duplicate values. */
function optionIdentities(target: HTMLSelectElement) {
	const occurrences = new Map<string, number>();
	return Array.from(target.options, (option) => {
		const occurrence = occurrences.get(option.value) ?? 0;
		occurrences.set(option.value, occurrence + 1);
		return { option, identity: JSON.stringify([option.value, occurrence]) };
	});
}
