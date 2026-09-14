import { renderToString } from '@exactjs/ssr';

function LargeList(props: { count: number }) {
	return () => (
		<ul>
			{Array.from({ length: props.count }, (_, id) => (
				<li key={id} data-key={id}>{`item-${id}`}</li>
			))}
		</ul>
	);
}

/** Renders the compiler-owned list used to measure DevTools-independent SSR cost. */
export async function renderLargeList(count: number) {
	return await renderToString(<LargeList count={count} />, { markers: false });
}
