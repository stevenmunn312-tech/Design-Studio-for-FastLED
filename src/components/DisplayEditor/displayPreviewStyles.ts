import type { CSSProperties } from 'react'
import type { DisplayDocument } from '../../state/displayDocument'
import { displayAsset, displayAssetUrl } from '../../state/displayAssets'
import { resolveDisplayThemeTokens, type DisplayBackgroundTokens } from '../../state/displayTheme'
import { DISPLAY_CONTROL_TRACK_PX, type DisplayWidgetState } from '../../state/displayRegistry'

export function displayBackgroundStyle(background: DisplayBackgroundTokens): CSSProperties {
  if (background.kind === 'gradient') {
    return {
      background: `linear-gradient(${background.direction === 'vertical' ? '180deg' : '90deg'}, ${background.startColor}, ${background.endColor})`,
    }
  }
  if (background.kind === 'image') {
    const asset = displayAsset(background.assetId)
    return asset
      ? {
        backgroundColor: background.fallbackColor,
        backgroundImage: `url("${displayAssetUrl(asset)}")`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
      }
      : { backgroundColor: background.fallbackColor }
  }
  return { background: background.color }
}

export function displayThemeVariables(document: DisplayDocument): CSSProperties {
  const tokens = resolveDisplayThemeTokens(document.theme)
  return {
    '--display-surface': document.theme.surfaceColor,
    '--display-text': document.theme.textColor,
    '--display-accent': document.theme.accentColor,
    '--display-warning': document.theme.warningColor,
    '--display-success': document.theme.successColor,
    '--display-inactive': document.theme.inactiveColor,
    '--display-disabled': document.theme.disabledColor,
    '--display-radius': `${tokens.cornerRadius}px`,
    '--display-border': `${tokens.borderWidth}px`,
    '--display-font-size': `${tokens.fontSize}px`,
    '--display-grid': `${document.gridSize}px`,
  } as CSSProperties
}

export function displayWidgetThemeVariables(
  theme: DisplayDocument['theme'], state: DisplayWidgetState,
): CSSProperties {
  const tokens = resolveDisplayThemeTokens(theme).states[state]
  return {
    '--widget-state-surface': tokens.surfaceColor,
    '--widget-state-text': tokens.textColor,
    '--widget-state-border': tokens.borderColor,
    '--widget-state-indicator': tokens.indicatorColor,
    '--widget-state-track': tokens.trackColor,
    '--widget-state-thumb': tokens.thumbColor,
    '--widget-state-opacity': tokens.opacity,
    '--widget-state-offset': `${tokens.pressedOffset}px`,
    '--widget-track-thickness': `${DISPLAY_CONTROL_TRACK_PX}px`,
  } as CSSProperties
}
