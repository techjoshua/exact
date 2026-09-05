import { CodeBlock } from '../CodeBlock.jsx';

const enhancementSource = `<section>
  <div theme:surface="raised">Raised surface</div>
  <h2 theme:text="heading">Account</h2>
  <p theme:text="muted">Changes are saved immediately.</p>

  <input theme:field aria-invalid={this.state.invalid} />
  <button theme:action="primary">Save</button>
  <button theme:action="quiet" theme:tone="danger">Delete</button>
</section>`;

/** Documents the finite semantic element vocabulary and its intended meanings. */
export function ThemeVocabularySection() {
	return () => (
		<section>
			<h2>The element vocabulary stays finite</h2>
			<CodeBlock source={enhancementSource} language="tsx" title="Semantic theme labels" />
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Enhancement</th>
							<th>Values</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>
								<code>theme:surface</code>
							</td>
							<td>auto, base, raised, floating, sunken, overlay, transparent</td>
						</tr>
						<tr>
							<td>
								<code>theme:action</code>
							</td>
							<td>primary, secondary, quiet</td>
						</tr>
						<tr>
							<td>
								<code>theme:field</code>
							</td>
							<td>default, subtle, bare</td>
						</tr>
						<tr>
							<td>
								<code>theme:text</code>
							</td>
							<td>body, supporting, muted, heading, display, code</td>
						</tr>
						<tr>
							<td>
								<code>theme:status</code>
							</td>
							<td>neutral, info, success, warning, danger</td>
						</tr>
						<tr>
							<td>
								<code>theme:separator</code>
							</td>
							<td>subtle, strong</td>
						</tr>
						<tr>
							<td>
								<code>theme:selection</code>
							</td>
							<td>subtle, strong</td>
						</tr>
					</tbody>
				</table>
			</div>
			<h3>Choose values by meaning</h3>
			<p>
				The value names describe the element&apos;s job; the active theme decides its visual result.
				Boolean shorthand chooses the ordinary default: surface becomes auto, action becomes
				secondary, field becomes default, text becomes body, and separator and selection become
				subtle.
			</p>
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Surface</th>
							<th>When to use it</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>auto</td>
							<td>
								An ordinary nested container. It reads the nearest numeric surface bundle, advances
								one level (capped at 3), binds that level&apos;s colors, borders, shadow, and
								padding, and publishes the new level to descendants.
							</td>
						</tr>
						<tr>
							<td>base</td>
							<td>Return content to the scope&apos;s base surface.</td>
						</tr>
						<tr>
							<td>raised</td>
							<td>An explicit card or panel one level above its parent.</td>
						</tr>
						<tr>
							<td>floating</td>
							<td>A popover-like or especially prominent region two levels above its parent.</td>
						</tr>
						<tr>
							<td>sunken</td>
							<td>An inset well or recessed control group.</td>
						</tr>
						<tr>
							<td>overlay</td>
							<td>A menu, dialog panel, tooltip, or other content above ordinary surfaces.</td>
						</tr>
						<tr>
							<td>transparent</td>
							<td>A surface context boundary with no background, border, shadow, or padding.</td>
						</tr>
					</tbody>
				</table>
			</div>
			<p>
				Auto handles generated surface-level composition only. It does not inspect content, infer
				overlay or sunken semantics, or make an element interactive or draggable. Those choices
				remain explicit.
			</p>
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Text</th>
							<th>When to use it</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>body</td>
							<td>Normal prose, labels, values, and primary reading text.</td>
						</tr>
						<tr>
							<td>supporting</td>
							<td>
								Secondary explanations, metadata, captions, and helper text; muted and smaller.
							</td>
						</tr>
						<tr>
							<td>muted</td>
							<td>De-emphasized text that should retain the surrounding text size.</td>
						</tr>
						<tr>
							<td>heading</td>
							<td>Routine section and component headings.</td>
						</tr>
						<tr>
							<td>display</td>
							<td>
								A page hero, major identity, or exceptional headline—not routine section titles.
							</td>
						</tr>
						<tr>
							<td>code</td>
							<td>Source, commands, identifiers, or aligned data where monospace matters.</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Role</th>
							<th>Value</th>
							<th>When to use it</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>action</td>
							<td>primary</td>
							<td>The main action in the current decision area.</td>
						</tr>
						<tr>
							<td>action</td>
							<td>secondary</td>
							<td>A normal alternative with a visible control boundary.</td>
						</tr>
						<tr>
							<td>action</td>
							<td>quiet</td>
							<td>A low-emphasis contextual or toolbar action.</td>
						</tr>
						<tr>
							<td>field</td>
							<td>default</td>
							<td>An ordinary control with the clearest surface boundary.</td>
						</tr>
						<tr>
							<td>field</td>
							<td>subtle</td>
							<td>A softly filled field in a dense panel or grouped form.</td>
						</tr>
						<tr>
							<td>field</td>
							<td>bare</td>
							<td>A field whose containing composite already supplies its boundary.</td>
						</tr>
						<tr>
							<td>selection</td>
							<td>subtle</td>
							<td>A tab, filter, or toggle selected without competing with an action.</td>
						</tr>
						<tr>
							<td>selection</td>
							<td>strong</td>
							<td>A compact switcher whose active choice needs a solid fill.</td>
						</tr>
						<tr>
							<td>separator</td>
							<td>subtle</td>
							<td>A division between nearby related content.</td>
						</tr>
						<tr>
							<td>separator</td>
							<td>strong</td>
							<td>A major boundary between regions.</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Status or tone</th>
							<th>Meaning</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>neutral</td>
							<td>Ordinary UI or information with no outcome meaning.</td>
						</tr>
						<tr>
							<td>accent</td>
							<td>Brand, current selection, or intentional emphasis; a tone modifier only.</td>
						</tr>
						<tr>
							<td>info</td>
							<td>Helpful information or a notable in-progress fact.</td>
						</tr>
						<tr>
							<td>success</td>
							<td>Confirmed completion, validity, availability, or positive outcome.</td>
						</tr>
						<tr>
							<td>warning</td>
							<td>A recoverable risk that deserves attention before proceeding.</td>
						</tr>
						<tr>
							<td>danger</td>
							<td>Invalid input, destructive consequence, failure, or urgent condition.</td>
						</tr>
					</tbody>
				</table>
			</div>
			<p>
				Status accepts every meaning above except accent. The tone modifier applies the same meaning
				to another role. Size is independent: small is dense secondary UI, medium is the default,
				and large is prominent or touch-forward. Size never changes semantic importance.
			</p>
			<p>
				The shared <code>theme:tone</code> modifier accepts neutral, accent, info, success, warning,
				and danger. <code>theme:size</code> accepts small, medium, and large where the role owns a
				control size. Native and ARIA state supplies disabled, invalid, selected, current, pressed,
				checked, hover, focus, and active information.
			</p>
			<p>
				Actions and selections are inherently interactive. <code>theme:interactive</code> marks an
				interactive surface, while reactive <code>theme:dragging</code> raises an action, selection,
				or surface to the drag depth. Native disabled and <code>aria-busy</code> states suppress
				transient depth changes without another theme prop. Elevated solid actions add an
				appearance-aware contact shadow so saturated fills retain visible depth in light and dark
				appearances.
			</p>
			<p>
				Elevated themes raise physical controls on pointer hover, press them into an inset shadow
				during transient activation, and lift dragged elements furthest. Flat and bordered themes
				keep the same state colors and borders without decorative shadows. Focus, validation,
				persistent selection, and expanded state do not masquerade as physical depth.
			</p>
			<p>
				Dark elevation uses increasingly broad light halos plus a dark contact shadow. Solid actions
				add a contrasting contact ring, and pressed controls use an inset ring, so each state
				remains visibly distinct from both the surface and the control fill.
			</p>
			<p>
				Field recipes branch through native selectors for textual inputs, selects, checkboxes,
				radios, ranges, progress, meters, color controls, and files. They retain platform
				affordances and never require a compiler-invented control role. Progress uses interoperable
				engine pseudo-elements for its reactive accent fill and neutral track; meter uses native
				accent rendering. Both clip their fill to the configured field radius.
			</p>
		</section>
	);
}
