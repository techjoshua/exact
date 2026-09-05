import {
	ErrorContext,
	createErrorContext,
	createRef,
	type Child,
	type Component,
	type ErrorReport
} from '@exactjs/core';

let styleButton: Component<{ disabled: boolean; tone: string; compact: boolean }> | undefined;
let stylePanel: Component<{ active: boolean; hidden: boolean }> | undefined;
let cleanupSwitch: Component<{ mode: 'button' | 'input' }> | undefined;
let nestedSwitch: Component<{ mode: 'one' | 'two' }> | undefined;
let conformanceButton: Component<{ label: string; enabled: boolean }> | undefined;
let errorBoundary: Component<{ errors: ErrorReport[] }> | undefined;
let refDemo: Component<{ show: boolean }> | undefined;

/** Stable ref key used to observe cleanup behavior. */
export const cleanupButtonRef = createRef<HTMLButtonElement>('compiled-cleanup-button');
/** Stable ref key used by DOM conformance coverage. */
export const conformanceButtonRef = createRef<HTMLButtonElement>('compiled-conformance-button');

/** Compiler-backed style binding fixture. */
export function StyleButton(
	this: Component<{ disabled: boolean; tone: string; compact: boolean }>
) {
	styleButton = this;
	this.state.disabled = true;
	this.state.tone = 'red';
	this.state.compact = false;
	return () => (
		<button
			className={this.state.compact ? 'compact' : 'spacious'}
			disabled={this.state.disabled}
			style={{
				color: this.state.tone,
				backgroundColor: this.state.compact ? 'black' : undefined
			}}
		>
			Save
		</button>
	);
}

/** Reads the mounted style button fixture. */
export function styleButtonInstance() {
	if (!styleButton) throw new Error('StyleButton is not mounted');
	return styleButton;
}

/** Compiler-backed class normalization fixture. */
export function StylePanel(this: Component<{ active: boolean; hidden: boolean }>) {
	stylePanel = this;
	this.state.active = true;
	this.state.hidden = false;
	return () => (
		<section className={['panel', { active: this.state.active, hidden: this.state.hidden }]} />
	);
}

/** Reads the mounted style panel fixture. */
export function stylePanelInstance() {
	if (!stylePanel) throw new Error('StylePanel is not mounted');
	return stylePanel;
}

/** Compiler-backed intrinsic replacement and ref cleanup fixture. */
export function CleanupSwitch(this: Component<{ mode: 'button' | 'input' }>) {
	cleanupSwitch = this;
	this.state.mode = 'button';
	return () =>
		this.state.mode === 'button' ? (
			<button ref={this.ref(cleanupButtonRef)}>Save</button>
		) : (
			<input value="Saved" />
		);
}

/** Reads the mounted cleanup switch fixture. */
export function cleanupSwitchInstance() {
	if (!cleanupSwitch) throw new Error('CleanupSwitch is not mounted');
	return cleanupSwitch;
}

function CleanupOne() {
	return () => <span>one</span>;
}

function CleanupTwo() {
	return () => <strong>two</strong>;
}

/** Compiler-backed nested component replacement fixture. */
export function NestedCleanupSwitch(this: Component<{ mode: 'one' | 'two' }>) {
	nestedSwitch = this;
	this.state.mode = 'one';
	return () =>
		this.state.mode === 'one' ? (
			<section>
				<CleanupOne />
			</section>
		) : (
			<section>
				<CleanupTwo />
			</section>
		);
}

/** Reads the mounted nested cleanup fixture. */
export function nestedCleanupSwitchInstance() {
	if (!nestedSwitch) throw new Error('NestedCleanupSwitch is not mounted');
	return nestedSwitch;
}

/** Compiler-backed focused text and property update fixture. */
export function ConformanceButton(this: Component<{ label: string; enabled: boolean }>) {
	conformanceButton = this;
	this.state.label = 'Save';
	this.state.enabled = true;
	return () => (
		<button title={this.state.label} disabled={!this.state.enabled}>
			{this.state.label}
		</button>
	);
}

/** Reads the mounted conformance button fixture. */
export function conformanceButtonInstance() {
	if (!conformanceButton) throw new Error('ConformanceButton is not mounted');
	return conformanceButton;
}

/** Compiler-backed nearest error-context boundary fixture. */
export function CompiledErrorBoundary(
	this: Component<{ errors: ErrorReport[] }>,
	props: { children?: Child | Child[] }
) {
	errorBoundary = this;
	this.state.errors = [];
	this.setContext(ErrorContext, createErrorContext(this.state.errors));
	return () =>
		this.state.errors.length ? <section role="alert">Recovered</section> : props.children;
}

/** Compiler-backed child whose interaction fails. */
export function CompiledBrokenButton() {
	return () => (
		<button
			onClick={() => {
				throw new Error('event failed');
			}}
		>
			Break
		</button>
	);
}

/** Reads the mounted compiled error boundary fixture. */
export function compiledErrorBoundaryInstance() {
	if (!errorBoundary) throw new Error('CompiledErrorBoundary is not mounted');
	return errorBoundary;
}

/** Compiler-backed ref release fixture. */
export function CompiledRefDemo(this: Component<{ show: boolean }>) {
	refDemo = this;
	this.state.show = true;
	return () =>
		this.state.show ? (
			<button ref={this.ref(conformanceButtonRef)}>Action</button>
		) : (
			<span>gone</span>
		);
}

/** Reads the mounted ref fixture. */
export function compiledRefDemoInstance() {
	if (!refDemo) throw new Error('CompiledRefDemo is not mounted');
	return refDemo;
}
