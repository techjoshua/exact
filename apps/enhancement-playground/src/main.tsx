import { render } from '@exactjs/dom';
import { _ } from '@exactjs/jsx';
import { GestureControls } from './gesture-controls.js';
import { MotionControls } from './motion-controls.js';
import { PhysicsDemo } from './physics-demo.js';
import './styles.css';

function PluginPlayground() {
	return () => (
		<_ theme:scope theme:appearance="dark" theme:tonic="blue" theme:temperament="expressive">
			<main>
				<header className="hero">
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
			</main>
		</_>
	);
}

render(<PluginPlayground />, document.getElementById('app')!);
