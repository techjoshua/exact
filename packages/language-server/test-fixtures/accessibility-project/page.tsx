export function AccessibilityFixture() {
	return () => (
		<main>
			<button tabIndex={2}></button>
			<div role="tree" a11y:navigate>
				<div role="treeitem">Item</div>
			</div>
		</main>
	);
}
