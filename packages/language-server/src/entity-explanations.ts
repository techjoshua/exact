import type { ExactSourceEntity } from '@exactjs/compiler';

/** Formats normalized compiler classification facts for hover and inlay presentation. */
export function entityFacts(entity: ExactSourceEntity): string[] {
	const classification = entity.classification;
	if (!classification) return [];
	if (classification.kind === 'initializer')
		return [`Runs **${classification.execution}** with **${classification.placement}** placement.`];
	if (classification.kind === 'render')
		return [
			...(classification.referencedComponent
				? [
						`\`${entity.name ?? 'Component'}\` is a **${classification.referencedComponent.placement} component** rendered at this element.`,
						`Boundary classification: **${classification.referencedComponent.boundary}**.`
					]
				: []),
			'Runs as fine-grained **reactive** render work.',
			...classification.dependencies.map(
				(dependency) =>
					`Dependency: \`${dependency.path}\`${dependency.confidence === 'exact' ? '' : ` (${dependency.confidence})`}`
			)
		];
	if (classification.kind === 'task')
		return [
			`${capitalize(classification.origin)} **${classification.readiness} ${classification.placement}** task.`,
			`Priority: **${classification.priority}**. Concurrency: **${classification.concurrency}**. Publication: **${classification.publication}**.`,
			`Attachment: **${classification.detached ? 'detached' : 'structured'}**.`,
			`Cancellation: **${classification.cancellation}**.`,
			...classification.dependencies.map(
				(dependency) =>
					`Dependency: \`${dependency.path}\`${dependency.confidence === 'exact' ? '' : ` (${dependency.confidence})`}`
			),
			...classification.capturedInputs.map(
				(input) =>
					`Captured input: parameter ${input.parameter + 1} snapshots \`${input.path}\` without subscribing.`
			),
			...classification.effects.map(
				(effect) =>
					`Effect: \`${effect.path ?? effect.kind}\`${effect.confidence === 'exact' ? '' : ` (${effect.confidence})`}`
			)
		];
	if (classification.kind === 'state-assignment')
		return [
			classification.execution === 'once-per-instance'
				? `Initializes \`${classification.effect.path}\` **once per component instance**.`
				: `Reevaluates \`${classification.effect.path}\` as a **deferred reactive assignment**.`,
			...classification.dependencies.map(
				(dependency) =>
					`Dependency: \`${dependency.path}\`${dependency.confidence === 'exact' ? '' : ` (${dependency.confidence})`}`
			)
		];
	return [];
}

/** Formats typed compiler inference reasons without discarding related causal evidence. */
export function reasonFacts(entity: ExactSourceEntity): string[] {
	return entity.reasons.flatMap((reason) => [
		`**Why:** ${reason.summary}`,
		...(reason.related ?? []).map((related) => `- ${related.summary}`)
	]);
}

/** Capitalizes one normalized compiler enum value for sentence presentation. */
export function capitalize(value: string): string {
	return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
