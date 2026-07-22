# Trusted microfrontend portal

This sample demonstrates three independently built eXact component roots inside one page:

- the **page root** owns the portal context, navigation, account badge, and public `/__exact` endpoint;
- the **branding root** supplies either a full or compact shell and embeds page-owned children;
- the nested **billing root** supplies account content inside the branding shell.

The browser loads branding and billing artifacts separately, but every server operation goes to the page application's `/__exact` endpoint. The page gateway selects the private component host from the immutable client root, adds internal authorization, and forwards the request. The remote hosts reject direct unauthenticated requests.

## Run it

From the repository root:

```sh
npm run dev:microfrontends
```

Open `http://localhost:4300`. The development topology is:

| Port | Role                                           | Browser-facing |
| ---- | ---------------------------------------------- | -------------- |
| 4300 | Page application and public `/__exact` gateway | Yes            |
| 4301 | Billing development artifacts                  | Yes            |
| 4302 | Branding development artifacts                 | Yes            |
| 4401 | Billing `/__exact` host                        | No             |
| 4402 | Branding `/__exact` host                       | No             |

Build and run the production-shaped sample with:

```sh
npm run build:microfrontends
npm run start:microfrontends
```

The build emits the page under `dist/public`, independently compiled remote entries under `dist/public/remotes`, and the gateway/private-host process under `dist/server`.

## What to exercise

- **Shared reactive context:** switch the tenant/account or theme in the page controls. Branding, billing, and late-mounted islands update from the same page-owned `PortalContext` token.
- **Embedded page islands:** click the account badge, then change context. Its local count survives even though it is rendered as a child of the remote branding shell.
- **Remote local reactivity:** click the branding and billing island controls; each retains state in its own component root.
- **Nested and late roots:** toggle the late billing island to prove context inheritance at instantiation time.
- **Server ownership:** the protocol test sends page, branding, and batched billing actions through the public endpoint and verifies that each operation executes only on its owning server.
- **Server components:** the protocol test refreshes page, branding, and billing summaries through the same gateway and verifies execution on all three hosts.
- **Multiple exposures:** switch between the full and compact exports from the branding build. Both use the same action ID while their root identity routes work correctly.
- **Failure fallback:** toggle the remote failure to exercise the `RemoteComponent` fallback without taking down the page.

The automated tests in `sample.test.ts` separate browser composition from protocol execution. Component source never receives an `ExactClient`, crafts protocol messages, or names action IDs. The protocol-focused test proves that a batch can contain root-qualified operations and that private component hosts deny direct requests. Component-authored server tasks will replace that test-only protocol harness when the compiler-generated executable task contract is connected to the runtime. `build.test.ts` verifies the independent browser artifacts and checks that their private endpoint URLs do not leak into the page bundle.

## Shared package contract

All three builds declare `@exact/sample-microfrontend-portal/shared` as provided. The page emits the shared module, while remote builds leave it external and resolve the page-provided instance at runtime. This makes the reactive context token identical across roots without bundling another copy of eXact core.

The sample uses the current Git SHA as its build key. Remote client requests carry that key through the page gateway so the owning host can select the matching build registration.
