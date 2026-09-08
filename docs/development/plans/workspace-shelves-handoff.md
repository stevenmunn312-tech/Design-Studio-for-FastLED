# Plan — Workspace-owned sidebars, and a preview that never leaves

Follows [one canvas, four workspaces](../design/workspace-tabs.md), which shipped
on 2026-09-08 (`659f8b50`, tidied by `64fa8b15`). That note is the contract for
the tabs themselves; this one covers what the tabs exposed.

Status: **proposed, nothing built**. Raised from bench use the same evening the
tabs landed.

## What the tabs exposed

Standing on the Hardware workspace, the left panel offers Solid Color, Text,
Circle, Line, Shape and Path. None of those can go on a bench. Meanwhile the one
control that *is* relevant — **Add Hardware** — is a small button floating in a
corner of the canvas, and it opens a hover-cascade of five categories (Inputs,
Storage, Amplifiers & DACs, Displays, LED outputs) crammed into a popover while
an entire sidebar sits unused beside it.

That cascade exists because there was nowhere else to put it. Now there is.

The tabs' own argument, one level in: **the sidebar is stocked for a workspace
you are not in.** It was a fixed node library beside a fixed graph; with four
workspaces it has to belong to whichever one is showing.

## The shelf

On **Hardware**, the sidebar becomes the parts shelf — the Add Hardware cascade,
unpacked into browsable sections with the renders and descriptions the catalogue
already carries.

This is the real fix for a problem the tabs work only patched over. `64fa8b15`
added a search stub: search the node library for "button", get told it lives on
the bench, click through. That is a good error message, not discovery — it only
works for someone who already knows the word "button". A shelf means the parts
are *browsable*, the way nodes are, and nobody has to guess a name to find one.

**Keep the search stub.** Someone on the Graph workspace searching for a
hardware-owned module still deserves an answer without changing workspace. Point
it at the shelf rather than merely at the workspace once the shelf exists.

### Build Diagram and Upload

Both likely want an **information shelf** rather than a picker — they are things
you read, not things you assemble from a palette. Neither is designed yet, and
Build Diagram needs work of its own first; it already carries its own left
column, so the question there is whether that column *becomes* the sidebar
rather than sitting beside one.

Not blocking the Hardware shelf. Do that one first, learn from it.

## The preview belongs to all four

The LED preview and transport must be present in every workspace, so someone can
put music on and watch the patterns while doing anything else. That was the one
pane judged to earn permanent space in the tabs note, and it does not currently
get it.

**This is a live gap, not a preference.** In `src/App.tsx` the preview dock is
rendered only in the non-build branch, and gated again on the display editor:

```jsx
{workspaceMode === 'build' && !stageMode ? (
  <BuildDiagramWorkspace />
) : (
  <>
    <div className={styles.workspaceCanvas}>…</div>
    {!displayEditorOpen && <div className={styles.previewDock}>…<LEDPreview /></div>}
  </>
)}
```

So the preview is missing on **Build Diagram**, because that workspace replaces
the entire row rather than the canvas within it. Hardware, Graph and Upload have
it today — verified in the browser when the tabs landed.

Two things to decide while fixing it:

- **Build Diagram** must stop replacing the whole workspace row and become a
  canvas like the other three, so the dock survives. Its own `Back to Graph`
  button and left column both predate the tabs and want revisiting at the same
  time.
- **The display editor** currently hides the preview too. It is a mode of Graph
  rather than a fifth workspace, so the same rule arguably applies — but it is a
  full-width editing surface and the hiding may well be deliberate. Decide it,
  do not inherit it by accident.

## Order

1. Preview dock in all four workspaces (smallest, and the one with a confirmed
   gap rather than a design still to do).
2. Hardware shelf, absorbing the Add Hardware cascade; repoint the search stub at
   it.
3. Build Diagram's own tidy-up, then its information shelf.
4. Upload's information shelf, if it wants one at all.

## What is already settled

From the tabs note, and unchanged here: no split-view option; the status bar
stays beneath every workspace; tab order tells the build story while a session
lands on Graph. `hardwarePaneTab` is a mirrored alias of the Hardware and Upload
modes rather than dead state — see that note's scope before deleting it.
