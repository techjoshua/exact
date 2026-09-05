import type { Component } from '@exactjs/core';

function ModalAdoptionRoot(
	this: Component<{ open: boolean }>,
	props: { publish(event: Event): void }
) {
	this.state.open = false;
	return () => (
		<dialog
			data-exact-id="settings"
			__exactModalOpen={this.state.open}
			__exactBindModalToggle={(event: Event) => props.publish(event)}
			__exactBindModalClose={(event: Event) => props.publish(event)}
		/>
	);
}

/** Creates the compiler-issued modal adoption fixture. */
export const modalAdoptionRoot = (publish: (event: Event) => void) => (
	<ModalAdoptionRoot publish={publish} />
);
