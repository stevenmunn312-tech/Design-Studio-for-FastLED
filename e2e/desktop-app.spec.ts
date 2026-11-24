import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// One first-run journey through the packaged app. The steps share a page and
// run in order, because the welcome dialog only shows on a fresh data folder.
test.describe.configure({ mode: 'serial' })

const version: string = JSON.parse(readFileSync('package.json', 'utf-8')).version

let page: Page
const errors: string[] = []

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  page.on('pageerror', (error) => errors.push(`page error: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console error: ${message.text()}`)
  })
})

test.afterAll(async () => {
  await page.close()
})

async function snapshot(name: string) {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) })
}

/** Share of the LED preview's on-screen pixels that are lit, read from a screenshot. */
async function litShare(): Promise<number> {
  const shot = await page.locator('canvas').first().screenshot()
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(image.width, image.height)
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, image.width, image.height)
    let lit = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] > 150) lit += 1
    }
    return lit / (data.length / 4)
  }, shot.toString('base64'))
}

test('the launcher serves this version of the Studio', async ({ request }) => {
  const status = await (await request.get('/api/desktop/status')).json()
  expect(status).toMatchObject({ ok: true, desktop: true, version })

  const health = await request.get('/api/health')
  expect(health.ok()).toBe(true)
})

test('a first run opens on the welcome dialog and enters the studio', async () => {
  await page.goto('/')
  await expect(page).toHaveTitle('Design Studio for FastLED')

  const welcome = page.getByRole('dialog', { name: 'Welcome to Design Studio for FastLED' })
  await expect(welcome).toBeVisible()
  await snapshot('1-welcome')

  await welcome.getByRole('button', { name: 'Skip to the studio' }).click()
  await expect(welcome).toBeHidden()
  await expect(page.getByRole('tab', { name: 'Hardware' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: /Generic ESP32 DevKit/ })).toBeVisible()
})

test('the Fire starter loads and lights the LED preview', async () => {
  await page.getByRole('button', { name: 'Open Start Gallery' }).click()
  const gallery = page.getByRole('dialog', { name: 'Start gallery' })
  await gallery.getByRole('button', { name: /^Fire, Easy/ }).click()
  await expect(gallery).toBeHidden()

  await page.getByRole('tab', { name: /^Graph/ }).click()
  const graph = page.getByRole('application', { name: 'Node graph editor' })
  await expect(graph.getByRole('group', { name: /^Fire node/ })).toBeVisible()

  const status = page.getByRole('group', { name: 'Project status' })
  await expect(status).toContainText(/FPS: [1-9]/)
  await expect.poll(litShare, { message: 'the LED preview draws lit pixels' }).toBeGreaterThan(0.02)
  await snapshot('2-fire-preview')
})

test('the Upload tab reaches the helper', async () => {
  await page.getByRole('tab', { name: /^Upload/ }).click()
  await expect(page.getByRole('region', { name: 'Getting to your board' })).toBeVisible()
  // The port line leaves "Checking ports" only once the helper has answered.
  await expect(page.getByRole('group', { name: 'Project status' })).not.toContainText('Checking ports')
  await expect(page.getByRole('button', { name: 'View Code' })).toBeEnabled()
  await snapshot('3-upload')
})

test('the journey logged no errors', () => {
  expect(errors).toEqual([])
})
