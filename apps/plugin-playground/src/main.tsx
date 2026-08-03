import { render } from '@exactjs/dom';
import { GestureControls } from './gesture-controls.js';
import { MotionControls } from './motion-controls.js';
import { PhysicsDemo } from './physics-demo.js';
import './styles.css';

function PluginPlayground() {
	return () => (
		<main>
			<header className="hero">
				<p className="eyebrow">Attributed renderer enhancements</p>
				<h1>Plugins for interfaces people already know</h1>
				<p>
					Motion, gestures, physics, and gravity remain independent capabilities. These examples
					show how they enhance familiar controls—and how all four compose without sharing a hidden
					state system.
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
	);
}

render(<PluginPlayground />, document.getElementById('app')!);
