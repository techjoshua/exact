# Using `@exactjs/dom`

See the [README](./README.md) for mounting APIs. Use this package to mount compiled eXact components
into browser DOM roots.

- Pass compiler-produced native components to eXact roots.
- Let event handlers establish the component interaction and task lifetime.
- Use stable list keys and component-registry keys when identity must survive updates.
- Use the `/enhanced` entry only for manually constructed enhancement markers and catalogs;
  compiler-resolved enhancements activate their renderer support automatically.
