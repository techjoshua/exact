# @exactjs/express-adapter

Express middleware for eXact server endpoints.

## Usage

```ts
import express from 'express';
import { createExactExpressMiddleware } from '@exactjs/express-adapter';

const app = express();
app.use(express.json());
app.post('/__exact', createExactExpressMiddleware(exactRuntime));
```

Mount the middleware at the endpoint configured by the eXact runtime. Parse JSON before the
middleware runs; protocol validation and dispatch remain centralized in `@exactjs/server`.
