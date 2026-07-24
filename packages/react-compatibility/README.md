# @exactjs/react-compatibility

Private conformance inventory used to measure eXact's React compatibility surface.

It records capability expectations and package/API coverage independently from the production
runtime. Tests and reports use the inventory to distinguish implemented, intentionally unsupported,
and pending behavior across React versions.

Application code should depend on `@exactjs/react-compat` or an adapter package instead.
