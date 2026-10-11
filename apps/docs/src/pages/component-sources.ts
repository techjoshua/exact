/** Source example for the components lesson. */
export const componentSource = `import type { Child, Component } from '@exactjs/core';

type CardState = { open: boolean };
type CardProps = { name: string; children?: Child };

function ProfileCard(this: Component<CardState>, props: CardProps) {
  // Per-instance declarations: a state default and mounted work.
  this.state.open = false;
  this.onMount(() => this.log.info('Profile mounted'));

  // View: the returned function keeps reactive expressions connected.
  return () => (
    <article className="profile-card" className:is-open={this.state.open}>
      <button onClick={() => this.state.open = !this.state.open}>
        {props.name}
      </button>
      {this.state.open ? props.children : null}
    </article>
  );
}`;

/** Source example for the components lesson. */
export const partitionSource = `import type { Child } from '@exactjs/core';
import { partitionChildren } from '@exactjs/core/children';

function DialogTitle(props: { children?: Child }) {
  return () => <h2>{props.children}</h2>;
}

function DialogActions(props: { children?: Child }) {
  return () => props.children;
}

function Dialog(props: { children?: Child }) {
  const parts = partitionChildren(props.children, {
    title: DialogTitle,
    actions: DialogActions
  });
  return () => (
    <section role="dialog">
      {parts.title.length > 0 && <header>{parts.title}</header>}
      <main>{parts.remaining}</main>
      {parts.actions.length > 0 && <footer>{parts.actions}</footer>}
    </section>
  );
}`;

/** Source example for the components lesson. */
export const dialogUsageSource = `<Dialog>
  <DialogTitle>Delete this draft?</DialogTitle>
  <p>You can create another draft later.</p>
  <DialogActions>
    <button onClick={cancel}>Keep draft</button>
    <button onClick={confirm}>Delete draft</button>
  </DialogActions>
</Dialog>`;

/** Source example for the components lesson. */
export const microComponentSource = `function Article(this: Component<ArticleState>) {
  const Footer = (props: { prefix?: string } = {}) => (
    <footer>{props.prefix}{this.state.copyrightText}</footer>
  );
  const Page = () => <article><ArticleBody /><Footer /></article>;

  return () => <Page />;
}`;

/** Source example for the components lesson. */
export const contextSource = `const ThemeContext = createContext<Theme>('theme');

function ThemeProvider(this: Component<{}>, props: { children?: Child }) {
  // Publish a value for descendants of this component.
  this.setContext(ThemeContext, { accent: 'teal', density: 'comfortable' });
  return () => props.children;
}

function Toolbar(this: Component<{}>) {
  // Lookup walks parent components, then framework defaults.
  const theme = this.getContext(ThemeContext);
  return () => <nav style={{ color: theme.accent }}>...</nav>;
}`;

/** Source example for the components lesson. */
export const componentTaskSource = `function Presence(this: Component<{ userId: string; status: string }>, props: { userId: string }) {
  this.state.status = 'connecting';

  async function observePresence(userId: string) {
    // The compiler infers props.userId and captures it for this generation.
    const response = await fetch('/api/presence/' + userId);
    this.state.status = (await response.json()).status;
  }
  observePresence(props.userId);

  return () => <span>{this.state.status}</span>;
}`;

/** Source example for the components lesson. */
export const componentValueSource = `function Results(this: Component<{ layout: 'grid' | 'list' }>) {
  // Immutable aliases and finite choices remain ordinary component values.
  const View = this.state.layout === 'grid' ? ResultGrid : ResultList;
  return () => <View />;
}`;

/** Source example for the components lesson. */
export const jsxExtraSource = `// Classic JSX strings and expressions work as expected.
<article className="card featured" />
<article className={\`card featured theme-\${props.theme}\`} />

// eXact also composes strings, arrays, truthy maps, and named tokens.
<article
  className={[
    \`card featured theme-\${props.theme}\`,
    { selected: this.state.selected, disabled: props.disabled }
  ]}
  className:compact={props.compact}
/>

// A matching prop name can be punned.
<Avatar {user} />`;

/** Source example for the components lesson. */
export const keyedFragmentSource = `import { _ } from '@exactjs/jsx';

return () => (
  <dl>
    {this.state.people.map((person) => (
      <_ key={person.id}>
        <dt>{person.name}</dt>
        <dd>{person.role}</dd>
      </_>
    ))}
  </dl>
);`;

/** Source example for the components lesson. */
export const compactBindingSource = `// Component prop + notification callback.
<SettingsPanel expanded:onExpandedChanged={this.state.settingsExpanded} />

// Equivalent component props:
<SettingsPanel
  expanded={this.state.settingsExpanded}
  onExpandedChanged={(expanded) => this.state.settingsExpanded = expanded}
/>

// Native property + browser event bindings.
<input value:onInput={this.state.name} />

// Equivalent native property and event handler:
<input
  value={this.state.name}
  onInput={(event) => this.state.name = event.currentTarget.value}
/>

<input type="number" value:onChange={this.state.quantity} />
<input type="checkbox" checked:onChange={this.state.subscribed} />
<input type="radio" value="ground" checked:onChange={this.state.delivery} />
<select multiple value:onChange={this.state.tags}>...</select>
<details open:onToggle={this.state.advanced}>Advanced settings</details>
<dialog modal:isOpen={this.state.settingsOpen}>Settings</dialog>`;

/** Source example for the components lesson. */
export const spreadOrderSource = `<input required {...this.state.fieldOptions} />
<input {...this.state.fieldOptions} required />`;
