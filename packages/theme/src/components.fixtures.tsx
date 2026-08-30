import { createEnhancementNode, type Component, type ContextToken } from '@exactjs/core';
import { createExpression } from '@exactjs/core/runtime/render';
import {
	ThemeContext,
	ThemeScopeEnhancement as CompiledThemeScope
} from './components.js?exact-target=client';
import type { ThemeEnvironment } from './components.js';

export { CompiledThemeScope };

let reactiveAxisInstance: Component<{ temperament: 'dramatic' | 'monochrome' }> | undefined;
let densityInstance: Component<{ density: 'comfortable' | 'compact' }> | undefined;
let tonicInstance: Component<{ tonic: string }> | undefined;
let atomicInstance: Component<{ tonic: 'teal' | 'amber' }> | undefined;
let atomicMounts = 0;
let updateReactiveTemperament: (value: 'dramatic' | 'monochrome') => void = () => undefined;
let updateDensity: (value: 'comfortable' | 'compact') => void = () => undefined;
let updateCustomTonic: (value: string) => void = () => undefined;
let updateAtomicTonic: (value: 'teal' | 'amber') => void = () => undefined;

function ReactiveAxisApp(this: Component<{ temperament: 'dramatic' | 'monochrome' }>) {
	reactiveAxisInstance = this;
	this.state.temperament = 'dramatic';
	updateReactiveTemperament = (value) => (this.state.temperament = value);
	return () => (
		<_
			__exactEnhancements={createEnhancementNode([
				{
					identity: '@exactjs/theme/enhancements#scope',
					props: { scope: true, tonic: 'teal' }
				}
			])}
		>
			<_
				__exactEnhancements={createEnhancementNode([
					{
						identity: '@exactjs/theme/enhancements#scope',
						props: {
							scope: true,
							tonic: 'violet',
							temperament: createExpression(() => this.state.temperament)
						}
					}
				])}
			>
				<p>Nested</p>
			</_>
		</_>
	);
}

function DensityApp(this: Component<{ density: 'comfortable' | 'compact' }>) {
	densityInstance = this;
	this.state.density = 'comfortable';
	updateDensity = (value) => (this.state.density = value);
	return () => (
		<CompiledThemeScope scope density={this.state.density}>
			<CompiledThemeScope scope temperament="dramatic">
				<p>Nested</p>
			</CompiledThemeScope>
		</CompiledThemeScope>
	);
}

function ExplicitInheritApp() {
	return () => (
		<CompiledThemeScope scope tonic="amber" temperament="monochrome">
			<CompiledThemeScope scope tonic="inherit" temperament="inherit">
				<p>Nested</p>
			</CompiledThemeScope>
		</CompiledThemeScope>
	);
}

function CustomTonicApp(this: Component<{ tonic: string }>) {
	tonicInstance = this;
	this.state.tonic = '#7c3aed';
	updateCustomTonic = (value) => (this.state.tonic = value);
	return () => (
		<CompiledThemeScope scope tonic={this.state.tonic}>
			<p>Custom tonic</p>
		</CompiledThemeScope>
	);
}

const designTokenTonic = {
	colorSpace: 'display-p3' as const,
	components: [0.45, 0.2, 0.72] as const
};

function DesignTokenApp() {
	return () => (
		<CompiledThemeScope scope tonic={designTokenTonic}>
			<p>Design token tonic</p>
		</CompiledThemeScope>
	);
}

function AtomicChild(this: Component<{}>) {
	atomicMounts++;
	const theme = this.getContext(ThemeContext as ContextToken<ThemeEnvironment>);
	return () => <input id="stable" data-fingerprint={theme.current.fingerprint} />;
}

function AtomicApp(this: Component<{ tonic: 'teal' | 'amber' }>) {
	atomicInstance = this;
	this.state.tonic = 'teal';
	updateAtomicTonic = (value) => (this.state.tonic = value);
	return () => (
		<CompiledThemeScope scope tonic={this.state.tonic}>
			<div>
				<AtomicChild />
			</div>
		</CompiledThemeScope>
	);
}

/** Issues the nested reactive-axis fixture operation. */
export const reactiveAxisRoot = () => <ReactiveAxisApp />;
/** Issues the density-propagation fixture operation. */
export const densityRoot = () => <DensityApp />;
/** Issues the explicit-inheritance fixture operation. */
export const explicitInheritRoot = () => <ExplicitInheritApp />;
/** Issues the custom-tonic fixture operation. */
export const customTonicRoot = () => <CustomTonicApp />;
/** Issues the design-token fixture operation. */
export const designTokenRoot = () => <DesignTokenApp />;
/** Issues the atomic-update fixture operation. */
export const atomicRoot = () => <AtomicApp />;

/** Updates the mounted reactive-axis fixture. */
export function setReactiveTemperament(value: 'dramatic' | 'monochrome'): void {
	if (!reactiveAxisInstance) throw new Error('Reactive axis fixture is not mounted');
	updateReactiveTemperament(value);
}

/** Updates the mounted density fixture. */
export function setDensity(value: 'comfortable' | 'compact'): void {
	if (!densityInstance) throw new Error('Density fixture is not mounted');
	updateDensity(value);
}

/** Updates the mounted custom-tonic fixture. */
export function setCustomTonic(value: string): void {
	if (!tonicInstance) throw new Error('Custom tonic fixture is not mounted');
	updateCustomTonic(value);
}

/** Updates the mounted atomic fixture. */
export function setAtomicTonic(value: 'teal' | 'amber'): void {
	if (!atomicInstance) throw new Error('Atomic fixture is not mounted');
	updateAtomicTonic(value);
}

/** Resets the atomic child mount counter before a lifecycle assertion. */
export function resetAtomicMounts(): void {
	atomicMounts = 0;
}

/** Reads the atomic child mount counter. */
export function atomicMountCount(): number {
	return atomicMounts;
}
