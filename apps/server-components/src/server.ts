import { createVNode } from '@exactjs/core';
import {
	createExactHydrationManifestConfig,
	createExactServerManifest,
	handleExactRequest,
	type ExactCompilerManifestLike,
	type ExactRequestLike
} from '@exactjs/server';
import {
	createExactServerRuntime,
	renderToHydratableProgressiveHtmlResponse,
	renderToHydratableStringAsync
} from '@exactjs/ssr';
import profileCompilerManifest from '../.exact/ProfilePage.exact.manifest.json' with { type: 'json' };
import { ProfilePage } from '../.exact/ProfilePage.exact.server.js';

const generatedProfileManifest = profileCompilerManifest as ExactCompilerManifestLike &
	typeof profileCompilerManifest;
const profileComponentId = profileCompilerManifest.components.find(
	(component) => component.name === 'ProfilePage'
)!.id;
const profileBoundaryId = profileCompilerManifest.boundaries.find(
	(boundary) => boundary.ownerComponentId === profileComponentId
)!.id;

/** Provides the canonical exact manifest value. */
export const exactManifest = createExactServerManifest(generatedProfileManifest, {
	endpoint: '/__exact',
	actions: {
		'save-profile': {
			id: 'save-profile',
			componentId: profileComponentId,
			placement: 'server'
		}
	}
});

/** Provides the canonical exact runtime value. */
export const exactRuntime = createExactServerRuntime({
	manifest: exactManifest,
	markers: false,
	patchStrategy: 'element',
	actions: {
		'save-profile': () => ({ state: { saved: true } })
	},
	boundaries: {
		[profileBoundaryId]: () => createVNode('section', { className: 'saved' }, 'Saved on the server')
	}
});

/** Renders the profile page sample to hydratable HTML. */
export async function renderProfilePage(name: string) {
	return renderToHydratableStringAsync(createVNode(ProfilePage, { name }), {
		markers: false,
		...createExactHydrationManifestConfig(exactManifest, { profile: { name } })
	});
}

/** Renders the profile page sample as a progressive hydratable response. */
export function renderProfilePageResponse(name: string) {
	return renderToHydratableProgressiveHtmlResponse(createVNode(ProfilePage, { name }), {
		markers: false,
		rootId: 'app',
		...createExactHydrationManifestConfig(exactManifest, { profile: { name } })
	});
}

/** Handles server-component endpoint requests for the profile sample. */
export function handleExactServerRequest(request: ExactRequestLike) {
	return handleExactRequest(request, exactRuntime);
}
