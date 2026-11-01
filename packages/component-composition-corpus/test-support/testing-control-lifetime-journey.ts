type Control = {
	readonly element: Element;
	dispatch(type: string): Promise<unknown>;
	click(): Promise<unknown>;
	input(value: string): Promise<unknown>;
	change(value: string): Promise<unknown>;
	submit(): Promise<unknown>;
	focus(): Promise<unknown>;
	blur(): Promise<unknown>;
	keyDown(key: string): Promise<unknown>;
	keyUp(key: string): Promise<unknown>;
	key(key: string): Promise<unknown>;
	press(key: string): Promise<unknown>;
};

/** Retired handles must reject before native mutation or event dispatch, including after unmount. */
export async function verifyRetiredTestControl(
	control: Control,
	retire: () => unknown | Promise<unknown>
): Promise<void> {
	const element = control.element as HTMLInputElement;
	const original = element.value;
	let events = 0;
	const observe = () => events++;
	const types = [
		'click',
		'input',
		'change',
		'submit',
		'focus',
		'blur',
		'keydown',
		'keyup',
		'custom'
	];
	for (const type of types) element.addEventListener(type, observe);
	try {
		await retire();
		for (const action of [
			() => control.dispatch('custom'),
			() => control.click(),
			() => control.input('changed'),
			() => control.change('changed'),
			() => control.submit(),
			() => control.focus(),
			() => control.blur(),
			() => control.keyDown('Enter'),
			() => control.keyUp('Enter'),
			() => control.key('Enter'),
			() => control.press('Enter')
		]) {
			const result = await action().then(
				() => undefined,
				(error: unknown) => error
			);
			if (!(result instanceof Error) || !/no longer mounted|unmounted/.test(result.message))
				throw new Error('A retired test control did not reject its interaction');
			if (element.value !== original || events !== 0)
				throw new Error('A retired test control was mutated before rejecting');
		}
	} finally {
		for (const type of types) element.removeEventListener(type, observe);
	}
}

/** Removed component handles cannot mutate retained state or invoke authored update callbacks. */
export async function verifyRetiredTestComponent(
	component: {
		state(): { count: number };
		setState(update: { count: number } | ((state: { count: number }) => void)): Promise<unknown>;
	},
	retire: () => unknown | Promise<unknown>
): Promise<void> {
	const state = component.state();
	const original = state.count;
	let callbacks = 0;
	await retire();
	for (const update of [
		{ count: original + 1 },
		(value: { count: number }) => {
			callbacks++;
			value.count++;
		}
	]) {
		const result = await component.setState(update).then(
			() => undefined,
			(error: unknown) => error
		);
		if (!(result instanceof Error) || !/no longer mounted|unmounted/.test(result.message))
			throw new Error('A retired test component did not reject its state update');
		if (callbacks !== 0 || state.count !== original)
			throw new Error('A retired test component was mutated before rejecting');
	}
}
