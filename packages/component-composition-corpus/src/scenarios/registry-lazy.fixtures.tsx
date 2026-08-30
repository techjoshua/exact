/** Lazily loaded finite-registry entry. */
export function LazySecondView() {
	return () => <p data-view="lazy-second">lazy second</p>;
}
