import { createServer } from 'node:http'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { findProductPreview } from './preview.js'
import { catalog, panel, signIn, page } from './views.js'

const { DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET, PUBLIC_URL = 'http://localhost:3000' } = process.env
const origin = new URL(PUBLIC_URL).origin
const secureCookie = origin.startsWith('https:') ? '; Secure' : ''
const cookie = 'krespace_admin'
const sessionAge = 8 * 60 * 60
const db = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 5000 }) : null
db?.on('error', () => console.error('Koneksi database terputus.'))
const adminEnabled = Boolean(db && ADMIN_PASSWORD?.length >= 8 && SESSION_SECRET?.length >= 32)
const css = readFileSync(new URL('./style.css', import.meta.url))
const adminScript = readFileSync(new URL('./admin.js', import.meta.url))
const failures = new Map()

function equal(a, b) {
  const digest = value => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(a), digest(b))
}

function signature(expires) {
  return createHmac('sha256', SESSION_SECRET).update(expires).digest('hex')
}

function authenticated(req) {
  const value = req.headers.cookie?.split('; ').find(part => part.startsWith(cookie + '='))?.slice(cookie.length + 1)
  const [expires, mac] = value?.split('.') ?? []
  return Boolean(mac && /^\d+$/.test(expires) && Number(expires) > Date.now() && equal(mac, signature(expires)))
}

function setSession(res, age) {
  const expires = String(Date.now() + age * 1000)
  const value = age ? expires + '.' + signature(expires) : ''
  res.setHeader('Set-Cookie', cookie + '=' + value + '; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=' + age + secureCookie)
}

function send(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

function redirect(res, location) {
  res.writeHead(303, { Location: location })
  res.end()
}

function message(res, status, title, detail) {
  send(res, status, page(title, '<h1>' + title + '</h1><p>' + detail + '</p><a href="/">Kembali ke katalog</a>'))
}

function httpUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch {
    return false
  }
}

async function form(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') return null
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 32_768) {
      req.resume()
      return null
    }
    chunks.push(chunk)
  }
  return new URLSearchParams(Buffer.concat(chunks).toString())
}

async function products() {
  return db ? (await db.query('SELECT * FROM products ORDER BY number')).rows : []
}

async function catalogPage(value, search) {
  const pageSize = 12
  const requested = /^[1-9]\d*$/.test(value ?? '') ? Number(value) : 1
  if (!db) return { rows: [], current: 1, pages: 1 }
  const filter = search ? `WHERE NOT hidden AND (number::text = ltrim($1, '0')
    OR strpos(lower(title), lower($1)) > 0
    OR strpos(lower(coalesce(description, '')), lower($1)) > 0)` : 'WHERE NOT hidden'
  const params = search ? [search] : []
  const { rows: [{ total }] } = await db.query(`SELECT count(*)::int AS total FROM products ${filter}`, params)
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(requested, pages)
  const { rows } = await db.query(
    `SELECT * FROM products ${filter} ORDER BY number LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (current - 1) * pageSize]
  )
  return { rows, current, pages }
}

async function handle(req, res) {
  const { pathname, searchParams } = new URL(req.url, origin)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // Keep Origin on same-origin form submissions without sending referrers to other sites.
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; img-src http: https:; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
  if (req.method === 'GET' && pathname === '/style.css') {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' })
    return res.end(css)
  }
  if (req.method === 'GET' && pathname === '/healthz') {
    if (db) await db.query('SELECT 1 FROM products LIMIT 1')
    return res.writeHead(204).end()
  }
  if (req.method === 'GET' && pathname === '/') {
    const search = (searchParams.get('q') ?? '').replaceAll('\0', '').trim().slice(0, 160)
    const { rows, current, pages } = await catalogPage(searchParams.get('page'), search)
    return send(res, 200, catalog(rows, current, pages, search))
  }
  if (pathname !== '/admin' && !pathname.startsWith('/admin/')) return message(res, 404, 'Halaman tidak ditemukan', 'Periksa kembali alamat yang kamu buka.')
  res.setHeader('Cache-Control', 'no-store')
  if (!adminEnabled) return message(res, 503, 'Admin belum aktif', 'Isi pengaturan database dan kredensial admin terlebih dahulu.')
  if (req.method === 'POST' && req.headers.origin !== origin) return message(res, 403, 'Permintaan ditolak', 'Buka admin dari alamat yang dikonfigurasi.')
  if (req.method === 'POST' && pathname === '/admin/login') {
    const now = Date.now()
    for (const [key, entry] of failures) {
      if (entry.until <= now) failures.delete(key)
    }
    // Caddy replaces X-Forwarded-For. The app port is reachable only on loopback or the proxy network.
    const client = req.headers['x-forwarded-for']?.split(',').at(-1).trim() || req.socket.remoteAddress
    const fields = await form(req)
    const entry = failures.get(client) ?? { count: 0, until: now + 10 * 60 * 1000 }
    if (entry.count >= 8) return send(res, 429, signIn('Terlalu banyak percobaan. Coba lagi dalam beberapa menit.'))
    if (!fields || !equal(fields.get('password') || '', ADMIN_PASSWORD)) {
      entry.count++
      if (failures.size < 5000 || failures.has(client)) failures.set(client, entry)
      return send(res, 401, signIn('Kata sandi salah.'))
    }
    failures.delete(client)
    setSession(res, sessionAge)
    return redirect(res, '/admin')
  }
  if (!authenticated(req)) return req.method === 'GET' ? send(res, 200, signIn()) : redirect(res, '/admin')
  if (req.method === 'GET' && pathname === '/admin/form.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' })
    return res.end(adminScript)
  }
  if (req.method === 'POST' && pathname === '/admin/preview') {
    const fields = await form(req)
    const url = fields?.get('url')?.trim() ?? ''
    const preview = url.length <= 4096 && httpUrl(url) ? await findProductPreview(url) : null
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    return res.end(JSON.stringify(preview))
  }
  if (req.method === 'GET' && pathname === '/admin') {
    const notice = searchParams.get('preview') === 'missing'
      ? 'Produk tersimpan. Gambar otomatis tidak ditemukan. Kamu bisa menambahkan URL gambar lewat Edit.'
      : undefined
    return send(res, 200, panel(await products(), undefined, undefined, notice))
  }
  if (req.method === 'POST' && pathname === '/admin/logout') {
    setSession(res, 0)
    return redirect(res, '/admin')
  }
  const productRoute = pathname.match(/^\/admin\/products\/(\d+)(?:\/(hide|show))?$/)
  if (req.method === 'GET' && productRoute && !productRoute[2]) {
    const rows = await products()
    const selected = rows.find(product => product.id === productRoute[1])
    return selected ? send(res, 200, panel(rows, selected)) : message(res, 404, 'Produk tidak ditemukan', 'Periksa kembali alamat produk.')
  }
  if (req.method !== 'POST' || (!productRoute && pathname !== '/admin/products')) return message(res, 404, 'Halaman tidak ditemukan', 'Periksa kembali alamat yang kamu buka.')
  const id = productRoute?.[1]
  if (productRoute?.[2]) {
    const result = await db.query('UPDATE products SET hidden=$1 WHERE id::text=$2', [productRoute[2] === 'hide', id])
    if (!result.rowCount) return message(res, 404, 'Produk tidak ditemukan', 'Periksa kembali alamat produk.')
    return redirect(res, '/admin')
  }
  const fields = await form(req)
  if (!fields) return message(res, 400, 'Form tidak dapat dibaca', 'Kembali ke admin dan coba lagi.')
  const rows = id ? await products() : null
  const existing = rows?.find(product => product.id === id)
  if (id && !existing) return message(res, 404, 'Produk tidak ditemukan', 'Periksa kembali alamat produk.')
  const product = { ...existing, ...Object.fromEntries(['title', 'url', 'image_url', 'description'].map(key => [key, (fields.get(key) || '').trim()])) }
  const { title, url, image_url: image, description } = product
  let error
  if (title.length > 160 || description.length > 500 ||
      url.length > 4096 || image.length > 4096 || !httpUrl(url) || (image && !httpUrl(image))) {
    error = 'Isi URL HTTP atau HTTPS yang valid. Periksa panjang judul dan deskripsi.'
  } else {
    try {
      const preview = !image || !title || !description ? await findProductPreview(url) : null
      const productTitle = title || preview?.title
      const imageUrl = image || preview?.image || null
      const productDescription = description || preview?.description || null
      if (!productTitle) return send(res, 422, panel(rows ?? await products(), product, 'Judul otomatis tidak ditemukan. Isi judul produk lalu simpan lagi.'))
      const values = [productTitle, url, imageUrl, productDescription]
      const result = id
        ? await db.query('UPDATE products SET title=$1, url=$2, image_url=$3, description=$4 WHERE id::text=$5', [...values, id])
        : await db.query('INSERT INTO products (title, url, image_url, description) VALUES ($1, $2, $3, $4)', values)
      if (!result.rowCount) return message(res, 404, 'Produk tidak ditemukan', 'Periksa kembali alamat produk.')
      return redirect(res, imageUrl ? '/admin' : '/admin?preview=missing')
    } catch (err) {
      if (err.code !== '2200H') throw err
      error = 'Batas nomor produk sudah tercapai.'
    }
  }
  return send(res, 422, panel(rows ?? await products(), product, error))
}

createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error('Permintaan gagal:', err.code || err.name)
    if (!res.headersSent) message(res, 503, 'Situs sementara tidak tersedia', 'Silakan coba lagi dalam beberapa saat.')
    else res.end()
  })
}).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Krespace siap menerima koneksi.'))
