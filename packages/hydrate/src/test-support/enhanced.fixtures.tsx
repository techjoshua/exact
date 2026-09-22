import { createEnhancementNode, type Child, type Component } from '@exactjs/core';
import { createTimeActivation } from '@exactjs/time/internal';

export const clockEnhancementIdentity = '@exactjs/time:TimeUpdate';
export const facadeEnhancementIdentity = '@exactjs/hydrate:enhanced-facade';

const clockPlan = { protocol: 1, kind: 'continuous' } as const;

function OuterContribution() {
	return () => <_target className="outer" />;
}
function InnerContribution() {
	return () => <_target className="inner" />;
}

function TargetOrderRoot(this: Component<{}>) {
	return () => (
		<OuterContribution>
			<>
				<section id="host">Host</section>
				<InnerContribution>
					<h2>Heading</h2>
				</InnerContribution>
			</>
		</OuterContribution>
	);
}

function ClockRoot(this: Component<{}>) {
	const activation = createTimeActivation('second', clockPlan);
	return () => (
		<time
			__exactEnhancements={createEnhancementNode([
				{ identity: clockEnhancementIdentity, props: { update: activation } }
			])}
		>
			{String(activation.readEpochMilliseconds())}
		</time>
	);
}

/** Application-catalog enhancement compiled through the native component ABI. */
export function FacadeEnhancement(this: Component<{}>, props: { children?: Child | Child[] }) {
	return () => <aside data-enhanced>{props.children}</aside>;
}

function FacadePage(this: Component<{}>) {
	return () => (
		<button
			__exactEnhancements={createEnhancementNode([
				{ identity: facadeEnhancementIdentity, props: {} }
			])}
		>
			Save
		</button>
	);
}

/** Compiler-issued nested target-order root. */
export const targetOrderRoot = <TargetOrderRoot />;

/** Compiler-issued live clock root. */
export const clockRoot = <ClockRoot />;

/** Compiler-issued application-catalog page root. */
export const facadePageRoot = <FacadePage />;
