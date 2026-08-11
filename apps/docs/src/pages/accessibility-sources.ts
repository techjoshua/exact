/** Package-scoped enhancement and provider activation example. */
export const accessibilityConfigSource = `// exact.config.ts
// prettier-ignore
export * as a11y from '@exactjs/accessibility/enhancements' with { type: 'exact-enhancement', scope: 'package' };

export default defineConfig({});`;

/** Ref-based relationship example with no handwritten element ID. */
export const accessibilityRelationshipSource = `const helpKey = createRef<HTMLSpanElement>('password help');

function Password(this: Component<{}>) {
  const help = this.ref(helpKey);
  return () => (
    <label>
      Password
      <input a11y:describedBy={help} />
      <span ref={help}>Use at least twelve characters.</span>
    </label>
  );
}`;

/** Native modal binding, commands, naming, and focus-scope example. */
export const accessibilityModalSource = `function Settings(this: Component<{ open: boolean }>) {
  this.state.open = false;

  this.log.info(
    \`Settings dialog \${this.state.open ? 'opened' : 'closed'}\`
  );

  return () => (
    <>
      <button commandFor="settings" command="show-modal">Settings</button>
      <dialog
        id="settings"
        modal:isOpen={this.state.open}
        a11y:focusScope
        aria-labelledby="settings-title"
      >
        <h2 id="settings-title">Settings</h2>
        <button commandFor="settings" command="request-close">Cancel</button>
        <button commandFor="settings" command="close">Save</button>
      </dialog>
    </>
  );
}`;

/** Explicit focus entry and return targets for a bounded region. */
export const accessibilityFocusSource = `<section
  a11y:focusScope
  a11y:initialFocus={firstField}
  a11y:returnFocus={opener}
>
  <input ref={firstField} />
</section>`;

/** Roving listbox navigation with application-owned selection. */
export const accessibilityNavigationSource = `<ul role="listbox" aria-label="Assignee" a11y:navigate>
  {this.map(this.state.people, (person) => person.id, (person) => (
    <li
      role="option"
      aria-selected={person.id === this.state.assignee}
      onClick={() => this.state.assignee = person.id}
    >
      {person.name}
    </li>
  ))}
</ul>`;

/** Coexisting localized scalar fallback and ref relationship example. */
export const accessibilityIntlSource = `const label = this.ref(labelKey);

<span ref={label} intl:message>Delete selected messages</span>
<button
  aria-label={\`Delete \${this.state.count} messages\`}
  intl:aria-label="plural:cardinal"
  a11y:labelledBy={label}
>
  <TrashIcon aria-hidden="true" />
</button>`;

/** Browser-owned controls, disclosure, and live-region semantics. */
export const accessibilityNativeSource = `<button type="button">Save</button>
<details><summary>Advanced settings</summary>{advanced}</details>
<div role="status" aria-live="polite">{this.state.progress}</div>`;

/** Native focus and reduced-motion preference styles. */
export const accessibilityCssSource = `button:focus-visible {
  outline: 2px solid currentColor;
}

@media (prefers-reduced-motion: reduce) {
  .decorative-motion { animation: none; }
}`;
