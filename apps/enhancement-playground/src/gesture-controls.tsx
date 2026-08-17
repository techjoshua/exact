import { peek, type Component } from '@exactjs/core';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Consumed by gesture:* attributes.
import gesture from '@exactjs/gestures' with { type: 'exact-enhancement' };
import { defineGesture, type GestureSample, type PinchGestureSample } from '@exactjs/gestures';

type GestureControlsState = {
	presses: number;
	lastPress: GestureSample['pointerType'] | 'none';
	slider: number;
	hovered: boolean;
	previewInput: GestureSample['pointerType'];
	held: boolean;
	panX: number;
	panY: number;
	zoom: number;
	rotation: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
	Math.min(maximum, Math.max(minimum, value));

/** Familiar controls driven by semantic pointer, focus, touch, and keyboard intent. */
export function GestureControls(this: Component<GestureControlsState>) {
	this.state.presses = 0;
	this.state.lastPress = 'none';
	this.state.slider = 48;
	this.state.hovered = false;
	this.state.previewInput = 'mouse';
	this.state.held = false;
	this.state.panX = 0;
	this.state.panY = 0;
	this.state.zoom = 1;
	this.state.rotation = 0;
	const state = this.state;

	function applaud(sample: GestureSample) {
		state.presses++;
		state.lastPress = sample.pointerType;
	}
	const pressControl = defineGesture({
		name: 'applause-button',
		semantics: 'control',
		press: { onPress: applaud },
		keyboard: { onPress: applaud }
	});
	const hoverIntent = defineGesture({
		name: 'preview-intent',
		semantics: 'decorative',
		hover: {
			onStart: (sample) => {
				this.state.hovered = true;
				this.state.previewInput = sample.pointerType;
			},
			onEnd: () => {
				this.state.hovered = false;
			}
		}
	});
	let sliderOrigin = 0;
	function beginSlider() {
		sliderOrigin = state.slider;
	}
	function moveSlider(sample: GestureSample) {
		const origin = sample.pointerType === 'keyboard' ? state.slider : sliderOrigin;
		state.slider = Math.round(clamp(origin + sample.delta.x / 2, 0, 100));
	}
	function moveSliderWithKeyboard(sample: GestureSample) {
		state.slider = Math.round(clamp(state.slider + sample.delta.x, 0, 100));
	}
	const sliderControl = defineGesture({
		name: 'volume-slider',
		semantics: 'control',
		drag: {
			axis: 'x',
			threshold: 1,
			onStart: beginSlider,
			onMove: moveSlider
		},
		keyboard: {
			step: 10,
			onMove: moveSliderWithKeyboard
		},
		touchAction: 'none'
	});
	function confirmHold() {
		state.held = !peek(() => state.held);
	}
	const holdControl = defineGesture({
		name: 'hold-to-confirm',
		semantics: 'control',
		press: {
			delay: 650,
			onPress: confirmHold
		},
		keyboard: {
			onPress: confirmHold
		}
	});
	let panOrigin = { x: 0, y: 0 };
	let zoomOrigin = 1;
	let rotationOrigin = 0;
	function beginPan() {
		panOrigin = { x: state.panX, y: state.panY };
	}
	function movePan(sample: GestureSample) {
		state.panX = panOrigin.x + sample.delta.x;
		state.panY = panOrigin.y + sample.delta.y;
	}
	function movePanWithKeyboard(sample: GestureSample) {
		state.panX += sample.delta.x;
		state.panY += sample.delta.y;
	}
	function beginPinch() {
		zoomOrigin = state.zoom;
		rotationOrigin = state.rotation;
	}
	function movePinch(sample: PinchGestureSample) {
		state.zoom = clamp(zoomOrigin * sample.scale, 0.6, 2.4);
		state.rotation = rotationOrigin + sample.rotation;
	}
	const mediaNavigation = defineGesture({
		name: 'media-navigation',
		semantics: 'decorative',
		pan: {
			threshold: 2,
			onStart: beginPan,
			onMove: movePan
		},
		pinch: {
			threshold: 0.01,
			onStart: beginPinch,
			onMove: movePinch
		},
		keyboard: { step: 16, onMove: movePanWithKeyboard },
		touchAction: 'none'
	});
	const zoomMedia = (amount: number) => {
		this.state.zoom = clamp(this.state.zoom + amount, 0.6, 2.4);
	};
	const rotateMedia = (amount: number) => {
		this.state.rotation += amount;
	};
	const resetMedia = () => {
		this.state.panX = 0;
		this.state.panY = 0;
		this.state.zoom = 1;
		this.state.rotation = 0;
	};

	return () => (
		<section
			theme:surface="raised"
			className="demo-card gesture-demo"
			aria-labelledby="gesture-title"
		>
			<div className="demo-heading">
				<div>
					<p className="eyebrow">Gestures</p>
					<h2 id="gesture-title">Intent shared by pointer, touch, and keyboard</h2>
				</div>
				<span className="package-label">@exactjs/gestures</span>
			</div>

			<div className="gesture-grid">
				<div className="control-sample">
					<span className="sample-label">Press</span>
					<button theme:action="primary" className="applause-button" gesture:apply={pressControl}>
						<span
							key={String(this.state.presses)}
							className={this.state.presses ? 'applause-icon is-active' : 'applause-icon'}
						>
							👏
						</span>
						Applaud <strong>{this.state.presses}</strong>
					</button>
					<small aria-live="polite">
						{this.state.lastPress === 'none'
							? 'Click, tap, Enter, or Space'
							: `Recognized one ${this.state.lastPress} press`}
					</small>
				</div>
				<div className="control-sample">
					<span className="sample-label">Hover + focus</span>
					<div
						className="preview-card"
						data-active={this.state.hovered}
						tabIndex={0}
						gesture:apply={hoverIntent}
					>
						<span className="avatar">JL</span>
						<div>
							<strong>Jordan Lee</strong>
							<small>
								{this.state.hovered
									? `Preview active via ${this.state.previewInput}`
									: 'Focus or point here'}
							</small>
						</div>
						{this.state.hovered ? (
							<div className="preview-actions">
								<button theme:action="secondary">Message</button>
								<button theme:action="primary">View profile</button>
							</div>
						) : null}
					</div>
				</div>
			</div>

			<div className="slider-sample">
				<div className="slider-labels">
					<span>Drag + keyboard slider</span>
					<strong>{this.state.slider}%</strong>
				</div>
				<button
					theme:selection="strong"
					className="semantic-slider"
					role="slider"
					aria-label="Volume"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={this.state.slider}
					gesture:apply={sliderControl}
				>
					<span className="slider-fill" style={{ width: `${this.state.slider}%` }} />
					<span className="slider-thumb" style={{ left: `${this.state.slider}%` }} />
				</button>
			</div>

			<div className="gesture-grid lower-grid">
				<div className="control-sample">
					<span className="sample-label">Long press</span>
					<button
						theme:action="secondary"
						className="hold-button"
						data-confirmed={this.state.held}
						gesture:apply={holdControl}
					>
						<span className="hold-progress" />
						<span className="hold-label">
							{this.state.held ? 'Confirmed ✓' : 'Hold to confirm'}
						</span>
					</button>
					<small>Hold while the bar fills; keyboard activation remains immediate</small>
				</div>
				<div className="control-sample media-sample">
					<div className="sample-title-row">
						<span className="sample-label">Pan + pinch / twist</span>
						<button theme:action="quiet" className="text-button" onClick={resetMedia}>
							Reset
						</button>
					</div>
					<div
						className="media-viewport"
						tabIndex={0}
						gesture:apply={mediaNavigation}
						aria-label="Map preview"
					>
						<div
							className="media-map"
							style={{
								transform: `translate(${this.state.panX}px, ${this.state.panY}px) scale(${this.state.zoom}) rotate(${this.state.rotation}rad)`
							}}
						>
							<span className="map-route" />
							<span className="map-pin">●</span>
						</div>
					</div>
					<div className="media-controls" aria-label="Desktop map controls">
						<button aria-label="Zoom out" onClick={() => zoomMedia(-0.2)}>
							−
						</button>
						<span>{Math.round(this.state.zoom * 100)}%</span>
						<button aria-label="Zoom in" onClick={() => zoomMedia(0.2)}>
							+
						</button>
						<button aria-label="Rotate left" onClick={() => rotateMedia(-Math.PI / 12)}>
							↶
						</button>
						<span>{Math.round((this.state.rotation * 180) / Math.PI)}°</span>
						<button aria-label="Rotate right" onClick={() => rotateMedia(Math.PI / 12)}>
							↷
						</button>
					</div>
					<small>Two-finger pinch/twist on touch; arrows and buttons on desktop.</small>
				</div>
			</div>
		</section>
	);
}
