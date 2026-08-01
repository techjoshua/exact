# @exactjs/koa-adapter

Koa middleware for eXact server endpoints.

## Usage

```ts
import Koa from 'koa';
import { createExactKoaMiddleware } from '@exactjs/koa-adapter';

const app = new Koa();
app.use(createExactKoaMiddleware(exactRuntime));
```

Mount the middleware at or before the configured eXact endpoint. When the shared runtime returns
404, the middleware calls `next()` so it can coexist with other Koa routes.
