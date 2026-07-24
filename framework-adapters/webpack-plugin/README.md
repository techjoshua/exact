# @exactjs/webpack-plugin

Webpack 5 compiler integration for eXact TSX and generated `.exact` artifacts.

```js
import { ExactWebpackPlugin } from '@exactjs/webpack-plugin';

export default {
	resolve: { extensions: ['.tsx', '.ts', '.js'] },
	plugins: [new ExactWebpackPlugin()]
};
```

The plugin adds its loader rule, client or server export conditions, semantic diagnostics,
source-map support, React compatibility aliases, and compiler-session lifecycle handling. Use
`target: "server"` and `serverComponents: true` for server builds. The `./loader` export is
available for advanced rule composition.
