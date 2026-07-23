// @vitest-environment jsdom
import { createContext, createElement, useContext } from '@exactjs/react-compat';
import { createRoot } from '@exactjs/react-dom-compat/client19';
import { describe, expect, it } from 'vitest';
import type { ReduxStore } from './index.js';
import { Provider } from './react.js';

describe('@exactjs/redux React bridge', () => {
	it('provides React Redux-compatible custom context without a react-redux runtime import', async () => {
		const store: ReduxStore<{ count: number }> = {
			getState: () => ({ count: 1 }),
			dispatch: () => undefined,
			subscribe: () => () => {}
		};
		const CustomContext = createContext<any>(null);
		let observed: any;
		function Reader() {
			observed = useContext(CustomContext);
			return null;
		}
		const container = document.createElement('div');
		createRoot(container).render(
			createElement(Provider, { store, context: CustomContext }, createElement(Reader, null))
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(observed.store).toBe(store);
		expect(observed.subscription.isSubscribed()).toBe(true);
	});
});
