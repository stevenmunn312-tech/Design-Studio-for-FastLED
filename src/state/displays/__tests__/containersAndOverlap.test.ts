import { describe, expect, it } from 'vitest'
import {
  displayWidgetParent,
  normalizeDisplayDocument,
  orderDisplayWidgetTree,
  type DisplayDocument,
  type DisplayWidget,
  type DisplayWidgetType,
  type PlacedDisplayWidget,
} from '../displayDocument'
import { defaultDisplayWidgetProperties } from '../displayRegistry'
import {
  adoptDisplayWidgets,
  alignDisplayWidgets,
  createDisplayDocument,
  displayContainerInnerBounds,
  displayLayoutIssues,
  displayWidgetsWithChildren,
  pasteDisplayWidgets,
  restackDisplayWidgets,
  translateDisplayWidgets,
  updateDisplayWidget,
} from '../displayEditor'
import { resolveDisplayThemeTokens } from '../displayTheme'
import { customDisplayLvglSetupCpp } from '../../../codegen/displays/customDisplayLvglCpp'
import { displayWidgetClipStyle } from '../../../components/DisplayEditor/displayPreviewStyles'

function widget(
  id: string,
  type: DisplayWidgetType,
  [x, y, width, height]: [number, number, number, number],
  parentId?: string,
): PlacedDisplayWidget {
  return {
    id,
    type,
    label: id,
    bounds: { x, y, width, height },
    ...(parentId ? { parentId } : {}),
    properties: defaultDisplayWidgetProperties(type),
  }
}

function document(widgets: DisplayWidget[]): DisplayDocument {
  return { ...createDisplayDocument('panel', 320, 240), gridSize: 8, widgets }
}

const ids = (doc: DisplayDocument) => doc.widgets.map((entry) => entry.id)
const parentOf = (doc: DisplayDocument, id: string) => (
  displayWidgetParent(doc, doc.widgets.find((entry) => entry.id === id)!)?.id ?? null
)
const border = resolveDisplayThemeTokens(createDisplayDocument('panel').theme).borderWidth

describe('a widget in a Container', () => {
  it('keeps only a parent that can hold it', () => {
    const doc = document([
      widget('box', 'Container', [0, 0, 160, 120]),
      widget('nested', 'Container', [8, 8, 64, 48], 'box'),
      widget('label', 'Text', [16, 16, 64, 24], 'box'),
      widget('stray', 'Text', [200, 0, 64, 24], 'missing'),
      widget('wrong', 'Text', [200, 40, 64, 24], 'label'),
      { id: 'wired', type: 'Slider', label: 'wired', parentId: 'box', properties: {} },
    ])
    expect(parentOf(doc, 'label')).toBe('box')
    for (const id of ['nested', 'stray', 'wrong', 'wired']) expect(parentOf(doc, id)).toBeNull()
    const ordered = orderDisplayWidgetTree(doc.widgets)
    expect(ordered.filter((entry) => entry.parentId).map((entry) => entry.id)).toEqual(['label'])
  })

  it('is listed straight after its container, the order LVGL draws it in', () => {
    const raw = {
      ...document([
        widget('label', 'Text', [16, 16, 64, 24], 'box'),
        widget('other', 'Text', [200, 0, 64, 24]),
        widget('box', 'Container', [0, 0, 160, 120]),
        widget('button', 'Button', [16, 56, 96, 48], 'box'),
      ]),
    }
    const normalized = normalizeDisplayDocument(JSON.parse(JSON.stringify(raw)))!
    expect(ids(normalized)).toEqual(['other', 'box', 'label', 'button'])
    expect(normalized.widgets[2].parentId).toBe('box')
  })
})

describe('moving widgets in and out of a Container', () => {
  const base = document([
    widget('box', 'Container', [0, 0, 160, 120]),
    widget('above', 'Text', [200, 0, 64, 24]),
    widget('label', 'Text', [200, 40, 64, 24]),
  ])

  it('puts a widget dropped wholly inside on top of what the container holds', () => {
    const moved = translateDisplayWidgets(base, ['label'], -184, -24)
    const settled = adoptDisplayWidgets(moved, ['label'])
    expect(parentOf(settled, 'label')).toBe('box')
    expect(ids(settled)).toEqual(['box', 'label', 'above'])
  })

  it('takes it out, just above the container, when it is dragged even partly out', () => {
    const inside = adoptDisplayWidgets(translateDisplayWidgets(base, ['label'], -184, -24), ['label'])
    const partly = adoptDisplayWidgets(translateDisplayWidgets(inside, ['label'], 128, 0), ['label'])
    expect(parentOf(partly, 'label')).toBeNull()
    expect(ids(partly)).toEqual(['box', 'label', 'above'])
  })

  it('carries its children when the container moves, by however far it moved', () => {
    const doc = document([widget('box', 'Container', [0, 0, 160, 120]), widget('label', 'Text', [12, 12, 64, 24], 'box')])
    const moved = translateDisplayWidgets(doc, ['box'], 40, 16)
    expect(moved.widgets[1].bounds).toEqual({ x: 52, y: 28, width: 64, height: 24 })
    // A typed position moves them too.
    const typed = updateDisplayWidget(doc, 'box', (entry) => ({ ...entry, bounds: { ...entry.bounds!, x: 80 } }))
    expect(typed.widgets[1].bounds?.x).toBe(92)
  })

  it('moves a child once when it is moved along with its container', () => {
    const doc = document([
      widget('box', 'Container', [40, 0, 160, 120]),
      widget('label', 'Text', [48, 8, 64, 24], 'box'),
      widget('far', 'Text', [0, 160, 64, 24]),
    ])
    const aligned = alignDisplayWidgets(doc, ['box', 'label', 'far'], 'left')
    expect(aligned.widgets.find((entry) => entry.id === 'box')?.bounds?.x).toBe(0)
    expect(aligned.widgets.find((entry) => entry.id === 'label')?.bounds?.x).toBe(0)
  })

  it('takes in what a container is moved or grown over, and keeps what it no longer fits', () => {
    const doc = document([widget('box', 'Container', [0, 0, 64, 48]), widget('label', 'Text', [80, 8, 64, 24])])
    const grown = adoptDisplayWidgets(
      updateDisplayWidget(doc, 'box', (entry) => ({ ...entry, bounds: { ...entry.bounds!, width: 160 } })),
      ['box'],
    )
    expect(parentOf(grown, 'label')).toBe('box')
    const shrunk = adoptDisplayWidgets(
      updateDisplayWidget(grown, 'box', (entry) => ({ ...entry, bounds: { ...entry.bounds!, width: 96 } })),
      ['box'],
    )
    expect(parentOf(shrunk, 'label')).toBe('box')
    expect(displayLayoutIssues(shrunk)).toContainEqual(expect.objectContaining({
      widgetId: 'label', code: 'bounds', message: 'label is cut off by its container box.',
    }))
  })

  it('selects, copies and pastes a container with what it holds', () => {
    const doc = document([
      widget('box', 'Container', [0, 0, 160, 120]),
      widget('label', 'Text', [16, 16, 64, 24], 'box'),
      widget('other', 'Text', [200, 0, 64, 24]),
    ])
    expect(displayWidgetsWithChildren(doc, ['box'])).toEqual(['box', 'label'])
    const pasted = pasteDisplayWidgets(doc, doc.widgets.slice(0, 2))
    const [box, label] = pasted.widgetIds
    expect(parentOf(pasted.document, label)).toBe(box)
    // A child pasted on its own lands in whatever container holds it.
    const alone = pasteDisplayWidgets(doc, [doc.widgets[1]])
    expect(parentOf(alone.document, alone.widgetIds[0])).toBe('box')
  })
})

describe('stacking order', () => {
  const doc = document([
    widget('a', 'Text', [0, 0, 64, 24]),
    widget('box', 'Container', [0, 40, 160, 120]),
    widget('one', 'Text', [8, 48, 64, 24], 'box'),
    widget('two', 'Text', [8, 80, 64, 24], 'box'),
    widget('b', 'Text', [200, 0, 64, 24]),
  ])

  it('moves a container with its children among the widgets on the screen', () => {
    expect(ids(restackDisplayWidgets(doc, ['box'], 'front'))).toEqual(['a', 'b', 'box', 'one', 'two'])
    expect(ids(restackDisplayWidgets(doc, ['box'], 'back'))).toEqual(['box', 'one', 'two', 'a', 'b'])
    expect(ids(restackDisplayWidgets(doc, ['a'], 'forward'))).toEqual(['box', 'one', 'two', 'a', 'b'])
    expect(ids(restackDisplayWidgets(doc, ['b'], 'backward'))).toEqual(['a', 'b', 'box', 'one', 'two'])
  })

  it('moves a child only among its container’s children', () => {
    expect(ids(restackDisplayWidgets(doc, ['one'], 'front'))).toEqual(['a', 'box', 'two', 'one', 'b'])
    expect(restackDisplayWidgets(doc, ['two'], 'front')).toBe(doc)
  })
})

describe('overlap', () => {
  it('allows anything over anything except one control over another', () => {
    const doc = document([
      widget('button', 'Button', [0, 0, 96, 48]),
      widget('caption', 'Text', [8, 8, 64, 24]),
      widget('toggle', 'Toggle', [200, 0, 96, 48]),
      widget('slider', 'Slider', [208, 8, 96, 48]),
    ])
    const issues = displayLayoutIssues(doc)
    expect(issues.filter((issue) => issue.code === 'collision')).toEqual([expect.objectContaining({
      widgetId: 'toggle',
      otherWidgetId: 'slider',
      message: 'toggle is under slider, so a touch where they overlap reaches only slider.',
    })])
    expect(issues.some((issue) => issue.widgetId === 'button' || issue.widgetId === 'caption')).toBe(false)
  })
})

describe('a Container on the glass', () => {
  const doc = document([
    widget('box', 'Container', [40, 32, 200, 160]),
    widget('label', 'Text', [48, 40, 96, 24], 'box'),
    { ...widget('button', 'Button', [48, 80, 96, 48], 'box'), properties: { ...defaultDisplayWidgetProperties('Button'), showLabel: true } },
  ])
  const setup = customDisplayLvglSetupCpp({ id: 'panel', document: doc, bindings: {} }).join('\n')

  it('is a plain object that clips its children and draws its border over them', () => {
    expect(setup).toContain('_cd_panel[0].object = lv_obj_create(_cdScreen_panel);')
    expect(setup).toContain('lv_obj_remove_flag(_cd_panel[0].object, LV_OBJ_FLAG_SCROLLABLE);')
    expect(setup).toContain('lv_obj_set_style_clip_corner(_cd_panel[0].object, true, LV_PART_MAIN);')
    expect(setup).toContain('lv_obj_set_style_border_post(_cd_panel[0].object, true, LV_PART_MAIN);')
  })

  it('creates each child in it, placed from inside its border', () => {
    const inner = displayContainerInnerBounds(doc.widgets[0] as PlacedDisplayWidget, doc.theme)
    expect(inner).toEqual({ x: 40 + border, y: 32 + border, width: 200 - 2 * border, height: 160 - 2 * border })
    expect(setup).toContain('_cd_panel[1].object = lv_label_create(_cd_panel[0].object);')
    expect(setup).toContain(`lv_obj_set_pos(_cd_panel[1].object, ${48 - inner.x}, ${40 - inner.y});`)
    expect(setup).toContain('_cd_panel[2].object = lv_button_create(_cd_panel[0].object);')
    // A child's caption goes in the container too.
    expect(setup).toContain('lv_obj_t *_cdCaption_panel_2 = lv_label_create(_cd_panel[0].object);')
    expect(setup).toContain(`lv_obj_set_pos(_cdCaption_panel_2, ${48 - inner.x}, ${80 - inner.y});`)
  })

  it('leaves only controls clickable, so a press goes through anything drawn over one', () => {
    expect(setup).toContain('lv_obj_remove_flag(_cd_panel[0].object, LV_OBJ_FLAG_CLICKABLE);')
    expect(setup).toContain('lv_obj_remove_flag(_cd_panel[1].object, LV_OBJ_FLAG_CLICKABLE);')
    expect(setup).not.toContain('lv_obj_remove_flag(_cd_panel[2].object, LV_OBJ_FLAG_CLICKABLE);')
  })
})

describe('a Container in the preview', () => {
  it('cuts a child off at the inside of its border, and leaves one that fits alone', () => {
    const doc = document([
      widget('box', 'Container', [0, 0, 100, 80]),
      widget('fits', 'Text', [8, 8, 64, 24], 'box'),
      widget('over', 'Text', [60, 64, 64, 24], 'box'),
    ])
    const [, fits, over] = doc.widgets as PlacedDisplayWidget[]
    expect(displayWidgetClipStyle(doc, fits)).toEqual({})
    const right = 60 + 64 - (100 - border)
    const bottom = 64 + 24 - (80 - border)
    expect(displayWidgetClipStyle(doc, over)).toEqual({ clipPath: `inset(0px ${right}px ${bottom}px 0px)` })
  })
})
