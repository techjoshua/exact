import { describe, expect, it } from 'vitest';
import { flushSync, reactive, watch } from './index.js';

describe('reactive proxy invariants', () => {
	it('preserves frozen object-valued properties while observing an existing reactive value', () => {
		const state = reactive({ locale: 'en-US' });
		const metadata = { direction: 'ltr' };
		const environment = Object.freeze({ state, metadata });
		const props = reactive({ environment }, { readonly: true });
		let observed = '';

		expect(props.environment.state).toBe(state);
		expect(props.environment.metadata).toBe(metadata);
		watch(() => (observed = props.environment.state.locale));
		expect(observed).toBe('en-US');
		state.locale = 'fr-FR';
		flushSync();

		expect(observed).toBe('fr-FR');
	});
});
