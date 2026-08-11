function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Unable to encode diagram image'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

export async function inlineSvgImages(svg: SVGSVGElement) {
  await Promise.all(Array.from(svg.querySelectorAll('image')).map(async (image) => {
    const href = image.getAttribute('href')
    if (!href || href.startsWith('data:')) return
    const response = await fetch(new URL(href, window.location.href))
    if (!response.ok) throw new Error(`Unable to embed diagram image: ${response.status}`)
    image.setAttribute('href', await blobAsDataUrl(await response.blob()))
  }))
}
