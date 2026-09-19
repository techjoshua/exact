import type { Child } from '@exactjs/core';

/** The baseline adapter changes only supplied-target syntax, retaining the same title layer. */
export function Presentation(props: { label: string; children?: Child }) {
	return () => <_target title={props.label} />;
}
