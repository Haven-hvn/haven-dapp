/**
 * Vendored launch math from `@royalty-router/sdk`
 * (`mint-glue-graduate/sdk/src`): `launch` + `defaults` + their local
 * imports (`curve`, `math`, `abi`, `addresses`).
 *
 * Why vendored instead of a dependency: the SDK lives in a sibling checkout
 * outside this repo, so a `file:` dependency dangles on any fresh clone
 * (CI included) and its `dist` build output is never committed. Copying the
 * pure-TS sources keeps `npm ci` → `type-check` → `next build` hermetic.
 *
 * When re-vendoring, copy the same file set and keep the upstream
 * `../model`-pinned constants (royalty window, pool fee, steps) untouched.
 * Deliberately excluded: `router`, `read`, `venue`, `cli` (keeper and
 * quoting paths the dapp does not use yet).
 *
 * @module lib/graduate-sdk
 */
