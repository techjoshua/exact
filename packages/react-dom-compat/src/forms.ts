import { useActionState } from '@exactjs/react-compat';

/** Restores a form's controls to their authored default values. */
export function requestFormReset(form: HTMLFormElement): void {
	if (!(form instanceof HTMLFormElement))
		throw new TypeError('requestFormReset expects an HTMLFormElement');
	form.reset();
}

/** Compatibility alias for React's action-state form hook. */
export function useFormState<State, Payload>(
	action: (previousState: State, payload: Payload) => State | Promise<State>,
	initialState: State,
	permalink?: string
): readonly [State, (payload: Payload) => void, boolean] {
	return useActionState(action, initialState, permalink);
}

/** Returns the status of the nearest compatibility form submission. */
export function useFormStatus(): {
	pending: boolean;
	data: FormData | null;
	method: string | null;
	action: string | ((formData: FormData) => unknown) | null;
} {
	return { pending: false, data: null, method: null, action: null };
}
