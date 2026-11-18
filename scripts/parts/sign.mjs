// Parts signing tool. No dependencies; Node's crypto does Ed25519.
//
//   node scripts/parts/sign.mjs keygen <private-key-path>
//       Generate a keypair. Prints the public key (raw 32 bytes, base64url) and
//       writes the private key (PKCS8 PEM) to <private-key-path>. Refuses a
//       path inside the repository except under the gitignored tmp/, and
//       refuses to overwrite a file.
//
//   node scripts/parts/sign.mjs sign <payload-file> --key <private-key> --key-id <id> [--out <file>]
//       Wrap the payload file's exact bytes in a dsf-signed/1 envelope.
//       --key/--key-id may repeat (in pairs, in order) to sign with several keys.
//
//   node scripts/parts/sign.mjs index <manifests-dir> --out-dir <dir> --key <private-key> --key-id <id>
//       [--categories <categories.json>] [--base-url <prefix>]
//       [--announce-add <keyId>=<publicKey>]... [--announce-retire <keyId>]...
//       Build and sign the index from a directory of manifests. Each *.json file
//       is a part manifest; the index fields are read from its top level
//       (partId, revision, partTypes, label, interfaces, categories,
//       verification, and optionally manufacturer); `chips` are the
//       `device` and `controller` names its part-type blocks carry. A sibling
//       <name>.webp is the part's render. Writes <out-dir>/index.json,
//       <out-dir>/packages/<partId>@<revision>.json (each manifest signed) and
//       <out-dir>/renders/<partId>@<revision>.webp. Categories come from
//       <manifests-dir>/categories.json unless --categories is given; that file
//       is not itself a manifest.
//
// Contract: docs/design/part-packages.md. Never commit a private key.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
} from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FORMAT = 'dsf-signed/1'

function die(message) {
  console.error(`sign.mjs: ${message}`)
  process.exit(1)
}

function inside(parent, child) {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function parseArgs(argv) {
  const positional = []
  const flags = new Map()
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) die(`${a} needs a value`)
      if (!flags.has(a)) flags.set(a, [])
      flags.get(a).push(value)
      i += 1
    } else positional.push(a)
  }
  return { positional, flags }
}

const b64u = (buf) => Buffer.from(buf).toString('base64url')

function publicKeyRaw(privateKey) {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' })
  return jwk.x
}

function loadSigners(flags) {
  const keys = flags.get('--key') ?? []
  const ids = flags.get('--key-id') ?? []
  if (keys.length === 0 || keys.length !== ids.length) die('give each --key a matching --key-id')
  return keys.map((path, i) => ({
    keyId: ids[i],
    privateKey: createPrivateKey(readFileSync(path, 'utf8')),
  }))
}

function envelopeFor(payload, signers) {
  const bytes = Buffer.from(payload, 'utf8')
  return {
    format: FORMAT,
    payload,
    signatures: signers.map((s) => ({
      keyId: s.keyId,
      sig: b64u(edSign(null, bytes, s.privateKey)),
    })),
  }
}

/** The chip names a manifest's blocks carry (`device`, `controller`), for search. */
function chipsOf(manifest) {
  const chips = new Set()
  for (const value of Object.values(manifest)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    for (const key of ['device', 'controller']) {
      if (typeof value[key] === 'string' && value[key].length <= 64) chips.add(value[key])
    }
  }
  return [...chips]
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

function webpSize(b) {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') {
    return null
  }
  const kind = b.toString('ascii', 12, 16)
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) }
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21)
    return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >>> 14) & 0x3fff) }
  }
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
  return null
}

function keygen(path) {
  if (!path) die('keygen needs a private key path')
  const target = resolve(path)
  if (inside(REPO_ROOT, target) && !inside(join(REPO_ROOT, 'tmp'), target)) {
    die('refusing to write a private key inside the repository (only the gitignored tmp/ is allowed)')
  }
  if (existsSync(target)) die(`${target} already exists; not overwriting`)
  mkdirSync(dirname(target), { recursive: true })
  const { privateKey } = generateKeyPairSync('ed25519')
  writeFileSync(target, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 })
  console.log(`publicKey: ${publicKeyRaw(privateKey)}`)
  console.log(`privateKey written to ${target}`)
}

function signFile(payloadFile, flags) {
  if (!payloadFile) die('sign needs a payload file')
  const payload = readFileSync(payloadFile, 'utf8')
  const out = JSON.stringify(envelopeFor(payload, loadSigners(flags)))
  const outPath = flags.get('--out')?.[0]
  if (outPath) writeFileSync(outPath, out)
  else process.stdout.write(out)
}

function buildIndex(dir, flags) {
  if (!dir) die('index needs a manifests directory')
  const outDir = flags.get('--out-dir')?.[0]
  if (!outDir) die('index needs --out-dir')
  const signers = loadSigners(flags)
  const prefix = flags.get('--base-url')?.[0] ?? ''
  const categoriesPath = flags.get('--categories')?.[0] ?? join(dir, 'categories.json')
  const categories = existsSync(categoriesPath) ? JSON.parse(readFileSync(categoriesPath, 'utf8')) : []

  mkdirSync(join(outDir, 'packages'), { recursive: true })
  mkdirSync(join(outDir, 'renders'), { recursive: true })

  const parts = []
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'categories.json')
    .sort()
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8')
    const manifest = JSON.parse(text)
    for (const field of ['partId', 'revision', 'partTypes', 'label', 'verification']) {
      if (manifest[field] === undefined) die(`${file}: manifest has no "${field}"`)
    }
    const name = `${manifest.partId}@${manifest.revision}`
    const packageBytes = Buffer.from(JSON.stringify(envelopeFor(text, signers)), 'utf8')
    writeFileSync(join(outDir, 'packages', `${name}.json`), packageBytes)
    const entry = {
      partId: manifest.partId,
      revision: manifest.revision,
      partTypes: manifest.partTypes,
      label: manifest.label,
      interfaces: manifest.interfaces ?? [],
      chips: chipsOf(manifest),
      categories: manifest.categories ?? [],
      verification: manifest.verification,
      package: { url: `${prefix}packages/${name}.json`, sha256: sha256(packageBytes), bytes: packageBytes.length },
    }
    if (manifest.manufacturer !== undefined) entry.manufacturer = manifest.manufacturer
    const renderFile = join(dir, file.replace(/\.json$/, '.webp'))
    if (existsSync(renderFile)) {
      const bytes = readFileSync(renderFile)
      const size = webpSize(bytes)
      if (!size) die(`${renderFile}: not a WebP`)
      writeFileSync(join(outDir, 'renders', `${name}.webp`), bytes)
      entry.render = {
        url: `${prefix}renders/${name}.webp`,
        sha256: sha256(bytes),
        bytes: bytes.length,
        widthPx: size.w,
        heightPx: size.h,
      }
    }
    parts.push(entry)
  }

  const payload = { indexVersion: 1, generatedAt: new Date().toISOString(), categories, parts }
  const add = (flags.get('--announce-add') ?? []).map((v) => {
    const [keyId, publicKey] = v.split('=')
    if (!keyId || !publicKey) die('--announce-add wants <keyId>=<publicKey>')
    return { keyId, publicKey }
  })
  const retire = flags.get('--announce-retire') ?? []
  if (add.length > 0 || retire.length > 0) payload.keys = { add, retire }

  writeFileSync(
    join(outDir, 'index.json'),
    JSON.stringify(envelopeFor(JSON.stringify(payload), signers)),
  )
  console.log(`index.json: ${parts.length} part(s) signed by ${signers.map((s) => s.keyId).join(', ')}`)
}

const [command, ...rest] = process.argv.slice(2)
const { positional, flags } = parseArgs(rest)
if (command === 'keygen') keygen(positional[0])
else if (command === 'sign') signFile(positional[0], flags)
else if (command === 'index') buildIndex(positional[0], flags)
else die('usage: sign.mjs keygen|sign|index (see the header of this file)')
