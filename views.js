const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => entities[char])
const number = value => String(value).padStart(2, '0')

export function page(title, content) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · KresPace</title><link rel="stylesheet" href="/style.css"></head>
<body><main><header class="masthead"><a href="/" class="brand"><span aria-hidden="true">KP</span> KresPace</a></header>
${content}</main></body></html>`
}

export function catalog(products, current = 1, pages = 1, search = '') {
  const rows = products.map(product => {
    const url = new URL(product.url)
    const image = product.image_url
      ? `<img src="${escape(product.image_url)}" alt="" loading="lazy" width="70" height="70">`
      : ''
    return `<li><a class="product" href="${escape(url.href)}" rel="sponsored noopener noreferrer" target="_blank">
<span class="number" aria-label="Produk nomor ${product.number}">${number(product.number)}</span>
<span class="thumb" aria-hidden="true">${image}</span>
<span class="product-info"><strong>${escape(product.title)}</strong><small>${escape(url.hostname)}</small></span>
<span class="arrow" aria-hidden="true"></span></a></li>`
  }).join('')
  function pageUrl(index) {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (index > 1) params.set('page', index)
    return params.size ? '/?' + escape(params.toString()) : '/'
  }
  const pagination = pages > 1 ? `<nav class="pagination" aria-label="Halaman produk">
${current > 1 ? `<a rel="prev" href="${pageUrl(current - 1)}">Sebelumnya</a>` : ''}
<span>Halaman ${current} dari ${pages}</span>
${current < pages ? `<a rel="next" href="${pageUrl(current + 1)}">Berikutnya</a>` : ''}
</nav>` : ''
  return page('Pilihan produk', `<div class="intro"><h1>Pilihan <span>produk</span></h1></div>
<form class="catalog-search" method="get" action="/" role="search">
<input type="search" name="q" aria-label="Cari nomor, judul, atau deskripsi" placeholder="Cari no. atau produk" value="${escape(search)}" maxlength="160">
<button>Cari</button>
${search ? '<a href="/" aria-label="Hapus pencarian">Reset</a>' : ''}
</form>
${rows ? `<ul class="products" aria-label="Daftar produk">${rows}</ul>` : `<p class="empty">${search ? 'Produk tidak ditemukan.' : 'Belum ada produk di katalog.'}</p>`}
${pagination}`)
}

export function signIn(error) {
  return page('Masuk admin', `<h1 class="admin-title">Masuk admin</h1>
${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}
<form class="editor" method="post" action="/admin/login">
<label>Kata sandi<input type="password" name="password" autocomplete="current-password" required></label>
<button>Masuk</button></form>`)
}

export function panel(products, selected = {}, error, notice) {
  const editing = Boolean(selected.id)
  const fields = [
    ['number', 'Nomor produk', 'number', 'min="1" max="999999" required'],
    ['title', 'Judul produk', 'text', 'maxlength="160"'],
    ['url', 'Tautan affiliate', 'url', 'maxlength="4096" required'],
    ['image_url', 'URL gambar preview (opsional)', 'url', 'maxlength="4096"'],
    ['description', 'Deskripsi preview (opsional)', 'text', 'maxlength="500"']
  ].map(([key, label, type, attrs]) =>
    `<label>${label}<input name="${key}" type="${type}" value="${escape(selected[key])}" ${attrs}></label>`).join('')
  const rows = products.map(product =>
    `<li><span><strong>${number(product.number)}</strong> · ${escape(product.title)}</span><a href="/admin/products/${product.id}">Edit</a></li>`).join('')
  return page('Kelola produk', `<div class="admin-heading"><h1 class="admin-title">Kelola produk</h1>
<form method="post" action="/admin/logout"><button class="secondary">Keluar</button></form></div>
${notice ? `<p role="status">${escape(notice)}</p>` : ''}
<section><h2>${editing ? 'Edit produk' : 'Tambah produk'}</h2>
${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}
<form class="editor" method="post" action="/admin/products${editing ? '/' + escape(selected.id) : ''}">
${fields}<small>Untuk tautan Shopee, kolom judul, gambar, dan deskripsi yang kosong akan dicoba diisi otomatis saat disimpan.</small>
<div class="actions"><button>Simpan</button>${editing ? '<a href="/admin">Batal</a>' : ''}</div></form>
${editing ? `<details><summary>Hapus produk</summary><form method="post" action="/admin/products/${escape(selected.id)}/delete">
<p>Produk ini akan dihapus dari katalog.</p><button class="danger">Ya, hapus produk</button></form></details>` : ''}</section>
<section><h2>Daftar produk</h2>${rows ? `<ul class="admin-list">${rows}</ul>` : '<p>Belum ada produk.</p>'}</section>`)
}
