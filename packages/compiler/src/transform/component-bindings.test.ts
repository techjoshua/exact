import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { transformSource } from '../compilation/transformation.js';

describe('@exactjs/compiler component value/callback bindings', () => {
	it('lowers shorthand through the ordinary reactive value and state-write callback path', () => {
		const result = transformSource(
			`
				declare class Component<S extends object> { state: S; }
				type DialogProps = {
					open: boolean;
					onOpenChanged?(open: boolean, reason?: string): void;
				};
				function Dialog(props: DialogProps) {
					return () => props.open ? <dialog open /> : null;
				}
				export function Page(this: Component<{ dialogOpen: boolean }>) {
					return () => <Dialog open:onOpenChanged={this.state.dialogOpen} />;
				}
			`,
			{
				filename: path.resolve('src/fixtures/component-binding-page.tsx'),
				generatedValidation: 'semantic'
			}
		);

		expect(result.code).not.toContain('open:onOpenChanged');
		expect(result.code).toContain('open: __exactExpression(() => this.state.dialogOpen)');
		expect(result.code).toContain('onOpenChanged: (__exactBindingValue: boolean) =>');
		expect(result.code).toContain(
			'__exactWrite(this.state, ["dialogOpen"], () => __exactBindingValue)'
		);
	});

	it('rejects an explicit generated prop instead of composing callbacks', () => {
		expect(() =>
			transformSource(
				`
					type DialogProps = { open: boolean; onOpenChanged(open: boolean): void };
					declare function Dialog(props: DialogProps): unknown;
					export function Page(this: Component<{ dialogOpen: boolean }>) {
						return () => <Dialog
							open:onOpenChanged={this.state.dialogOpen}
							onOpenChanged={() => {}}
						/>;
					}
				`,
				{ filename: '/app/Page.tsx' }
			)
		).toThrow(/onOpenChanged.*also explicitly authored/);
	});

	it('rejects generated props supplied by finite spreads', () => {
		expect(() =>
			transformSource(
				`
					type DialogProps = { open: boolean; onOpenChanged(open: boolean): void };
					declare function Dialog(props: DialogProps): unknown;
					export function Page(this: Component<{ dialogOpen: boolean }>) {
						const supplied = { open: true };
						return () => <Dialog {...supplied} open:onOpenChanged={this.state.dialogOpen} />;
					}
				`,
				{ filename: '/app/Page.tsx' }
			)
		).toThrow(/open.*finite JSX spread/);
	});

	it('aligns intrinsic endpoint names and lowers details through a toggle adapter', () => {
		const result = transformSource(
			`
				export function Disclosure(this: Component<{ open: boolean }>) {
					return () => <details open:onToggle={this.state.open} onToggle={() => {}}>More</details>;
				}
			`,
			{ filename: '/app/Disclosure.tsx' }
		);

		expect(result.code).toContain('open: __exactExpression(() => this.state.open ?? false)');
		expect(result.code).toContain('__exactBindToggle:');
		expect(result.code).toContain('event.currentTarget.open');
		expect(result.code).toContain('"__exactClosedInteraction:onToggle": () => { }');
	});

	it('lowers modal state without serializing an open HTML attribute', () => {
		const source = `
				export function Modal(this: Component<{ open: boolean }>) {
					return () => <dialog modal:isOpen={this.state.open}>Settings</dialog>;
				}
			`;
		const result = transformSource(source, { filename: '/app/Modal.tsx' });
		const server = transformSource(source, { filename: '/app/Modal.tsx', target: 'server' });

		expect(result.code).not.toContain('modal:isOpen');
		expect(result.code).toContain('import "@exactjs/dom/runtime/modal"');
		expect(result.code).toContain(
			'__exactModalOpen: __exactExpression(() => this.state.open ?? false)'
		);
		expect(result.code).toContain('__exactBindModalToggle:');
		expect(result.code).toContain('__exactBindModalClose:');
		expect(result.code).toContain('event.currentTarget.matches(":modal")');
		expect(server.code).not.toContain('modal:isOpen');
		expect(server.code).not.toContain('__exactModalOpen');
		expect(server.code).not.toContain('@exactjs/dom/runtime/modal');
		expect(server.code).toContain('statePaths: [');
		expect(server.code).toContain('"open"');
	});

	it('rejects invalid or multiply owned modal dialog bindings', () => {
		expect(() =>
			transformSource(
				`export function Modal(this: Component<{ open: boolean }>) {
					return () => <section modal:isOpen={this.state.open}>Settings</section>;
				}`,
				{ filename: '/app/Modal.tsx' }
			)
		).toThrow(/modal:isOpen.*supported only.*dialog/);

		expect(() =>
			transformSource(
				`export function Modal(this: Component<{ open: boolean }>) {
					return () => <dialog open modal:isOpen={this.state.open}>Settings</dialog>;
				}`,
				{ filename: '/app/Modal.tsx' }
			)
		).toThrow(/modal:isOpen cannot be combined with an explicit open prop/);

		expect(() =>
			transformSource(
				`declare class Component<S extends object> { state: S; }
				export function Modal(this: Component<{ open: string }>) {
					return () => <dialog modal:isOpen={this.state.open}>Settings</dialog>;
				}`,
				{ filename: '/app/Modal.tsx', generatedValidation: 'semantic' }
			)
		).toThrow(/modal:isOpen requires a boolean state location/);

		expect(() =>
			transformSource(
				`export function Modal(props: { open: boolean }) {
					return () => <dialog modal:isOpen={props.open}>Settings</dialog>;
				}`,
				{ filename: '/app/Modal.tsx' }
			)
		).toThrow(/writable component state location/);
	});

	it('requires a writable state target and notification-only callback contract', () => {
		expect(() =>
			transformSource(
				`
					type DialogProps = { open: boolean; onOpenChanged(open: boolean): Promise<void> };
					declare function Dialog(props: DialogProps): unknown;
					export function Page(this: Component<{ dialogOpen: boolean }>) {
						return () => <Dialog open:onOpenChanged={this.state.dialogOpen} />;
					}
				`,
				{ filename: '/app/Page.tsx' }
			)
		).toThrow(/must return only void or undefined/);

		expect(() =>
			transformSource(
				`
					type DialogProps = { open: boolean; onOpenChanged(open: boolean): void };
					declare function Dialog(props: DialogProps): unknown;
					export function Page(props: { open: boolean }) {
						return () => <Dialog open:onOpenChanged={props.open} />;
					}
				`,
				{ filename: '/app/Page.tsx' }
			)
		).toThrow(/compiler-proven writable state location/);
	});

	it('retains proven aliases and dynamic state paths', () => {
		const result = transformSource(
			`
				declare class Component<S extends object> { state: S; }
				type ToggleProps = { checked: boolean; publish(next: boolean): void };
				declare function Toggle(props: ToggleProps): unknown;
				export function Page(this: Component<{ rows: Record<string, { enabled: boolean }>; selected: string }>) {
					const rows = this.state.rows;
					return () => <Toggle checked:publish={rows[this.state.selected].enabled} />;
				}
			`,
			{ filename: '/app/Page.tsx' }
		);
		expect(result.code).toContain(
			'__exactWrite(this.state, ["rows", this.state.selected, "enabled"]'
		);
	});

	it('rejects incompatible callback flow, overloads, and shared generated props', () => {
		expect(() =>
			transformSource(
				`
					declare class Component<S extends object> { state: S; }
					type ToggleProps = { checked: boolean; publish(next: string): void };
					declare function Toggle(props: ToggleProps): unknown;
					export function Page(this: Component<{ enabled: boolean }>) {
						return () => <Toggle checked:publish={this.state.enabled} />;
					}
				`,
				{ filename: '/app/Page.tsx' }
			)
		).toThrow(/callback value string is not assignable/);

		expect(() =>
			transformSource(
				`
					declare class Component<S extends object> { state: S; }
					type ToggleProps = {
						checked: boolean;
						publish: { (next: boolean): void; (next: boolean, reason: string): void };
					};
					declare function Toggle(props: ToggleProps): unknown;
					export function Page(this: Component<{ enabled: boolean }>) {
						return () => <Toggle checked:publish={this.state.enabled} />;
					}
				`,
				{ filename: '/app/Page.tsx' }
			)
		).toThrow(/one unambiguous call signature/);

		expect(() =>
			transformSource(
				`
					declare class Component<S extends object> { state: S; }
					type WidgetProps = { first: boolean; second: boolean; publish(next: boolean): void };
					declare function Widget(props: WidgetProps): unknown;
					export function Page(this: Component<{ first: boolean; second: boolean }>) {
						return () => <Widget
							first:publish={this.state.first}
							second:publish={this.state.second}
						/>;
					}
				`,
				{ filename: '/app/Page.tsx' }
			)
		).toThrow(/publish is generated by more than one component binding/);
	});

	it('does not recognize the removed intrinsic abbreviations', () => {
		expect(() =>
			transformSource(
				`export function Editor(this: Component<{ name: string }>) {
					return () => <input value:input={this.state.name} />;
				}`,
				{ filename: '/app/Editor.tsx' }
			)
		).toThrow(/supported intrinsic bindings are value:onInput/);
	});
});
