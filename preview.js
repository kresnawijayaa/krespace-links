import { parse } from 'parse5'

const shopeeHosts = new Set(['s.shopee.co.id', 'shopee.co.id', 'www.shopee.co.id'])
const redirects = new Set([301, 302, 303, 307, 308])
const maxBytes = 512 * 1024

function isHttps(url) {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port
}

function metadataPreview(html, pageUrl) {
  const document = parse(html)
  const head = document.childNodes.find(node => node.tagName === 'html')
    ?.childNodes.find(node => node.tagName === 'head')
  const images = new Map()
  const metadata = new Map()
  for (const node of head?.childNodes ?? []) {
    if (node.tagName !== 'meta') continue
    const attrs = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]))
    const key = (attrs.property || attrs.name)?.toLowerCase()
    const content = attrs.content?.trim()
    if (key && content && !metadata.has(key)) metadata.set(key, content)
    if (!['og:image:secure_url', 'og:image', 'twitter:image'].includes(key) || !attrs.content?.trim()) continue
    try {
      const url = new URL(attrs.content.trim(), pageUrl)
      if (isHttps(url) && url.href.length <= 4096 && !images.has(key)) images.set(key, url.href)
    } catch {
      // Ignore malformed metadata and try the next tag.
    }
  }
  return {
    image: images.get('og:image:secure_url') || images.get('og:image') || images.get('twitter:image'),
    title: (metadata.get('og:title') || metadata.get('twitter:title'))?.slice(0, 160),
    description: (metadata.get('og:description') || metadata.get('twitter:description') || metadata.get('description'))?.slice(0, 500)
  }
}

export async function findProductPreview(link) {
  try {
    let url = new URL(link)
    const signal = AbortSignal.timeout(4500)
    for (let hop = 0; hop <= 5; hop++) {
      // Restrict both the initial request and every redirect to known marketplace hosts.
      if (!isHttps(url) || !shopeeHosts.has(url.hostname)) return null
      const response = await fetch(url, {
        redirect: 'manual', signal, headers: {
          Accept: 'text/html',
          // Shopee serves public share metadata for this client on its short links.
          ...(url.hostname === 's.shopee.co.id' && { 'User-Agent': 'WhatsApp/2.24.1.1' })
        }
      })
      if (redirects.has(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location) return null
        url = new URL(location, url)
        continue
      }
      if (!response.ok || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel()
        return null
      }
      if (!response.body) return null
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let html = ''
      let bytes = 0
      try {
        while (bytes < maxBytes) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = value.subarray(0, maxBytes - bytes)
          bytes += chunk.length
          html += decoder.decode(chunk, { stream: true })
          if (/<\/head\s*>/i.test(html)) break
        }
      } finally {
        await reader.cancel()
      }
      return metadataPreview(html + decoder.decode(), url)
    }
  } catch {
    // A missing preview or unavailable provider should not prevent saving the product.
  }
  return null
}
