/** Checks retained compiled control behavior after the caller mounts or hydrates its fixture. */
export function verifyFormBindingControls(
	root: ParentNode,
	settle: () => void | Promise<void>
): Promise<void>;
