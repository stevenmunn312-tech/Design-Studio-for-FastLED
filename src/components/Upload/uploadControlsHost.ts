/**
 * Where the Upload workspace's deploy controls are drawn.
 *
 * The id lives in its own module because `App.tsx` renders the host element
 * but loads `MatrixOutputDeployPopup` lazily — importing the constant from the
 * popup itself would pull the whole upload bundle into the first paint.
 */
export const UPLOAD_CONTROLS_HOST_ID = 'upload-deploy-controls'
