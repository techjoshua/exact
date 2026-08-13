import type { IntlPatternV1, IntlRuntimeDescriptorV1 } from '@exactjs/intl';

/** Selects descriptors that contain language or a linguistically significant branch. */
export function translatorVisibleDescriptors(
	descriptors: readonly IntlRuntimeDescriptorV1[],
	owner: string
): IntlRuntimeDescriptorV1[] {
	return descriptors.filter(
		(descriptor) => descriptor.owner === owner && hasTranslatableContent(descriptor.source)
	);
}

function hasTranslatableContent(pattern: IntlPatternV1): boolean {
	return pattern.some((node) => {
		if (node.kind === 'text') return /\S/u.test(node.value);
		if (node.kind === 'select') return true;
		if (node.kind === 'element') return hasTranslatableContent(node.value);
		return false;
	});
}
