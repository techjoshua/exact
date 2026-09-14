# Licensing and attribution

eXact-owned code and documentation are licensed under Apache License 2.0.
The copyright holder is Joshua Friesen. The root `LICENSE` contains the license
terms and `NOTICE` identifies eXact ownership and the third-party boundaries.

Public npm packages and private editor-extension distribution packages carry
matching `LICENSE` and `NOTICE` files. Their manifests declare `Apache-2.0`,
the author, and repository location. `check:publish` validates these source
notices and checks that the public npm tarballs actually contain them.
When changing the root notices, update their distribution copies in the same change.

The native compiler is a derivative distribution containing Microsoft's Apache-2.0
TypeScript compiler and other upstream dependencies. Staging copies the pinned
upstream `LICENSE.txt` as `LICENSE.typescript-go` (the retained distribution filename)
and `NOTICE.txt` as `NOTICE.typescript`, alongside eXact's `LICENSE` and `NOTICE`.
The source templates remain private; generated native packages retain these notices.
The Unicode CLDR data in `@exactjs/intl` keeps its existing `LICENSE.cldr` notice.
Third-party copyright statements must not be replaced with eXact's ownership notice.

Apache-2.0 permits commercial use and redistribution subject to its terms. It does
not require users' separate applications to use Apache-2.0, and it does not grant
general trademark rights. Consult the distributed license for the complete terms.

Future contributions retain their authors' ownership unless explicitly assigned.
Any separate commercial relicensing or contribution agreement needs its own review;
the project license is not a copyright assignment.
