import { createPortal, type Component } from '@exactjs/core';

/** Counts physical event delivery through a logically owned portal across retained updates. */
export function PortalEventPanel(
	this: Component<{ clicks: number }>,
	props: { target: Element; label: string; visible: boolean }
) {
	this.state.clicks = 0;
	return () => (
		<section>
			{props.visible &&
				createPortal(
					props.target,
					<button
						data-portal={props.label}
						onClick={(event) => {
							if (!event.defaultPrevented) this.state.clicks++;
						}}
					>
						{this.state.clicks}
					</button>
				)}
		</section>
	);
}

/** Counts ordinary native bubbling through an independently mounted renderer root. */
export function PortalParentPanel(this: Component<{ clicks: number }>) {
	this.state.clicks = 0;
	return () => (
		<section
			onClick={(event) => {
				if (!event.defaultPrevented) this.state.clicks++;
			}}
		>
			<output>{this.state.clicks}</output>
			<div data-nested-root />
		</section>
	);
}
