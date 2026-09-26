import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';
import {
	accessibilityConfigSource,
	accessibilityCssSource,
	accessibilityFocusSource,
	accessibilityIntlSource,
	accessibilityModalSource,
	accessibilityNativeSource,
	accessibilityNavigationSource,
	accessibilityRelationshipSource
} from './accessibility-sources.js';

/** Documents eXact's native-first accessibility runtime and provider. */
export function AccessibilityPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Component library / @exactjs/accessibility"
			title="Let the browser lead"
			description="Use semantic HTML, connect labels and descriptions, and add focus and keyboard behavior to custom controls."
			previous={{ path: '/components/date-time', label: 'Date & time' }}
			next={{ path: '/components/motion', label: 'Motion' }}
		>
			<section>
				<h2>Enable accessibility enhancements</h2>
				<p>
					A reusable dialog or input needs reliable labels, focus handling, and keyboard behavior
					wherever it appears. The accessibility package helps connect those behaviors to semantic
					HTML and checks common mistakes during development. Start with native controls, then add
					the enhancements your interface needs.
				</p>
				<CodeBlock source={accessibilityConfigSource} language="ts" title="exact.config.ts" />
				<p>
					Enable the package in your application configuration to use <code>a11y:*</code> attributes
					throughout your components, or use an attributed import in one component. The package also
					provides editor and build checks for accessibility mistakes. The runtime is included when
					an enhancement is used.
				</p>
			</section>
			<section>
				<h2>Connect elements with refs</h2>
				<p>
					Generating unique IDs and keeping ARIA references matched is easy to get wrong when a
					field appears several times. Pass element refs to the relationship attributes below; eXact
					supplies stable IDs when needed and preserves the relationship through hydration.
				</p>
				<CodeBlock source={accessibilityRelationshipSource} language="tsx" title="Password.tsx" />
				<p>
					<code>labelledBy</code>, <code>describedBy</code>, <code>controls</code>,
					<code>details</code>, <code>errorMessage</code>, <code>flowTo</code>, <code>owns</code>,
					and
					<code>activeDescendant</code> cover every ARIA ID-reference property. Authored IDs win;
					otherwise core assigns one permanent platform UUID. SSR emits ref identity before any
					later relationship can need it, and hydration adopts the same nodes and tokens.
				</p>
			</section>
			<section>
				<h2>Open and close a dialog</h2>
				<CodeBlock source={accessibilityModalSource} language="tsx" title="Settings.tsx" />
				<p>
					<code>modal:isOpen</code> bidirectionally binds a writable reactive boolean to the
					dialog&apos;s native modal state. Opening or closing the dialog updates the boolean, and
					changing the boolean opens or closes the dialog with <code>showModal()</code> or
					<code>close()</code>. It does not use the nonmodal <code>open</code> attribute.
				</p>
				<p>
					Native <code>commandFor</code> controls can open, request-close, or close the dialog
					without authored event handlers. The accessibility enhancement validates target
					references, command compatibility, and accessible dialog naming.
				</p>
				<Callout title="Native modality stays native" tone="tip">
					<p>
						The enhancement adds focus entry/restoration only. The browser continues to own
						top-layer placement, containment, Escape behavior, and background inertness.
					</p>
				</Callout>
			</section>
			<section>
				<h2>Set initial focus and return focus</h2>
				<CodeBlock source={accessibilityFocusSource} language="tsx" title="Editor.tsx" />
				<p>
					Initial focus runs after a new browser publication, never during passive hydration. Return
					focus defaults to the captured opener or can use an explicit ref. Set return focus to
					<code>false</code> to disable restoration. Nested scopes restore in stack order and do not
					steal focus after the user moves elsewhere.
				</p>
			</section>
			<section>
				<h2>Add keyboard navigation to a custom widget</h2>
				<CodeBlock source={accessibilityNavigationSource} language="tsx" title="AssigneeList.tsx" />
				<p>
					The runtime ships complete focus movement for <code>tablist</code>, <code>listbox</code>,
					<code>radiogroup</code>, <code>toolbar</code>, and <code>grid</code>. It supports roving
					tab index or active descendant, role-derived orientation and wrapping, Home/End, and
					optional PageUp/PageDown steps. Selection, checked state, and activation remain ordinary
					application state.
				</p>
				<p>
					Editor hover follows the innermost JSX element at the cursor, so an outer layout element
					cannot hide guidance for a nested <code>a11y:*</code> activation.
				</p>
				<p>
					Tree, menu, menubar, and treegrid are deliberately rejected until the package can expose a
					complete expand/submenu/action contract. One bounded observer follows eligible
					descendants; there is no document observer or renderer-wide notification hook.
				</p>
			</section>
			<section>
				<h2>Translate accessible names</h2>
				<CodeBlock source={accessibilityIntlSource} language="tsx" title="DeleteButton.tsx" />
				<p>
					Intl owns localized scalar properties. Accessibility owns ref identity and validates the
					resulting semantic shape. Both fallbacks may remain in the markup; native accessible-name
					precedence determines the effective source without either package recognizing or
					suppressing the other.
				</p>
			</section>
			<section>
				<h2>Use browser accessibility features</h2>
				<CodeBlock source={accessibilityNativeSource} language="tsx" title="NativePatterns.tsx" />
				<CodeBlock source={accessibilityCssSource} language="css" title="accessibility.css" />
				<p>
					There is no framework live-region scheduler, modality emulation, input-modality context,
					or locale direction coordinator. Prefer controls, labels, disclosure, popover, live-region
					roles,
					<code>:focus-visible</code>, and user preference media queries directly.
				</p>
			</section>
			<section>
				<h2>Check accessibility while editing</h2>
				<p>
					The package provider validates ARIA names and values, IDs, labels and name evidence,
					native commands, positive focus order, pointer-only custom interactions, focus companion
					props, dialogs, live-region conflicts, and composite structure. Hovers explain evidence
					and uncertainty, completions use pinned ARIA data, and navigation inlays show inferred
					policy. Enabled errors and warnings use the same build gate in the editor and build. No
					analyzer code is bundled for the browser.
				</p>
			</section>
		</Article>
	);
}
