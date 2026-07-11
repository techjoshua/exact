import { createVNode } from "@exact/core";
import {
  createExactHydrationManifestConfig,
  createExactServerManifest,
  handleExactRequest,
  type ExactCompilerManifestLike,
  type ExactRequestLike
} from "@exact/server";
import {
  createExactServerHandlerRegistry,
  renderToHydratableStringAsync
} from "@exact/ssr";
import { ProfilePage } from "./ProfilePage.js";

const compilerManifest = {
  version: 1,
  serverActions: {
    "save-profile": {
      id: "save-profile",
      componentId: "ProfilePage",
      taskId: "save-profile",
      placement: "server"
    }
  },
  components: [
    { id: "ProfilePage", placement: "server" }
  ],
  boundaries: [
    {
      id: "profile",
      name: "ProfilePage",
      componentId: "ProfilePage",
      ownerComponentId: "ProfilePage",
      kind: "client-island"
    }
  ]
} satisfies ExactCompilerManifestLike;

export const exactManifest = createExactServerManifest(compilerManifest, {
  endpoint: "/__exact"
});

export const exactHandlers = createExactServerHandlerRegistry({
  manifest: exactManifest,
  markers: false,
  patchStrategy: "element",
  actions: {
    "save-profile": () => ({ state: { saved: true } })
  },
  boundaries: {
    profile: () => createVNode("section", { className: "saved" }, "Saved on the server")
  }
});

export async function renderProfilePage(name: string) {
  return renderToHydratableStringAsync(createVNode(ProfilePage, { name }), {
    ...createExactHydrationManifestConfig(exactManifest, { profile: { name } })
  });
}

export function handleExactServerRequest(request: ExactRequestLike) {
  return handleExactRequest(request, {
    manifest: exactManifest,
    ...exactHandlers
  });
}
