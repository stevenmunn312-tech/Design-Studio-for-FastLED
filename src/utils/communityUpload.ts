const DEFAULT_COMMUNITY_SITE = 'https://design-studio-for-fastled.design-studio-for-fastled.workers.dev'

export interface CommunityUploadProject {
  projectName: string
  fileName: string
  projectJson: string
  controller: string
  ledCount: number
}

export interface CommunityUploadResult {
  opened: boolean
}

function communitySiteUrl(): URL {
  const configured = (import.meta.env as Record<string, string | undefined>).VITE_COMMUNITY_SITE_URL?.trim()
  return new URL(configured || DEFAULT_COMMUNITY_SITE)
}

function hiddenField(form: HTMLFormElement, name: string, value: string) {
  const field = document.createElement('textarea')
  field.name = name
  field.value = value
  field.hidden = true
  form.appendChild(field)
}

/**
 * Posts the current project into a new community-site tab. A form navigation is
 * used because Design Studio's cross-origin isolation intentionally severs
 * normal opener messaging. The community endpoint validates the project and
 * places it only in that tab's session storage before showing confirmation.
 */
export function openCommunityUpload(project: CommunityUploadProject): CommunityUploadResult {
  const destination = communitySiteUrl()
  destination.pathname = '/upload/handoff'
  destination.search = ''
  const target = `design-studio-community-${Date.now()}`
  const popup = window.open('', target)
  if (!popup) return { opened: false }

  const form = document.createElement('form')
  form.method = 'POST'
  form.action = destination.toString()
  form.target = target
  form.hidden = true
  hiddenField(form, 'projectName', project.projectName)
  hiddenField(form, 'fileName', project.fileName)
  hiddenField(form, 'projectJson', project.projectJson)
  hiddenField(form, 'controller', project.controller)
  hiddenField(form, 'ledCount', String(project.ledCount))
  document.body.appendChild(form)
  form.submit()
  form.remove()
  return { opened: true }
}
