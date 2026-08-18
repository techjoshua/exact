import type { Component } from '@exactjs/core';
import { render } from '@exactjs/dom';
import {
	ThemeModeToggle,
	ThemePreferenceContext,
	ThemePreferenceProvider
} from '@exactjs/app-theme-preference';
import { GestureControls } from './gesture-controls.js';
import { MotionControls } from './motion-controls.js';
import { PhysicsDemo } from './physics-demo.js';
import { ThemeLab } from './theme-lab.js';
import './styles.css';

function ThemedPlayground(this: Component<Record<string, never>>) {
	const preference = this.getContext(ThemePreferenceContext);
	return () => (
		<div
			className="app-theme"
			theme:scope
			theme:appearance={preference.appearance}
			theme:tonic="blue"
			theme:temperament="expressive"
		>
			<ThemeModeToggle
				appearance={preference.appearance}
				onToggle={() => preference.toggleAppearance()}
			/>
			<main>
				<header className="hero">
					<nav className="app-nav" aria-label="Application links">
						<a className="app-link" href="../">
							Documentation
						</a>
						<a className="app-link" href="#theme-lab">
							Theme Lab
						</a>
					</nav>
					<p theme:text="supporting" className="eyebrow">
						Attributed renderer enhancements
					</p>
					<h1 theme:text="display">Plugins for interfaces people already know</h1>
					<p theme:text="body">
						Motion, gestures, physics, and gravity remain independent capabilities. These examples
						show how they enhance familiar controls—and how all four compose without sharing a
						hidden state system.
					</p>
					<div className="plugin-key" aria-label="Demonstrated packages">
						<span>Motion</span>
						<span>Gestures</span>
						<span>Physics</span>
						<span>Gravity</span>
					</div>
				</header>
				<div className="demo-stack">
					<MotionControls />
					<GestureControls />
					<PhysicsDemo />
				</div>
				<ThemeLab />
			</main>
		</div>
	);
}

render(
	<ThemePreferenceProvider>
		<ThemedPlayground />
	</ThemePreferenceProvider>,
	document.getElementById('app')!
);
