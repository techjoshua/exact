import { defineExactHydrationRegistration as __exactDefineRegistration, lazyClientIsland as __exactLazyIsland } from "@exactjs/hydrate";

export const exactClientIslands = {
};
const __exactContinuations = __exactDefineRegistration({
  continuations: {
  "xmFAHgY4KYYb4VHBML0gfF_": {
    "id": "xmFAHgY4KYYb4VHBML0gfF_",
    "componentId": "x65dIFIm5k9jva0j1QyFz0l",
    "readiness": "nonblocking",
    "dependencies": [
      {
        "source": "state"
      },
      {
        "source": "state"
      }
    ],
    "stateReads": [
      {
        "path": "model.configuredProviders",
        "kind": "read",
        "confidence": "exact"
      },
      {
        "path": "model",
        "kind": "read",
        "confidence": "exact"
      }
    ],
    "stateWrites": [
      {
        "path": "model",
        "kind": "write",
        "confidence": "exact"
      }
    ],
    "publicContexts": [],
    "serverContexts": [],
    "contextWrites": [],
    "serverContextWrites": [],
    "boundaries": []
  }
}
}).continuations;

export const exactHydrationRegistration = {
  islands: exactClientIslands,
  continuations: __exactContinuations
};
