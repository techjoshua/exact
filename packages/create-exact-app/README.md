# @exactjs/create-exact-app

Interactive project scaffolder for eXact applications.

## Create an application

```sh
npm create @exactjs/exact-app@latest
```

The CLI can configure Vite, Webpack, or Bun; browser-only or server runtime adapters; Vitest, Jest,
or Bun tests; optional React compatibility; dependency installation; and the portable eXact agent
skill.

## Automated use

```sh
npm create @exactjs/exact-app@latest my-app -- \
	--bundler vite \
	--runtime hapi \
	--test-runner vitest \
	--react 19 \
	--skill
```

Run with `--help` for all flags. The target directory must be empty apart from an optional
`.git` directory.
