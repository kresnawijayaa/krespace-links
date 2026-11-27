const form = document.querySelector('[data-product-form]')
const urlField = form.elements.url
const status = form.querySelector('[data-preview-status]')
const fields = { title: 'title', image: 'image_url', description: 'description' }
const filled = new Map()
let timer
let pending

async function loadPreview(url) {
  const request = new AbortController()
  pending = request
  status.textContent = 'Mencari preview produk…'
  try {
    const response = await fetch('/admin/preview', {
      method: 'POST',
      body: new URLSearchParams({ url }),
      signal: request.signal
    })
    if (!response.ok) throw new Error('Preview tidak tersedia')
    const preview = await response.json()
    if (request.signal.aborted) return
    for (const [key, name] of Object.entries(fields)) {
      const field = form.elements[name]
      if (field.value.trim() || !preview?.[key]) continue
      field.value = preview[key]
      filled.set(field, field.value)
    }
    status.textContent = filled.size
      ? 'Preview otomatis terisi. Kamu bisa mengeditnya sebelum menyimpan.'
      : 'Tidak ada kolom yang terisi otomatis. Kamu bisa mengisinya sendiri.'
  } catch {
    if (!request.signal.aborted) status.textContent = 'Preview tidak tersedia. Kamu bisa mengisi kolom sendiri.'
  }
}

urlField.addEventListener('input', () => {
  clearTimeout(timer)
  pending?.abort()
  for (const [field, value] of filled) {
    if (field.value === value) field.value = ''
  }
  filled.clear()
  status.textContent = 'Tempel tautan Shopee untuk mengisi preview otomatis.'
  const url = urlField.value.trim()
  if (/^https:\/\//i.test(url) && urlField.validity.valid) timer = setTimeout(() => loadPreview(url), 350)
})
