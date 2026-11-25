import { DESKTOP_DOWNLOAD_MESSAGE, PUBLIC_SITE_LABEL } from '../../utils/buildTools'
import { PUBLIC_SITE_URL } from '../../utils/communityUpload'
import { EMBEDDED } from '../../utils/embedMode'
import styles from './Upload.module.css'

/**
 * The Upload tab's first line in an embedded demo, which has no build tools:
 * where to get the version that does. Nothing is drawn anywhere else. The link
 * opens a new tab, because the demo runs inside a frame on someone else's page.
 */
export default function DesktopDownloadNotice() {
  if (!EMBEDDED) return null
  return (
    <p className={styles.demoNotice} role="note">
      {DESKTOP_DOWNLOAD_MESSAGE}{' '}
      <a href={PUBLIC_SITE_URL} target="_blank" rel="noopener noreferrer">{PUBLIC_SITE_LABEL}</a>
    </p>
  )
}
