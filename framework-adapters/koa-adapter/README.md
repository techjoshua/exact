# @exact/koa-adapter

Koa middleware for eXact server endpoints.

```ts
import Koa from "koa";
import { createExactKoaMiddleware } from "@exact/koa-adapter";

const app = new Koa();
app.use(createExactKoaMiddleware(exactRuntime));
```

Mount this middleware at or before your configured eXact endpoint. If the eXact core returns `404`, the middleware calls `next()` when one is supplied, so it can coexist with other Koa routes.
