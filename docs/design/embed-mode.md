# Embed mode: a live demo in an iframe

Status: pilot. Checked in a cross-origin iframe, both on a development machine
and from the container image running on Render's free plan (2026-11-24).

Embed mode runs the Studio's web app as a live demo inside another site's
page. A visitor gets the real editor and the real preview, opened on one
starter, with nothing installed.

## Live demo

The pilot runs at <https://design-studio-demo-u0i3.onrender.com/?embed>. It is
on a free instance that sleeps when idle, so the first visit after a quiet
spell waits about a minute on the host's loading page. To frame it:

```html
<iframe
  src="https://design-studio-demo-u0i3.onrender.com/?embed"
  title="Design Studio for FastLED demo"
  width="100%" height="760"
  allow="fullscreen; microphone; midi"
></iframe>
```

## The link

| Address | Opens |
| --- | --- |
| `/?embed` | Field Transform Demo, the patch in the README's overview picture |
| `/?embed=<starter id>` | that Start Gallery starter (`juggle`, `fire`, `audio-spectrum`, …) |

An id that names no starter opens the default. Ids are the `id` fields of
`STARTER_TEMPLATES` (`src/state/patterns/starterTemplates.ts`).

```html
<iframe
  src="https://your-host.example/?embed"
  title="Design Studio for FastLED demo"
  width="100%" height="760"
  allow="fullscreen; microphone"
></iframe>
```

`allow="fullscreen"` is for Stage; `microphone` only matters for a starter
that listens (`audio-spectrum`). Without `midi` in the list the browser logs a
permissions-policy error as the Control Deck looks for controllers; nothing
else is affected. The layout is the desktop one, so give the
frame at least 1200 px of width.

## What an embedded session is

Three rules, each held in one place:

- **It opens on its starter.** `App.tsx`'s start-up calls `openEmbedStarter`
  (`src/utils/startFlow.ts`) instead of reading saved projects, so there is no
  first-visit showcase and no Start Gallery in the way. The starter loads
  through the same path as a Start Gallery pick.
- **It keeps everything in memory.** An inline script in `index.html` swaps
  `window.localStorage` for a `Map` before any module loads, because stores
  read storage as they load. The session reads nothing this browser saved and
  leaves nothing behind: projects, settings, snapshots and the pattern library
  all work, and are gone on reload. IndexedDB is not swapped; it holds only
  music a visitor adds, and a browser already keeps a framed site's storage
  apart per embedding site.
- **It has no upload helper.** `helperRequest` (`src/utils/backendClient.ts`)
  is the one function that sends a helper request, and it refuses when
  embedded; `BACKEND_URL` becomes an address that never resolves. Without
  this, `localhost:8008` on a visitor's machine is their own Studio and its
  Projects folder. Every caller already treats a refusal as "helper offline",
  so compile, upload, serial and the radio relay show their offline state.

`src/utils/embedMode.ts` reads the parameter; `EMBEDDED` is the flag the rules
above test.

## Hosting

The root `Dockerfile` builds the web app and serves `dist/` with nginx
(`deploy/nginx.conf.template`), listening on `$PORT`. It sends no
`X-Frame-Options` and no `frame-ancestors` policy, so any site may frame it.
The image holds the browser app only.

`render.yaml` is a Render Blueprint for that image: one web service on the
free plan, with automatic deploys off so a deploy is started by hand.

The same `dist/` can be served by any static host; the container exists for
hosts that build from a Dockerfile. The address without `?embed` is the full
web app, which looks for a helper on the visitor's own machine as it does
anywhere else.

## Not done

- No embed-specific layout: the full workspace is shown, including the Upload
  tab in its helper-offline state.
- A parent page that is itself cross-origin isolated (`COEP`) blocks the frame
  unless the host adds `Cross-Origin-Resource-Policy: cross-origin`.
- Not tried on a phone-width frame.
