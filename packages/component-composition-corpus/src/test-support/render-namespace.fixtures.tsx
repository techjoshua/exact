import type { Component } from '@exactjs/core';

function Shape(props: { count: number; advance: () => void }) {
	return () => (
		<g>
			<g>
				<g>
					<g>
						<g>
							<g>
								<g>
									<g>
										<g>
											<circle
												data-namespace-target=""
												data-count={props.count}
												onClick={props.advance}
											/>
										</g>
									</g>
								</g>
							</g>
						</g>
					</g>
				</g>
			</g>
		</g>
	);
}

/**
 * Reuses one component under distinct physical namespaces without usage specialization.
 * @exact client
 */
export function NamespaceProbe(
	this: Component<{ count: number; encoding: string; visible: boolean }>
) {
	this.state.count = 0;
	this.state.encoding = 'text/html';
	this.state.visible = false;
	return () => (
		<section data-namespace-probe="">
			<svg>
				<Shape count={this.state.count} advance={() => this.state.count++} />
			</svg>
			<div>
				<Shape count={this.state.count} advance={() => this.state.count++} />
			</div>
			<math>
				<mtext>
					<button
						data-namespace-target=""
						data-count={this.state.count}
						onClick={() => this.state.count++}
					>
						MathML integration
					</button>
				</mtext>
				<annotation-xml encoding={this.state.encoding}>
					{this.state.visible ? <span data-namespace-range="">range</span> : null}

					<button
						data-namespace-target=""
						data-count={this.state.count}
						onClick={() => this.state.count++}
					>
						Reactive encoding
					</button>
				</annotation-xml>
			</math>
			<button
				onClick={() => {
					this.state.visible = true;
					this.state.encoding = 'application/xml';
				}}
			>
				Show MathML child
			</button>
			<button
				onClick={() => {
					this.state.encoding = 'text/html';
					this.state.visible = true;
				}}
			>
				Show HTML child
			</button>
			<button
				onClick={() => {
					this.state.visible = false;
				}}
			>
				Hide namespace child
			</button>
		</section>
	);
}

function NamespaceHost() {
	return () => (
		<section>
			<input data-retained-input="" value="initial" />
			<NamespaceProbe />
			<footer>retained</footer>
		</section>
	);
}
/** Supplies a paired hydrated parent around a client-only namespace child. */
export function namespaceProbeRoot() {
	return <NamespaceHost />;
}
