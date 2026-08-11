/** Browser-owned control state retained while an interaction artifact loads. */
export type InteractionControlState = Readonly<{
	value?: string;
	checked?: boolean;
	selected?: readonly number[];
	selectionStart?: number;
	selectionEnd?: number;
	selectionDirection?: 'forward' | 'backward' | 'none';
}>;

/** Captures only the value fields authorized by input/change replay. */
export function captureInteractionControlState(target: Element): InteractionControlState {
	if (target instanceof HTMLSelectElement)
		return {
			value: target.value,
			selected: Array.from(target.options, (option, index) =>
				option.selected ? index : -1
			).filter((index) => index >= 0)
		};
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
			for (let index = 0; index < target.options.length; index++)
				target.options[index]!.selected = selected.has(index);
		} else if (state.value !== undefined) target.value = state.value;
		return;
	}
	if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
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
