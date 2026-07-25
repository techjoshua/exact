import { defineExactHydrationRegistration as __exactDefineRegistration, lazyClientIsland as __exactLazyIsland } from "@exactjs/hydrate";

export const exactClientIslands = {
  "CalculatorWorkspace": __exactLazyIsland(() => import("./components/workspace.exact.client.js").then((module) => module["CalculatorWorkspace"]))
};
const __exactContinuations = __exactDefineRegistration({
  continuations: {
  "xkjfiXay5PtKM6N0lOjvJw_": {
    "id": "xkjfiXay5PtKM6N0lOjvJw_",
    "componentId": "xWlcOlFiMzqEjqVOs2HlMar",
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
    "boundaries": [
      "xG1VdS7AhctN3YpqNne2u51"
    ]
  }
}
}).continuations;

export const exactHydrationRegistration = {
  islands: exactClientIslands,
  continuations: __exactContinuations
};
