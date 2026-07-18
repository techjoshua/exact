import type { ExactPluginConfigController } from "@exact/plugin-api";
import type { SecretsPluginConfig } from "./config.js";
import { environmentSecrets } from "./providers.js";
import { createSecretResolver } from "./server.js";

const controller: ExactPluginConfigController<SecretsPluginConfig> = {
  defaults() {
    return {
      providers: [environmentSecrets()],
      required: [],
      grants: []
    };
  },
  structuralValidate: validateShape,
  validate(config) {
    validateShape(config);
    if (!config.providers.length) throw new Error("@exact/secrets requires at least one secret provider");
    const duplicate = config.required.find((value, index) => config.required.indexOf(value) !== index);
    if (duplicate) throw new Error(`@exact/secrets required secret ${duplicate} is listed more than once`);
    return undefined;
  },
  compilerConfig(config) {
    return {
      cacheKey: {
        policyVersion: 2,
        grants: config.grants.map(grant => ({
          package: grant.package,
          secrets: [...grant.secrets],
          ...(grant.version ? { version: grant.version } : {}),
          ...(grant.integrity ? { integrity: grant.integrity } : {})
        }))
      }
    };
  },
  serverConfig(config, context) {
    return createSecretResolver(config, {
      applicationRoot: context.applicationRoot,
      environment: context.environment,
      signal: context.signal
    });
  },
  renderConfig() {
    return Object.freeze({});
  }
};

export default controller;

function validateShape(value: SecretsPluginConfig): undefined {
  if (!value || typeof value !== "object" || !Array.isArray(value.providers) || !Array.isArray(value.required)
    || !value.required.every(name => typeof name === "string" && name.length)
    || !Array.isArray(value.grants)
    || !value.grants.every(grant => grant && typeof grant === "object"
      && typeof grant.package === "string" && grant.package.length
      && Array.isArray(grant.secrets) && grant.secrets.length > 0
      && grant.secrets.every(name => typeof name === "string" && name.length)
      && (grant.version === undefined || typeof grant.version === "string" && grant.version.length > 0)
      && (grant.integrity === undefined || typeof grant.integrity === "string" && grant.integrity.length > 0))) {
    throw new Error("Invalid @exact/secrets configuration");
  }
  return undefined;
}
