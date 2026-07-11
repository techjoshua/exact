import { createVNode } from "@exact/core";
import {
  createExactHydrationManifestConfig,
  createExactServerManifest,
  handleExactRequest,
  type ExactCompilerManifestLike,
  type ExactRequestLike
} from "@exact/server";
import {
  createExactServerRuntime,
  renderToHydratableStringAsync
} from "@exact/ssr";
import profileCompilerManifest from "../.exact/ProfilePage.exact.manifest.json" with { type: "json" };
import { ProfilePage } from "../.exact/ProfilePage.exact.server.js";

const generatedProfileManifest = profileCompilerManifest as ExactCompilerManifestLike & typeof profileCompilerManifest;
const profileComponentId = profileCompilerManifest.components.find(component => component.name === "ProfilePage")!.id;
const profileBoundaryId = profileCompilerManifest.boundaries.find(boundary => boundary.ownerComponentId === profileComponentId)!.id;

export const exactManifest = createExactServerManifest(generatedProfileManifest, {
  endpoint: "/__exact",
  actions: {
    "save-profile": {
      id: "save-profile",
      componentId: profileComponentId,
      placement: "server"
    }
  }
});

export const exactRuntime = createExactServerRuntime({
  manifest: exactManifest,
  markers: false,
  patchStrategy: "element",
  actions: {
    "save-profile": () => ({ state: { saved: true } })
  },
  boundaries: {
    [profileBoundaryId]: () => createVNode("section", { className: "saved" }, "Saved on the server")
  }
});

export async function renderProfilePage(name: string) {
  return renderToHydratableStringAsync(createVNode(ProfilePage, { name }), {
    ...createExactHydrationManifestConfig(exactManifest, { profile: { name } })
  });
}

export function handleExactServerRequest(request: ExactRequestLike) {
  return handleExactRequest(request, exactRuntime);
}
