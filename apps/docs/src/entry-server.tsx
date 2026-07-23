import { createMemoryLocationSource } from '@exact/router';
import { renderToHydratableString } from '@exact/ssr';
import { DocsApp } from './DocsApp.jsx';

export function renderStatic(): string {
	const source = createMemoryLocationSource('https://exact.local/#/');
	return renderToHydratableString(<DocsApp source={source} />).htmlWithHydration;
}
