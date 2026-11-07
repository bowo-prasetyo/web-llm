# 2. Mengobrol dengan asisten

[← Memulai](01-getting-started.md) · [Beranda panduan](README.md) · [Berikutnya: Mengelola chat →](03-managing-chats.md)

Bab ini membahas kontrol yang akan Anda pakai setiap hari.

## Mengirim pesan

1. Klik atau ketuk kotak pesan di bagian bawah layar (bertuliskan *Tanyakan sesuatu…*).
2. Ketik pertanyaan atau permintaan Anda.
3. Kirim:
   * **Di komputer:** tekan **Enter**.
   * **Di ponsel atau tablet:** ketuk tombol **Kirim** (ikon pesawat kertas).
   * **Di mana saja:** **Ctrl+Enter** (Windows, Linux) atau **Cmd+Enter** (Mac) juga mengirim.

### Membuat baris baru alih-alih mengirim

* **Di komputer:** tekan **Shift+Enter**.
* **Di ponsel atau tablet:** tekan **Enter** di keyboard layar. (Di layar sentuh, Enter menambah baris baru, dan hanya tombol Kirim yang mengirim.)

Kotak pesan membesar saat Anda mengetik, sehingga seluruh pesan Anda terlihat.

> **Catatan:** Jika Anda mengetik dalam bahasa Tionghoa, Jepang, Korea, atau bahasa lain yang memakai metode input, menekan Enter untuk mengonfirmasi karakter tidak akan mengirim pesan secara tidak sengaja.

## Melihat balasan muncul

Balasan muncul kata demi kata saat AI menulisnya. Selama AI menulis:

* Tombol **Kirim** berubah menjadi tombol **Hentikan** merah yang berdenyut.
* Anda bisa **menggulir ke atas** untuk membaca ulang pesan sebelumnya. Layar tetap di posisi yang Anda pilih.
* Muncul tombol **Ikuti balasan**. Ketuk untuk kembali ke bawah dan mengikuti teks baru. (Saat tidak ada yang sedang ditulis, tombol yang sama bertuliskan **Ke pesan terbaru**.)

> **Seberapa cepat?** Setelah beberapa balasan, sebuah baris di atas bilah alat menunjukkan seberapa cepat model saat ini menulis di perangkat Anda, misalnya *"Qwen3.5 2B menulis sekitar 6 kata/detik di perangkat ini."* Jika lambat, aplikasi menyarankan model yang lebih kecil yang bisa Anda pilih dengan sekali ketuk. Lihat [Memilih model](06-models.md).

## Menghentikan balasan

Ketuk tombol **Hentikan** merah kapan saja. Bagian yang sudah ditulis tetap ada dan disimpan.

Berguna saat jawaban mengarah ke tempat yang salah atau lebih panjang dari yang Anda perlukan.

## Alat untuk balasan

Di bawah setiap balasan yang sudah selesai, Anda akan menemukan:

| Tombol | Fungsinya |
|---|---|
| **Salin** | Menyalin seluruh balasan ke papan klip. Tombol sebentar menampilkan **Disalin**. |
| **Buat ulang** | *(Hanya balasan terakhir)* Meminta AI menjawab pesan terakhir Anda lagi. Biasanya Anda mendapat jawaban yang berbeda. |
| **Coba lagi** | *(Muncul menggantikan Buat ulang setelah terjadi kesalahan)* Mencoba permintaan terakhir sekali lagi. |
| **Lanjutkan** | *(Hanya saat balasan terpotong)* Melanjutkan dari tempat balasan berhenti. |

### Mengapa balasan saya terpotong?

Kadang balasan diakhiri dengan catatan. Inilah arti masing-masing:

| Catatan | Artinya | Yang bisa dilakukan |
|---|---|---|
| *Terpotong di batas Token Maksimum (…)* | Balasan mencapai panjang maksimum yang diatur di Setelan. | Ketuk **Lanjutkan** untuk sisanya, atau naikkan **Token Maksimum** di [Setelan](07-settings.md#token-maksimum). |
| *Dihentikan: model berhenti menulis selama satu menit.* | Model macet dan tidak lagi membuat kemajuan. | Ketuk **Lanjutkan** atau **Buat ulang**. Jika terus terjadi, coba model yang lebih kecil. |
| *Terpotong di batas 20 menit untuk satu balasan.* | Batas pengaman untuk balasan yang sangat panjang. | Ketuk **Lanjutkan**. |
| *Balasan mulai mengulang dirinya sendiri, jadi dihentikan di situ.* | Model mulai mengulang kalimat yang sama. Pengulangannya sudah dihapus. | Ajukan pertanyaan lanjutan, atau **Buat ulang**. |

## Format balasan

Balasan diformat agar mudah dibaca: judul, daftar berpoin, langkah bernomor, tabel, dan tautan. Tautan terbuka di tab baru.

**Kode** muncul di kotak berlatar abu-abu yang menunjukkan bahasa pemrogramannya dan punya tombol **Salin** sendiri, sehingga Anda bisa menyalin kodenya saja. Warna (penyorotan sintaksis) ditambahkan setelah balasan selesai.

Pesan Anda sendiri selalu ditampilkan persis seperti yang Anda ketik.

## Model yang "berpikir"

Beberapa model (Qwen3, Qwen3.5, dan DeepSeek-R1) bisa bernalar langkah demi langkah sebelum menjawab.

* Saat model sedang berpikir, Anda akan melihat **Berpikir…** beserta catatan kerjanya.
* Setelah selesai, catatan itu terlipat di bawah **Proses berpikir**. Ketuk untuk membacanya.
* Catatan itu tidak ikut tersalin saat Anda menyalin balasan.

Untuk Qwen3 dan Qwen3.5, berpikir **nonaktif** secara bawaan karena lebih lambat dan menghabiskan panjang balasan. Aktifkan di **Setelan → Balasan → Biarkan model penalaran berpikir dulu** jika Anda menginginkannya untuk pertanyaan sulit. DeepSeek-R1 selalu berpikir.

## Apakah asisten ingat percakapannya?

Ya, di dalam satu chat. Setiap chat mengingat apa yang Anda katakan sebelumnya, jadi Anda bisa mengajukan pertanyaan lanjutan seperti *"Buat lebih singkat"* atau *"Sekarang jelaskan poin kedua."*

Chat yang berbeda tidak berbagi ingatan. Chat yang sangat panjang lama-lama melebihi apa yang bisa "dilihat" model sekaligus (*jendela konteks*-nya). Jika itu terjadi, pesan paling lama diam-diam tidak lagi dibaca model. Pesan itu tetap ada di layar Anda. Untuk memberi model ingatan yang lebih besar, lihat [Jendela Konteks](07-settings.md#jendela-konteks).

## Tips agar jawaban lebih baik

* **Jelaskan secara spesifik.** *"Tulis email terima kasih tiga kalimat kepada pemilik kontrakan karena sudah memperbaiki pemanas air"* lebih baik daripada *"Tulis email."*
* **Sebutkan format yang Anda inginkan.** *"Jawab dalam bentuk tabel"*, *"Beri saya 5 poin"*, *"Kurang dari 100 kata."*
* **Gunakan pertanyaan lanjutan.** Jika jawabannya belum pas, katakan apa yang perlu diubah alih-alih memulai dari awal.
* **Pilih persona yang tepat.** **Presisi** untuk fakta singkat, **Penulis** untuk teks, **Pemrogram** untuk kode. Lihat [Persona](04-personas.md).
* **Periksa fakta penting.** Model kecil di perangkat tahu lebih sedikit daripada layanan online besar dan bisa salah dengan penuh keyakinan.
* **Bahasa apa saja.** AI membalas dalam bahasa yang Anda pakai. Model kecil biasanya paling kuat dalam bahasa Inggris; jika jawaban dalam bahasa Indonesia kurang bagus, coba model yang lebih besar.

[← Memulai](01-getting-started.md) · [Beranda panduan](README.md) · [Berikutnya: Mengelola chat →](03-managing-chats.md)
