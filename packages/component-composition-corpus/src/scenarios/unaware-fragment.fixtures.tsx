/** This independently compiled component declares no enhancement or presentation host. */
export function UnawareFragment() {
	return () => <>unaware text</>;
}

function TextLeaf() {
	return () => 'unaware text';
}

/** A nested scalar root stays a Text target rather than acquiring an intrinsic presentation. */
export function UnawareTextLeaf() {
	return () => (
		<>
			<TextLeaf />
		</>
	);
}
