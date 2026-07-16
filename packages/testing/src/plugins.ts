import {
  prepareExactPluginRegistry,
  type ExactPreparedPluginRegistry,
  type PrepareExactPluginRegistryOptions
} from "@exact/plugin-host";

/** Prepares plugin testing projections and lifecycle extensions. */
export function prepareExactTestingPlugins(
  options: Omit<PrepareExactPluginRegistryOptions, "hostMode"> = {}
): Promise<ExactPreparedPluginRegistry> {
  return prepareExactPluginRegistry({ ...options, hostMode: "testing" });
}
