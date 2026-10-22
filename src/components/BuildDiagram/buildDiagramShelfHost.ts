/**
 * Where the Build Diagram workspace's information panel is drawn.
 *
 * The id lives in its own module because `App.tsx` renders the host element
 * but loads `BuildDiagramWorkspace` lazily — importing the constant from the
 * workspace would pull the whole diagram bundle into the first paint.
 */
export const BUILD_DIAGRAM_SHELF_HOST_ID = 'build-diagram-panel'
