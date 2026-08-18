# @exactjs/time guidance

Use this package for view output that must progress with a wall or application clock. Put
`time:update` on the semantic intrinsic that owns the complete clock-derived output and keep the
math in ordinary TypeScript. Prefer `auto`; use an explicit accuracy only when inference cannot
prove the next visible change, and use reactive `disabled` to suspend presentation updates. See
the package README and framework date/time reference.
