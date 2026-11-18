# Part packages: signed index, packages and the client

Contract for the downloadable-parts transport described in the [downloadable
parts plan](../plans/downloadable-parts.md). It covers how the app fetches,
verifies, caches and searches the official index and part packages. The
manifest schema (what is inside a package) is specified separately; this layer
treats a manifest as opaque JSON handed to an injected validator.

Code: `src/build/parts/remote/`. Signing tool: `scripts/parts/sign.mjs`.

## Signed envelope

The index and every package are the same envelope:

```json
{
  "format": "dsf-signed/1",
  "payload": "<JSON text>",
  "signatures": [{ "keyId": "<id>", "sig": "<base64url Ed25519 signature>" }]
}
```

The signature covers the exact UTF-8 bytes of the `payload` string, so there
is no JSON canonicalisation to get wrong. The envelope is valid when at least
one signature verifies against a trusted key (several signatures allow signing
with an old and a new key during rotation). Verification is WebCrypto Ed25519;
a runtime without it fails closed with `cannot-verify` and loads nothing that
was downloaded.

## Trusted keys and rotation

- `trustedKeys.ts` lists `{ keyId, publicKey }` (raw 32 bytes, base64url). It
  ships **empty** until a production key exists, and `PARTS_BASE_URL` ships
  empty too, so a production build fetches nothing.
- The index payload may announce `keys: { add: [{ keyId, publicKey }], retire:
  [keyId] }`. The client honours it only after the index envelope verified
  against an already-trusted key. Additions apply first; retirements apply in
  order, and a retirement that would leave no trusted key is skipped.
- The learned key set (`added`, `retired`) is persisted in the cache and
  applied on every later start, offline included.
- The cached index is re-verified on every read. A rotation index that
  retires the key that signed it should be signed by both the old and the new
  key, or a client reading it back from the cache after the retirement would
  find it unverifiable until the next refresh.

## Index payload

```json
{
  "indexVersion": 1,
  "generatedAt": "2026-11-01T00:00:00Z",
  "keys": { "add": [], "retire": [] },
  "categories": [
    { "id": "ultra", "label": "Ultrasonic", "order": 1, "parent": "distance", "aliases": ["old-id"] }
  ],
  "parts": [
    {
      "partId": "hc-sr04", "revision": 1, "partTypes": ["DistanceInput"],
      "label": "HC-SR04", "manufacturer": "Generic",
      "interfaces": ["pulse-ranging"], "chips": ["HC-SR04"], "categories": ["ultra"],
      "verification": "reviewed",
      "package": { "url": "packages/hc-sr04@1.json", "sha256": "<hex>", "bytes": 1234 },
      "render": { "url": "renders/hc-sr04@1.webp", "sha256": "<hex>", "bytes": 5678, "widthPx": 640, "heightPx": 480 }
    }
  ]
}
```

- Unknown optional fields are ignored. An `indexVersion` above what the build
  supports (`SUPPORTED_INDEX_VERSION`) yields a typed `needs-newer-app` result
  (with a cached index, the cache is served and `refreshError` says why).
- Required per part: `partId` (`[A-Za-z0-9][A-Za-z0-9._-]{0,63}`), integer
  `revision` >= 1, `partTypes` (one to eight), `label`, `interfaces`, `categories`,
  `verification`, `package`. A malformed part is dropped and counted in
  `droppedParts`; a duplicate `partId` keeps the first. A malformed `render`
  only removes that part's picture.
- Limits: package at most 1 MB, render at most 2 MB and 2048 px a side.
- Only `reviewed` and `bench` parts are offered; `drafted` parts are never
  offered and `getPackage` refuses them.
- A replayed older index (`generatedAt` earlier than the cached one) is
  ignored in favour of the cache (`refreshError: 'stale'`).
- URLs resolve against the base URL; absolute URLs must be `https:` (or
  `http:` to localhost).

## Packages and renders

- A package is an envelope whose payload is the manifest JSON. The client
  checks the byte length and sha256 from the index **before** verifying the
  signature, then validates the manifest with the injected function.
- Packages are cached under their sha256 and **re-verified on every read**
  (hash, signature against the current key set, validator); a failing entry is
  deleted and refetched.
- A render is not signed (the signed index pins its sha256). It must be WebP
  (magic bytes), within bounds, with the width and height read from the file
  matching the index.
- Fetches use a timeout and abort (15 s), omit credentials, and never run at
  import time or with no base URL.

## Client API

`createPartsClient({ validateManifest, baseUrl?, trustedKeys?, cache?, fetch?, timeoutMs? })`
returns `loadIndex()`, `offered(index)`, `getPackage(part)`, `getRender(part)`
and `trustedKeys()`. Results are typed unions (`ok: true | false` with a
`reason`); nothing throws. The default cache is IndexedDB; every cache
operation swallows its own failure and degrades to no cache. Pure helpers:
`searchParts(parts, query, tree?)` (tokenised, case-insensitive across label,
manufacturer, part types, interfaces, chips and category labels with
ancestors) and `buildCategoryTree(categories, parts?)` (alias resolution,
ordering, cycle and unknown-parent repair, direct and descendant part counts).

## Alignment with the manifest schema

`sign.mjs index` copies these top-level manifest fields
(`src/build/parts/manifest/partManifest.ts`) into the index: `partId`,
`revision`, `partTypes`, `label`, `verification`, `interfaces`, `categories`
and optionally `manufacturer`. `chips` are the `device` and `controller` names
the manifest's part-type blocks carry. The app passes each package to
`validatePartManifest(payload, 'downloaded')`. If the schema moves a field,
change the script, not the index contract.

## Signing tool

```text
node scripts/parts/sign.mjs keygen <private-key-path>
node scripts/parts/sign.mjs sign <payload-file> --key <pem> --key-id <id> [--out <file>]
node scripts/parts/sign.mjs index <manifests-dir> --out-dir <dir> --key <pem> --key-id <id> [--base-url <prefix>]
```

`keygen` prints the public key and writes the PKCS8 PEM private key, refusing
any path inside the repository except the gitignored `tmp/`, and refusing to
overwrite. Never commit a private key. `index` signs each manifest into
`packages/<partId>@<revision>.json`, copies a sibling `<name>.webp` to
`renders/`, and writes the signed `index.json` (categories from
`categories.json` beside the manifests). `--key`/`--key-id` repeat for
multi-key signing; `--announce-add <keyId>=<publicKey>` and
`--announce-retire <keyId>` write the rotation announcement.
