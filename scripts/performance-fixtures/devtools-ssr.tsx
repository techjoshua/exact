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
export function renderLargeList(count: number) {
	return renderToString(<LargeList count={count} />, { markers: false });
}
