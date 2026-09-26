/**
 * Where the Hardware workspace's parts shelf is drawn.
 *
 * The id lives in its own module because `App.tsx` renders the host element
 * but loads `HardwarePane` lazily — importing the constant from the shelf
 * would pull the whole pane into the first paint.
 */
export const HARDWARE_SHELF_HOST_ID = 'hardware-parts-shelf'
