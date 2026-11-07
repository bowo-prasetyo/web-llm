# 7. Setelan

[← Memilih model](06-models.md) · [Beranda panduan](README.md) · [Berikutnya: Offline dan pencadangan →](08-offline-and-backup.md)

Buka Setelan dengan mengetuk **⚙** di pojok kanan atas kepala halaman. Ketuk **Kembali** untuk kembali ke chat Anda.

> **Perubahan disimpan otomatis.** Tidak ada tombol Simpan atau Terapkan. Sebagian besar perubahan berlaku pada pesan Anda berikutnya.

> **Tips:** Setelan bawaan sudah cocok untuk kebanyakan orang. Anda hanya perlu bab ini jika ingin menyetel cara balasan dibuat.

## Setelan sekilas

| Bagian | Isinya |
|---|---|
| [Model](#model) | Model AI yang dipakai, dan **Bantu saya memilih model** |
| [Tampilan](#tampilan) | Tema terang atau gelap |
| [Bahasa](#bahasa) | Bahasa tombol dan pesan aplikasi |
| [Balasan](#balasan) | Kreativitas, panjang balasan, ingatan, dan berpikir |
| [Persona](#persona) | Persona bawaan dan instruksi Kustom Anda |
| [Dokumen](#dokumen) | Ukuran file maksimum untuk lampiran |
| [Perangkat ini](#perangkat-ini) | Informasi tentang browser dan GPU Anda, dan **Pasang aplikasi** |
| [Ekspor / Impor](#ekspor--impor) | Mencadangkan dan memindahkan setelan dan chat |
| [Chat saat ini](#chat-saat-ini) | Menghapus chat yang sedang terbuka |

## Model

* **Menu model**: pilih dari 55 model. Nama teknis lengkap model ditampilkan di bawah menu.
* **Bantu saya memilih model**: membuka pemilih model dengan dua pertanyaan.

Memilih model lain juga menerapkan setelan balasan yang disarankan untuk model itu. Lihat [Memilih model](06-models.md) untuk bantuan.

## Tampilan

* **Sistem** (bawaan) mengikuti setelan terang atau gelap perangkat Anda, dan ikut berubah saat perangkat berubah.
* **Terang** atau **Gelap** selalu memakai tema itu, apa pun setelan perangkat.

## Bahasa

Bahasa aplikasi itu sendiri: tombol, menu, dan pesannya. Hearth tersedia dalam bahasa Inggris, bahasa Indonesia, dan bahasa Jepang (日本語).

* **Otomatis** (bawaan) memakai bahasa browser Anda jika Hearth memilikinya, dan bahasa Inggris jika tidak. Bahasa yang dipilih ditampilkan dalam tanda kurung.
* Atau pilih bahasa dari daftar. Setiap bahasa ditulis dalam bahasanya sendiri, jadi Anda bisa menemukan bahasa Anda. Bahasa Indonesia tercantum sebagai **Indonesia**.

Perubahan langsung berlaku dan diingat di perangkat ini. Bahasa ini tidak mengubah balasan AI: AI menjawab dalam bahasa yang Anda pakai saat menulis.

Bahasa Anda belum ada? **Bantu terjemahkan Hearth** menautkan ke panduan untuk menambahkannya.

## Balasan

### Temperatur

**Seberapa kreatif atau mudah ditebak balasannya.** Rentang 0,0–2,0.

| Setelan | Efek | Cocok untuk |
|---|---|---|
| Rendah (0,0–0,4) | Fokus, konsisten, mudah ditebak | Fakta, kode, instruksi langkah demi langkah |
| Sedang (0,5–0,9) | Seimbang | Chat sehari-hari |
| Tinggi (1,0 ke atas) | Beragam dan mengejutkan, tetapi bisa bertele-tele atau mengarang | Curah gagasan, penulisan kreatif |

### Token Maksimum

**Panjang maksimum satu balasan.** Rentang 16–2048 *token*. Token adalah potongan kata; 100 token kira-kira 75 kata bahasa Inggris (untuk bahasa Indonesia biasanya lebih sedikit kata). Aplikasi menampilkan perkiraan jumlah kata di samping penggeser.

* Terlalu rendah: balasan terpotong. Anda akan melihat tombol **Lanjutkan** untuk mendapat sisanya.
* Lebih tinggi: memungkinkan balasan yang lebih panjang, tetapi balasan panjang lebih lama ditulis.

Nilai bawaannya tergantung ukuran model (dari 256 untuk model terkecil sampai 1024 untuk 3B ke atas). Nilainya tidak bisa lebih dari separuh Jendela Konteks.

### Jendela Konteks

**Seberapa banyak percakapan yang bisa "diingat" model sekaligus.** Rentang 512–8192 token.

* Lebih besar: model mengingat lebih banyak dari chat yang panjang dan bisa membaca lebih banyak dari dokumen terlampir, tetapi memakai lebih banyak memori GPU.
* Lebih kecil: memakai lebih sedikit memori, tetapi model lebih cepat melupakan bagian awal chat yang panjang.

Hanya setelan ini yang membuat model perlu **dimuat ulang**. Setelah Anda mengubahnya, Anda akan melihat *"Tersimpan. Model perlu dimuat ulang untuk memakainya…"* Ketuk **Muat ulang model sekarang** untuk langsung menerapkannya (memakan beberapa detik), atau setelan ini berlaku saat Anda membuka aplikasi berikutnya.

### Biarkan model penalaran berpikir dulu

**Nonaktif** secara bawaan. Jika **Aktif**, model Qwen3 dan Qwen3.5 bernalar langkah demi langkah sebelum menjawab. Ini bisa membantu untuk pertanyaan sulit (matematika, logika, perencanaan), tetapi lebih lambat dan menghabiskan sebagian panjang balasan. Penalarannya muncul di bawah judul **Proses berpikir** yang bisa dilipat. Model DeepSeek-R1 selalu bernalar, apa pun setelan ini.

### Sampling lanjutan

Terlipat secara bawaan. *Kebanyakan orang tidak pernah memerlukannya.* Ketuk **Sampling lanjutan** untuk membukanya.

| Setelan | Rentang | Dengan bahasa sederhana |
|---|---|---|
| **Top P** | 0,01–1,0 | Nilai lebih rendah membuat model bertahan pada pilihan kata yang paling mungkin. |
| **Penalti Frekuensi** | −2 sampai 2 | Nilai lebih tinggi mencegah pengulangan kata yang sama. |
| **Penalti Kehadiran** | −2 sampai 2 | Nilai lebih tinggi mendorong model membahas topik baru. |
| **Penalti Pengulangan** | 1,0–2,0 | Nilai lebih tinggi mencegah pengulangan teks sebelumnya. Naikkan sedikit jika balasan mulai berulang. |

### Kembalikan ke setelan yang disarankan untuk model ini

Mengembalikan Temperatur, Token Maksimum, Jendela Konteks, dan setelan lanjutan ke nilai yang disarankan untuk model saat ini. Anda akan diminta mengonfirmasi. Persona dan instruksi Kustom Anda **tidak** terpengaruh.

## Persona

* **Bawaan untuk chat baru**: persona yang dipakai chat baru.
* **Tampilkan instruksi …**: membaca instruksi di balik sebuah persona.
* **🛠 Persona kustom**: tulis instruksi Anda sendiri. **Kembalikan ke instruksi Ramah** memberi Anda titik awal.

Lihat [Persona](04-personas.md) untuk detail dan tips.

## Dokumen

* **Ukuran Unggahan Maksimum**: file terbesar yang bisa Anda lampirkan, dari 1 sampai 200 MB (bawaan 50 MB). Teks di dalamnya selalu dibatasi sekitar 200 halaman.

Lihat [Bertanya tentang dokumen Anda](05-documents.md).

## Perangkat ini

Informasi yang ditemukan aplikasi tentang browser dan chip grafis Anda. Terutama berguna saat [mengatasi masalah](09-troubleshooting.md).

| Item | Yang diberitahukannya |
|---|---|
| **Versi WebLLM** | Versi mesin AI yang dipakai aplikasi |
| **GPU** | Chip grafis Anda, atau *WebGPU tidak tersedia* |
| **Dukungan GPU 16-bit** | Apakah GPU Anda mendukung model 16-bit yang lebih cepat |
| **Chat disimpan di** | Tempat chat Anda disimpan. Peringatan di sini berarti penyimpanannya terbatas (misalnya, penjelajahan pribadi). |
| **Bisa offline** | Apakah aplikasi sudah tersimpan untuk dipakai offline |
| **Aplikasi** | Tombol **Pasang aplikasi** jika browser Anda mendukungnya, atau *Terpasang* |
| **Model 16-bit (q4f16)** | Apakah model 16-bit berfungsi dengan benar di sini |

Jika ada model yang gagal dalam pemeriksaan kualitas otomatis di perangkat Anda, model itu tercantum di bawah **Gagal dalam pemeriksaan model di sini**, beserta contoh keluarannya yang kacau.

**Lupakan hasil pemeriksaan** menghapus hasilnya agar setiap model diperiksa lagi. Ini berguna setelah browser atau driver grafis diperbarui.

## Ekspor / Impor

| Tombol | Fungsinya |
|---|---|
| **Ekspor Setelan** | Mengunduh setelan Anda sebagai file bernama `hearth-settings-YYYY-MM-DD.json`. |
| **Impor Setelan** | Memuat setelan dari file hasil ekspor. Pilihan model Anda saat ini tetap dipakai, jadi mengimpor tidak pernah memulai unduhan yang tak terduga. |
| **Ekspor Chat** | Mengunduh semua chat Anda (termasuk dokumen terlampir) sebagai `hearth-chats-YYYY-MM-DD.json`. |
| **Impor Chat** | Menambahkan chat dari file hasil ekspor ke chat yang sudah Anda miliki. Chat yang sudah ada dilewati, jadi tidak ada yang terduplikasi atau tertimpa. |

Lihat [Mencadangkan dan memindahkan data Anda](08-offline-and-backup.md#mencadangkan-dan-memindahkan-data-anda) untuk petunjuk langkah demi langkah.

> **Catatan:** Pilihan **Tampilan** dan **Bahasa** disimpan di perangkat ini saja dan tidak ikut diekspor.

## Chat saat ini

* **Hapus Percakapan**: menghapus chat yang sedang terbuka, beserta pesan dan dokumen terlampirnya. Anda akan ditanya dulu.

Di bagian paling bawah Setelan, Anda akan menemukan nama dan versi aplikasi, dengan tautan ke kode sumbernya dan ke WebLLM, mesin yang menjadi dasarnya.

> **Penting:** Menghapus chat tidak bisa dibatalkan. Ekspor chat Anda lebih dulu jika mungkin memerlukannya nanti.

[← Memilih model](06-models.md) · [Beranda panduan](README.md) · [Berikutnya: Offline dan pencadangan →](08-offline-and-backup.md)
