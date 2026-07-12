# @exact/fetch-adapter

Fetch-compatible adapter for the eXact server runtime. Use this anywhere the platform receives a standard `Request` and returns a standard `Response`.

```ts
import { createExactFetchHandler } from "@exact/fetch-adapter";
import { createExactServerRuntime } from "@exact/ssr";

const exact = createExactFetchHandler(createExactServerRuntime({
  manifest,
  actions,
  boundaries
}));

export default {
  fetch(request: Request) {
    return exact(request);
  }
};
```

Configure the endpoint path in the eXact manifest/runtime. The core `@exact/server` handler still performs manifest allowlisting, payload validation, authorization, CSRF validation, and patch dispatch.
