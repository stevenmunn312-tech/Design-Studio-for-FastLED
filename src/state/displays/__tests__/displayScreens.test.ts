import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DISPLAY_SCREEN,
  DISPLAY_DOCUMENT_LIMITS,
  displayScreenAt,
  displayScreens,
  displayWidgetGoTo,
  displayWidgetParent,
  displayWidgetScreenId,
  normalizeDisplayDocument,
  screenWidgets,
  type DisplayDocument,
} from '../displayDocument'
import {
  addDisplayScreen,
  addDisplayWidget,
  adoptDisplayWidgets,
  createDisplayDocument,
  displayLayoutIssues,
  duplicateDisplayScreen,
  editingDisplayScreenId,
  moveDisplayScreen,
  pasteDisplayWidgets,
  placeDisplayWidget,
  removeDisplayScreen,
  renameDisplayScreen,
  resizeDisplayDocument,
  unplaceDisplayWidgets,
  updateDisplayWidget,
} from '../displayEditor'
import { DISPLAY_SCREEN_INPUT_ID, displayDocumentInputPorts } from '../displayRegistry'

function twoScreens(): { document: DisplayDocument; second: string } {
  const added = addDisplayScreen(createDisplayDocument('panel', 240, 320), 'Settings')
  return { document: added.document, second: added.screenId! }
}

describe('a design with several screens', () => {
  it('reads a document saved before screens as one Main screen', () => {
    const legacy = {
      schemaVersion: 1,
      displayId: 'panel',
      designSize: { width: 240, height: 320 },
      orientation: '0',
      gridSize: 8,
      theme: {},
      widgets: [{ id: 'go', type: 'Button', label: 'Go', bounds: { x: 0, y: 0, width: 96, height: 48 }, properties: {} }],
    }
    const normalized = normalizeDisplayDocument(legacy)!
    expect(normalized.screens).toEqual([DEFAULT_DISPLAY_SCREEN])
    // Written out, so a later reorder of the screens never moves it.
    expect(normalized.widgets[0].screenId).toBe('main')
  })

  it('keeps screens and puts a widget naming a missing screen on the first', () => {
    const normalized = normalizeDisplayDocument({
      schemaVersion: 1,
      displayId: 'panel',
      designSize: { width: 240, height: 320 },
      screens: [{ id: 'home', name: 'Home' }, { id: 'home', name: 'Again' }, { id: 'more', name: '  ' }, { id: '../x', name: 'Bad' }],
      widgets: [
        { id: 'a', type: 'Text', label: 'A', bounds: { x: 0, y: 0, width: 60, height: 20 }, screenId: 'more', properties: {} },
        { id: 'b', type: 'Text', label: 'B', bounds: { x: 0, y: 0, width: 60, height: 20 }, screenId: 'gone', properties: {} },
        { id: 'c', type: 'Slider', label: 'C', screenId: 'more', properties: {} },
      ],
    })!
    // Duplicate ids and unusable ids are dropped; a blank name reads as its id.
    expect(normalized.screens).toEqual([{ id: 'home', name: 'Home' }, { id: 'more', name: 'more' }])
    expect(normalized.widgets.map((widget) => widget.screenId)).toEqual(['more', 'home', undefined])
  })

  it('caps the number of screens', () => {
    const screens = Array.from({ length: 20 }, (_, index) => ({ id: `s${index}`, name: `S${index}` }))
    const normalized = normalizeDisplayDocument({
      schemaVersion: 1, displayId: 'panel', designSize: { width: 240, height: 320 }, screens, widgets: [],
    })!
    expect(normalized.screens).toHaveLength(DISPLAY_DOCUMENT_LIMITS.screensPerDocument)
  })

  it('drops a Go to screen naming a screen the design does not have', () => {
    const normalized = normalizeDisplayDocument({
      schemaVersion: 1,
      displayId: 'panel',
      designSize: { width: 240, height: 320 },
      screens: [{ id: 'home', name: 'Home' }, { id: 'more', name: 'More' }],
      widgets: [
        { id: 'ok', type: 'Button', label: 'More', bounds: { x: 0, y: 0, width: 96, height: 48 }, properties: { goTo: 'more' } },
        { id: 'no', type: 'Button', label: 'Gone', bounds: { x: 0, y: 60, width: 96, height: 48 }, properties: { goTo: 'gone' } },
      ],
    })!
    expect(normalized.widgets[0].properties.goTo).toBe('more')
    expect(normalized.widgets[1].properties).not.toHaveProperty('goTo')
  })

  it('adds, places and pastes onto the screen being drawn', () => {
    const { document, second } = twoScreens()
    let next = addDisplayWidget(document, 'Button', second)
    next = addDisplayWidget(next, 'Button')
    // Each screen starts its free-rectangle search empty: the two buttons sit
    // at the same place on different screens.
    expect(next.widgets[0].bounds).toEqual(next.widgets[1].bounds)
    expect(screenWidgets(next, second).map((widget) => widget.id)).toEqual(['button'])
    expect(screenWidgets(next, 'main').map((widget) => widget.id)).toEqual(['button-2'])

    const unplaced = unplaceDisplayWidgets(next, ['button'])
    expect(unplaced.widgets[0]).not.toHaveProperty('screenId')
    const placed = placeDisplayWidget(unplaced, 'button', second)
    expect(placed.widgets[0].screenId).toBe(second)

    const pasted = pasteDisplayWidgets(next, [next.widgets[1]], 0, second)
    expect(displayWidgetScreenId(pasted.document, pasted.document.widgets.at(-1)!)).toBe(second)
  })

  it('reports overlap only between widgets on the same screen', () => {
    const { document, second } = twoScreens()
    let next = addDisplayWidget(document, 'Button')
    next = addDisplayWidget(next, 'Button', second)
    expect(displayLayoutIssues(next).filter((issue) => issue.code === 'collision' || issue.code === 'separation')).toEqual([])
    const moved = updateDisplayWidget(next, 'button-2', (widget) => ({ ...widget, screenId: 'main' }))
    expect(displayLayoutIssues(moved).some((issue) => issue.code === 'collision')).toBe(true)
  })

  it('does not put a widget in a container on another screen', () => {
    const { document, second } = twoScreens()
    let next = addDisplayWidget(document, 'Container')
    next = updateDisplayWidget(next, 'container', (widget) => ({ ...widget, bounds: { x: 0, y: 0, width: 200, height: 200 } }))
    next = addDisplayWidget(next, 'Text', second)
    next = updateDisplayWidget(next, 'text', (widget) => ({ ...widget, bounds: { x: 16, y: 16, width: 64, height: 24 } }))
    const adopted = adoptDisplayWidgets(next, ['container', 'text'])
    expect(adopted.widgets.find((widget) => widget.id === 'text')).not.toHaveProperty('parentId')
    expect(displayWidgetParent(adopted, { ...adopted.widgets.find((widget) => widget.id === 'text')!, parentId: 'container' })).toBeNull()
  })

  it('adds, renames, moves, duplicates and removes screens', () => {
    const { document, second } = twoScreens()
    expect(displayScreens(document).map((screen) => screen.name)).toEqual(['Main', 'Settings'])
    const renamed = renameDisplayScreen(document, second, '  Lights  ')
    expect(displayScreens(renamed)[1].name).toBe('Lights')
    expect(renameDisplayScreen(document, second, '   ')).toBe(document)
    const moved = moveDisplayScreen(renamed, second, -1)
    expect(displayScreens(moved).map((screen) => screen.id)).toEqual([second, 'main'])
    expect(moveDisplayScreen(moved, second, -1)).toBe(moved)

    const drawn = addDisplayWidget(document, 'Text', second)
    const copy = duplicateDisplayScreen(drawn, second)
    expect(displayScreens(copy.document).map((screen) => screen.name)).toEqual(['Main', 'Settings', 'Settings copy'])
    const copied = screenWidgets(copy.document, copy.screenId!)
    expect(copied).toHaveLength(1)
    expect(copied[0].bounds).toEqual(drawn.widgets[0].bounds)
    expect(copied[0].id).not.toBe(drawn.widgets[0].id)
  })

  it('removes a screen with what is drawn on it, keeping wired controls and clearing buttons that went there', () => {
    const { document, second } = twoScreens()
    let next = addDisplayWidget(document, 'Slider', second)
    next = addDisplayWidget(next, 'Text', second)
    next = addDisplayWidget(next, 'Button')
    next = updateDisplayWidget(next, 'button', (widget) => ({ ...widget, properties: { ...widget.properties, goTo: second } }))
    const removed = removeDisplayScreen(next, second, ['slider'])
    expect(displayScreens(removed).map((screen) => screen.id)).toEqual(['main'])
    expect(removed.widgets.map((widget) => widget.id)).toEqual(['slider', 'button'])
    expect(removed.widgets[0]).not.toHaveProperty('bounds')
    expect(removed.widgets[1].properties).not.toHaveProperty('goTo')
    // The last screen stays.
    expect(removeDisplayScreen(removed, 'main')).toBe(removed)
  })

  it('reshapes each screen on its own when the panel turns', () => {
    const { document, second } = twoScreens()
    let next = addDisplayWidget(document, 'Button')
    next = addDisplayWidget(next, 'Button', second)
    const turned = resizeDisplayDocument(next, { width: 320, height: 240 }, '90')
    // Same place on each screen: neither was pushed down to make room for
    // a control it is never drawn beside.
    expect(turned.widgets[0].bounds).toEqual(turned.widgets[1].bounds)
  })

  it('offers the Screen input only when there is a screen to choose', () => {
    const { document } = twoScreens()
    expect(displayDocumentInputPorts(createDisplayDocument('panel')).map((port) => port.id)).not.toContain(DISPLAY_SCREEN_INPUT_ID)
    expect(displayDocumentInputPorts(document)[0]).toEqual({ id: DISPLAY_SCREEN_INPUT_ID, label: 'Screen', dataType: 'float' })
  })

  it('selects a screen by rounding the input and holding it to the screens there are', () => {
    const { document, second } = twoScreens()
    expect(displayScreenAt(document, 0)).toBe('main')
    expect(displayScreenAt(document, 0.6)).toBe(second)
    expect(displayScreenAt(document, 9)).toBe(second)
    expect(displayScreenAt(document, -3)).toBe('main')
    expect(displayScreenAt(document, Number.NaN)).toBeNull()
    expect(displayScreenAt(document, 'next')).toBeNull()
  })

  it('reads a button going to its own screen as going nowhere', () => {
    const { document, second } = twoScreens()
    const button = { type: 'Button' as const, screenId: 'main', properties: { goTo: second } }
    expect(displayWidgetGoTo(document, button)).toBe(second)
    expect(displayWidgetGoTo(document, { ...button, screenId: second })).toBeNull()
    expect(displayWidgetGoTo(document, { ...button, type: 'Toggle' })).toBeNull()
  })

  it('opens the first screen when the one asked for is gone', () => {
    const { document, second } = twoScreens()
    expect(editingDisplayScreenId(document, second)).toBe(second)
    expect(editingDisplayScreenId(document, 'gone')).toBe('main')
    expect(editingDisplayScreenId(document, null)).toBe('main')
  })
})
