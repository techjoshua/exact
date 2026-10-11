function MathText(props: { label: string }) {
	return () => (
		<mtext>
			<button>
				<span>
					<span>
						<span>
							<span>
								<span>
									<span>
										<span>
											<span title={props.label}>{props.label}</span>
										</span>
									</span>
								</span>
							</span>
						</span>
					</span>
				</span>
			</button>
		</mtext>
	);
}

function SvgHtml(props: { label: string }) {
	return () => (
		<foreignObject>
			<div>
				<span>
					<span>
						<span>
							<span>
								<span>
									<span>
										<span>
											<span title={props.label}>{props.label}</span>
										</span>
									</span>
								</span>
							</span>
						</span>
					</span>
				</span>
			</div>
		</foreignObject>
	);
}

function ClaimContext(props: { label: string }) {
	return () => (
		<section>
			<math>
				<MathText label={props.label} />
			</math>
			<svg>
				<SvgHtml label={props.label} />
			</svg>
		</section>
	);
}

/** Forces cursor claims for standalone components whose attachment selects an integration namespace. */
export const claimContextRoot = (label: string) => <ClaimContext label={label} />;
