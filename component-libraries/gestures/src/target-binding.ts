type GestureTargetListeners = Readonly<{
	pointerdown: (event: Event) => void;
	pointermove: (event: Event) => void;
	pointerup: (event: Event) => void;
	pointercancel: (event: Event) => void;
	lostpointercapture: (event: Event) => void;
	pointerenter: (event: Event) => void;
	pointerleave: (event: Event) => void;
	focusin: (event: Event) => void;
	focusout: (event: Event) => void;
	keydown: (event: Event) => void;
}>;

/** Owns target listeners and temporary browser interaction policy for one session. */
export class GestureTargetBinding implements Disposable {
	readonly #touchAction: string;
	readonly #userSelect: string;

	constructor(
		readonly element: Element,
		private readonly listeners: GestureTargetListeners
	) {
		this.#touchAction = element instanceof HTMLElement ? element.style.touchAction : '';
		this.#userSelect = element instanceof HTMLElement ? element.style.userSelect : '';
		for (const [name, listener] of Object.entries(listeners)) {
			element.addEventListener(name, listener);
		}
	}

	/** Applies the narrow touch-action policy selected by the current definition. */
	applyTouchAction(touchAction: string | undefined): void {
		if (this.element instanceof HTMLElement)
			this.element.style.touchAction = touchAction ?? this.#touchAction;
	}

	/** Temporarily disables text selection while a pointer gesture owns the target. */
	suppressSelection(): void {
		if (this.element instanceof HTMLElement) this.element.style.userSelect = 'none';
	}

	/** Restores the target's authored inline text-selection policy after gesture ownership ends. */
	restoreSelection(): void {
		if (this.element instanceof HTMLElement) this.element.style.userSelect = this.#userSelect;
	}

	/** Removes listeners and restores authored inline browser policy. */
	[Symbol.dispose](): void {
		for (const [name, listener] of Object.entries(this.listeners)) {
			this.element.removeEventListener(name, listener);
		}
		if (this.element instanceof HTMLElement) {
			this.element.style.touchAction = this.#touchAction;
			this.element.style.userSelect = this.#userSelect;
		}
	}
}
