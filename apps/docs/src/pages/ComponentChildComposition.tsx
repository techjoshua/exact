import { CodeBlock } from '../CodeBlock.jsx';
import { partitionSource, dialogUsageSource } from './component-sources.js';

/** Teaches immediate child selection and one-active-placement ownership. */
export function ComponentChildComposition() {
	return () => (
		<section>
			<h2>Arrange children into a shared layout</h2>
			<p>
				A dialog may need to place its title, body, and actions in different regions while letting
				callers supply them as children. <code>partitionChildren()</code> groups those immediate
				children so the dialog can arrange them without recreating their content.
			</p>
			<CodeBlock
				source={dialogUsageSource}
				language="tsx"
				title="Excerpt: content supplied by a caller"
			/>
			<p>
				The caller supplies a title, ordinary body content, and action buttons. The layout below
				selects the two named components and leaves the paragraph in the body.
			</p>
			<CodeBlock source={partitionSource} language="tsx" title="Dialog layout" />
			<p>
				The header and footer appear only when their groups contain children. Each child enters the
				first matching group. Unmatched children go into
				<code>remaining</code>, and order stays the same within each group. Write the children you
				want to select directly inside the parent: partitioning does not execute a nested component
				to inspect what it will render. This example shows layout. A complete dialog also needs{' '}
				<a href="#/components/accessibility">accessible naming and interaction</a>.
			</p>
			<p>
				A forwarded child is prepared when its receiving component consumes it. Unselected content
				is not mounted. A supplied child keeps its supplier's dependencies and cleanup. Place it
				once in the active tree. To repeat content, author separate JSX children or call a JSX
				helper for each placement. Removing it disposes its instance. Restoring it mounts a fresh
				instance. Server elements, ranges and scalars reach client islands through compiler-owned
				server slots. Hiding a region with the native <code>hidden</code> attribute keeps its
				children mounted. Hydration retains that server content while activating its receiver. If
				mismatch recovery replaces the receiver's shell, the shell can have new DOM nodes while
				valid server content remains available.
			</p>
			<details>
				<summary>Selectors and child transformation helpers</summary>
				<p>
					Selectors accept component types, intrinsic tag names, <code>childKinds.text</code>
					for strings and numbers, or arrays of those choices. Arrays of children flatten, empty
					values disappear, and explicit fragments remain one opaque child.
				</p>
				<p>
					For an intrinsic child, <code>childrenOf(element)</code> returns a fresh child array.
					<code>withChildren(element, replacement)</code> derives an element with new contents while
					retaining attribute bindings, key, refs, and enhancements. These helpers compose
					renderable values. They do not move already-mounted component instances.
				</p>
			</details>
		</section>
	);
}
