/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes the namespace in JSX attributes. */
import { corpus } from './enhancement-routing.fixtures.js' with { type: 'exact-enhancement' };

function EnhancedButton(props: { children?: string }) {
	return () => <button data-role="component-target">{props.children}</button>;
}

function EnhancementComposition() {
	return () => (
		<section data-scenario="enhancements">
			<button data-role="intrinsic-target" corpus:tone="intrinsic">
				one
			</button>
			<EnhancedButton corpus:tone="component">two</EnhancedButton>
		</section>
	);
}

/** Compiler-issued intrinsic and component enhancement root. */
export const enhancementsRoot = <EnhancementComposition />;
