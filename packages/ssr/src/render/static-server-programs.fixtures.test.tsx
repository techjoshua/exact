/** Literal server inputs can be shared while each request owns its target contributions and output. */
export function StaticServerLeaf() {
	return () => <span className="fixed">Static</span>;
}
