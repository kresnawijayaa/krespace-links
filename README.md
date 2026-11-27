# Krespace · Katalog affiliate

Katalog publik di `/` dan panel pengelolaan di `/admin`. Nomor diberikan otomatis saat menyimpan produk baru dan ditampilkan dengan minimal dua digit. Sembunyikan produk untuk mengeluarkannya dari katalog dan hasil pencarian. Tampilkan kembali dari panel admin dengan nomor yang sama.

Tempel tautan HTTPS Shopee Indonesia untuk mengisi judul, gambar, dan deskripsi yang masih kosong. Semua kolom preview bisa diedit. Jika judul otomatis tidak tersedia, isi judul sebelum menyimpan. Gunakan URL gambar HTTPS saat situs berjalan dengan HTTPS.

## Siapkan Neon

1. Salin `schema.sql` ke SQL Editor Neon dan jalankan pada database yang akan dipakai.
2. Salin connection string PostgreSQL dari Neon ke `DATABASE_URL`. Pertahankan parameter TLS yang disediakan Neon.
3. Pada VPS, dari folder project, jalankan:

   ```bash
   umask 077
   cp -n .env.example .env
   openssl rand -hex 32
   nano .env
   ```

   Isi `ADMIN_PASSWORD` dengan kata sandi unik minimal 8 karakter. Isi `SESSION_SECRET` dengan hasil `openssl`. Biarkan `PUBLIC_URL=https://link.krespace.my.id`. Simpan `.env` hanya di mesin yang menjalankan aplikasi.

## Deploy ke VPS

Buat record DNS untuk `link.krespace.my.id` yang mengarah ke VPS. Caddy berjalan di container `caddy_server`. Cek network, mount, dan argumen yang dipakai Caddy.

```bash
docker inspect --format '{{range $name, $config := .NetworkSettings.Networks}}{{println $name}}{{end}}' caddy_server
docker inspect --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}' caddy_server
docker inspect --format '{{json .Config.Cmd}}' caddy_server
```

Isi `CADDY_NETWORK` di `.env` dengan nama network Docker buatan pengguna yang terhubung ke Caddy. Jika ada beberapa network, pakai network reverse proxy yang sudah dipakai aplikasi lain. Compose menghubungkan layanan ke network tersebut dengan alias `krespace-links-app`.

```bash
docker compose -p krespace-links up -d --build
```
Tambahkan blok berikut ke Caddyfile yang dipasang ke container.

```caddyfile
link.krespace.my.id {
    reverse_proxy krespace-links-app:3000
}
```

Sesuaikan path apabila konfigurasi aktif di container memakai lokasi lain.

```bash
docker exec caddy_server caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec caddy_server caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
curl -fsS -o /dev/null -w '%{http_code}\n' https://link.krespace.my.id/healthz
```

Buka `https://link.krespace.my.id/admin` untuk menambahkan produk pertama. Jika health check gagal, lihat log aplikasi dengan `docker compose -p krespace-links logs --tail=80 affiliate`.

## Update di VPS

Setelah perubahan dipush ke branch main di GitHub, jalankan dari repo di VPS.

~~~bash
cd ~/apps/krespace-links
bash update-vps.sh
~~~

Saat pertama kali memasang skrip, jalankan git pull --ff-only origin main terlebih dahulu. Skrip menarik main, membangun ulang layanan affiliate, dan memeriksa health check melalui caddy_server.

## Jalankan lokal

Pakai Node.js 24 dan jalankan `npm ci` lalu `npm start`. Halaman publik bisa dibuka di `http://localhost:3000`. Untuk menguji admin, gunakan database pengembangan yang sudah menjalankan `schema.sql`, isi kredensial di `.env`, dan set `PUBLIC_URL=http://localhost:3000`.
