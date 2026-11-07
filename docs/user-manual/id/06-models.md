# 6. Memilih model

[← Dokumen](05-documents.md) · [Beranda panduan](README.md) · [Berikutnya: Setelan →](07-settings.md)

**Model** adalah AI yang menulis balasan. Hearth menyediakan 55 model terbuka, dari yang sangat kecil yang berjalan di ponsel sampai yang besar yang memerlukan kartu grafis bertenaga. Bab ini membantu Anda memilih yang tepat dan berpindah di antaranya.

## Versi singkatnya

* **Ragu? Pakai pemilih model.** Buka **Setelan → Bantu saya memilih model** (atau **Bantu saya memilih model** di layar pembuka). Jawab dua pertanyaan, dan aplikasi memilih model yang cocok untuk perangkat Anda.
* **Balasan terlalu lambat?** Pilih model yang lebih kecil.
* **Jawaban kurang bagus?** Pilih model yang lebih besar, jika perangkat Anda sanggup.
* **Berganti model tidak pernah menghapus chat Anda.** Model baru melanjutkan percakapan.

## Model besar vs model kecil

Ukuran model diukur dalam **parameter**, ditulis seperti *0.8B* atau *9B* (B = miliar). Lebih banyak parameter biasanya berarti model yang lebih pintar, tetapi juga unduhan yang lebih besar dan balasan yang lebih lambat.

| Ukuran | Unduhan | Memori GPU yang diperlukan | Kecepatan | Kualitas jawaban | Berjalan di |
|---|---|---|---|---|---|
| Sangat kecil (di bawah 1B) | ~0,2–0,7 GB | ~0,6–1,9 GB | Tercepat | Dasar; bisa salah soal fakta | Kebanyakan ponsel, laptop lama |
| Kecil (1–2B) | ~0,5–1,4 GB | ~0,7–2,6 GB | Cepat | Bagus untuk tugas sehari-hari | Kebanyakan laptop; ponsel dengan memori besar |
| Menengah (3–4B) | ~1,6–2,3 GB | ~2,2–5,4 GB | Sedang | Jelas lebih baik | Laptop dengan GPU yang bagus |
| Besar (7–9B) | ~3,8–4,9 GB | ~4,8–7,4 GB | Lebih lambat | Terbaik yang tersedia di sini | Komputer dengan kartu grafis tersendiri (memori video 6 GB ke atas) |

Saat berjalan, model memerlukan memori GPU lebih banyak daripada ukuran unduhannya, sampai sekitar empat kali lipat untuk model terkecil. Memorilah, bukan unduhannya, yang menentukan apakah sebuah model bisa berjalan di perangkat Anda.

## Ponsel

Ponsel memberi AI jauh lebih sedikit memori daripada komputer. Model yang terlalu besar untuk ponsel Anda tidak menampilkan pesan kesalahan: ponsel langsung menutup halaman. Saat Anda membukanya lagi, aplikasi menjelaskan apa yang terjadi, tidak memuat model itu lagi, dan menyarankan model yang lebih kecil, sehingga Anda bisa turun satu ukuran setiap kali. Menu model menandai model yang macet dengan **⚠ macet di perangkat ini**.

Seberapa jauh Anda perlu turun tergantung ponselnya. Di satu ponsel Android yang diuji, Qwen3.5 0.8B, Llama 3.2 1B, Gemma 3 1B, dan TinyLlama semuanya menutup halaman, dan hanya SmolLM2 360M (sekitar 0,6 GB) yang muat. Model sekecil itu hampir tidak bisa bercakap-cakap, jadi untuk pemakaian sungguhan, komputer jauh lebih baik.

## Pilihan yang disarankan

| Jika Anda ingin… | Coba |
|---|---|
| Pilihan paling ringan | Gemma 3 1B atau Qwen3.5 0.8B |
| Sesuatu untuk ponsel | Llama 3.2 1B atau Gemma 3 1B jika memori ponsel Anda cukup; jika tidak, SmolLM2 360M (lihat [Ponsel](#ponsel)) |
| Chat sehari-hari | Qwen3.5 2B, atau Qwen3.5 4B di perangkat yang lebih kuat |
| Bantuan pemrograman | Qwen3.5 4B atau Qwen3.5 9B |
| Bantuan menulis | Qwen3.5 4B atau Ministral 3 3B |
| Penalaran langkah demi langkah | Qwen3.5 dengan **Biarkan model penalaran berpikir dulu** diaktifkan, atau DeepSeek-R1 Distill Qwen 7B |
| Bahasa selain Inggris, termasuk bahasa Indonesia | Qwen3.5 2B atau Qwen3.5 4B |
| Mengikuti instruksi dengan cermat | Phi-4-mini |
| Model paling mampu | Qwen3.5 9B (perlu GPU yang kuat) |

## Memakai pemilih model

1. Buka pemilih dari **Setelan → Bantu saya memilih model**, atau dari layar pembuka.
2. Pilih paling sering Anda pakai untuk apa: **Chat sehari-hari**, **Pemrograman**, atau **Menulis**.
3. Pilih ukuran: **Cepat**, **Seimbang**, atau **Pintar**.
   * **Disarankan** menandai yang paling cocok untuk perangkat Anda.
   * **Sedang dipakai** menandai model yang Anda pakai sekarang.
   * **Sudah diunduh** berarti tidak perlu mengunduh lagi.
4. Ketuk **Unduh & mulai** (atau **Mulai**, jika sudah diunduh).

## Memilih model dari daftar

**Menu model** ada di bilah alat (dan juga di **Setelan → Model**). Model dikelompokkan menurut ukuran, dari yang paling ringan sampai paling berat.

Setiap entri terbaca seperti ini:

> **Qwen3.5 2B · 16-bit · 1010 MB ✓**

| Bagian | Artinya |
|---|---|
| Qwen3.5 2B | Nama dan ukuran model |
| 16-bit / 32-bit | Jenis perhitungan yang dipakai model di GPU Anda (lihat di bawah) |
| 1010 MB | Ukuran unduhan |
| ✓ | Sudah diunduh ke perangkat ini |
| ⚠ | Mungkin tidak berfungsi di perangkat ini (lihat di bawah) |

### Mengunduh model baru

Saat pertama kali Anda memilih sebuah model, dialog **Unduh model?** menampilkan ukurannya. Ketuk **Unduh & muat** untuk melanjutkan, atau **Batal** untuk tetap memakai model Anda saat ini.

Selama pengunduhan, Anda bisa mengetuk **Batal** di panel kemajuan. Aplikasi kembali ke model dan setelan yang Anda pakai sebelumnya.

> **Catatan:** Anda perlu koneksi internet untuk mengunduh model baru. Saat offline, aplikasi menjelaskan hal ini alih-alih mencoba.

### Berganti model di tengah chat

Anda bisa berganti kapan saja. Percakapan saat ini tetap di layar, dan model baru melanjutkannya dari situ. Setelan balasan yang disarankan untuk model baru diterapkan otomatis.

## Model 16-bit vs 32-bit

Banyak model tersedia dalam dua versi:

* **16-bit (q4f16)**: lebih kecil dan lebih cepat. Biasanya ini pilihan yang lebih baik.
* **32-bit (q4f32)**: sedikit lebih besar dan lebih lambat, tetapi berjalan di lebih banyak perangkat.

Sebagian chip grafis salah menghitung matematika 16-bit. Jika itu terjadi, model 16-bit membalas dengan teks kacau (misalnya *"outer outer outer…"*).

**Aplikasi memeriksanya secara otomatis.** Saat setiap model pertama kali dimuat di perangkat Anda, aplikasi menjalankan uji singkat. Jika model gagal, dialog berjudul **Model ini tidak berfungsi di GPU Anda** menawarkan versi 32-bit yang berfungsi:

* **Ganti model** — pakai model 32-bit yang disarankan (dianjurkan).
* **Tetap pakai model ini** — tetap memakai model saat ini.

Di perangkat yang tidak mendukung 16-bit dengan benar, daftar model menandai model 16-bit dengan ⚠, dan pemilih model otomatis menyarankan versi 32-bit.

## Petunjuk kecepatan

Setelah sebuah model menulis beberapa balasan, sebuah baris di atas bilah alat menunjukkan seberapa cepat model itu menulis di perangkat Anda, misalnya:

> *Qwen3.5 4B menulis sekitar 2 kata/detik di perangkat ini. Untuk balasan yang lebih cepat, coba **Qwen3.5 2B** (lebih cepat, tetapi lebih sering salah).*

Ketuk nama model yang disarankan untuk beralih ke model itu.

## Mengosongkan penyimpanan

Model yang sudah diunduh tetap tersimpan di browser Anda agar bisa langsung dimuat lain kali. Model besar bisa memakan beberapa gigabyte. Untuk menghapusnya, hapus data situs ini di setelan browser Anda.

> **Penting:** Menghapus data situs menghapus **semuanya**: model yang sudah diunduh, chat, dokumen, dan setelan. Ekspor chat Anda lebih dulu jika ingin menyimpannya (lihat [Mencadangkan dan memindahkan data Anda](08-offline-and-backup.md#mencadangkan-dan-memindahkan-data-anda)).

[← Dokumen](05-documents.md) · [Beranda panduan](README.md) · [Berikutnya: Setelan →](07-settings.md)
