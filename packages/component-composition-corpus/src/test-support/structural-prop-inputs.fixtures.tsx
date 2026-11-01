import { Activity, createPortal, type ActivityMode } from '@exactjs/core';

type StructuralInputs = {
	mode: ActivityMode;
};

function StructuralPropInputs(props: StructuralInputs) {
	return () => (
		<section>
			<Activity mode={props.mode}>
				<b data-role="retained">retained</b>
			</Activity>
		</section>
	);
}

/** Shares ordinary structural inputs across client updates, SSR, and hydration. */
export const structuralPropInputsRoot = (inputs: StructuralInputs) => (
	<StructuralPropInputs {...inputs} />
);

function PortalInput(props: { target: Element }) {
	return () => createPortal(props.target, <i data-role="portal">portal</i>);
}

/** Supplies a real DOM node to the public portal operation. */
export const portalInputRoot = (target: Element) => <PortalInput target={target} />;
