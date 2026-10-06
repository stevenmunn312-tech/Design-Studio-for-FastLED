import type { CustomBoardDefinition } from '../../state/customBoard'
import type { BoardI2cDefault } from '../../build/boardI2cDefaults'
import { customBoardGeometry } from '../../build/customBoardGeometry'
import { customBoardSvgFragment } from '../../build/customBoardSvg'

interface Props {
  definition: CustomBoardDefinition
  defaultI2c?: BoardI2cDefault
  className?: string
}

/** Can be placed inside another SVG; transforms apply to both pads and labels. */
export function CustomBoardGraphicFragment({ definition, defaultI2c }: Props) {
  return <g dangerouslySetInnerHTML={{ __html: customBoardSvgFragment(definition, defaultI2c) }} />
}

export function CustomBoardGraphic({ definition, defaultI2c, className }: Props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={customBoardGeometry(definition).viewBox}
      role="img" aria-label={`${definition.name} — user-defined schematic pinout`} className={className}>
      <CustomBoardGraphicFragment definition={definition} defaultI2c={defaultI2c} />
    </svg>
  )
}
