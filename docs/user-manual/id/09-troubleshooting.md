# 9. Pemecahan masalah

[← Offline dan pencadangan](08-offline-and-backup.md) · [Beranda panduan](README.md) · [Berikutnya: Tanya jawab dan glosarium →](10-faq-and-glossary.md)

Temukan masalah Anda di daftar di bawah, lalu ikuti langkah-langkahnya secara berurutan. Sebagian besar masalah selesai di langkah 1 atau 2.

> Nama menu browser tergantung bahasa browser Anda. Nama dalam bahasa Inggris ditulis dalam tanda kurung jika berbeda.

**Langsung ke:**
[WebGPU Tidak Tersedia](#webgpu-tidak-tersedia) ·
[Unduhan lambat atau gagal](#unduhan-lambat-atau-gagal) ·
[Balasan sangat lambat](#balasan-sangat-lambat) ·
[Balasan kacau](#balasan-kacau-atau-mengulang-kata-yang-sama) ·
[Balasan terpotong](#balasan-terpotong) ·
[Jawaban buruk atau salah](#jawaban-buruk-atau-salah) ·
[Asisten lupa pesan sebelumnya](#asisten-lupa-apa-yang-saya-katakan-sebelumnya) ·
[Masalah dokumen](#dokumen-tidak-bisa-dilampirkan-atau-jawabannya-mengabaikan-dokumen) ·
[Aplikasi macet atau membeku](#aplikasi-macet-membeku-atau-layar-menjadi-kosong) ·
[Chat saya hilang](#chat-saya-hilang) ·
[Masalah offline](#aplikasi-tidak-berfungsi-offline) ·
[Penyimpanan penuh](#penyimpanan-perangkat-saya-hampir-penuh)

---

## "WebGPU Tidak Tersedia"

**Artinya:** browser Anda tidak bisa memberi aplikasi akses ke chip grafis, yang diperlukan untuk menjalankan AI.

1. **Gunakan browser yang didukung:** Chrome 121 atau lebih baru, atau Edge, di komputer. Di perangkat Apple, perbarui ke macOS 14 / iOS 17 atau lebih baru dan gunakan Safari.
2. **Perbarui browser Anda** ke versi terbaru.
3. **Aktifkan akselerasi hardware.** Di Chrome atau Edge, buka Setelan browser, cari *akselerasi hardware* (*hardware acceleration*), aktifkan **Gunakan akselerasi grafis jika tersedia** (*Use graphics acceleration when available*), lalu mulai ulang browser.
4. **Di Chrome untuk Android:** buka `chrome://flags`, cari **WebGPU**, aktifkan, lalu mulai ulang Chrome.
5. **Perbarui driver grafis Anda** (di Windows, lewat Windows Update atau situs web pembuat GPU Anda).
6. **Periksa perangkat Anda** di [webgpureport.org](https://webgpureport.org). Jika hasilnya menyatakan WebGPU tidak didukung, coba browser atau perangkat lain.

Lalu ketuk **Coba Lagi** di layar kesalahan.

## Unduhan lambat atau gagal

1. **Periksa koneksi Anda.** Model berukuran besar (1–8 GB), jadi gunakan Wi‑Fi jika memungkinkan.
2. **Biarkan tab tetap terbuka** dan perangkat tetap menyala sampai unduhan selesai.
3. **"Ruang penyimpanan tidak cukup untuk mengunduh model ini"?** Di **jendela pribadi (penyamaran)**, browser hanya mengizinkan sedikit ruang, jauh lebih kecil dari yang diperlukan model: buka aplikasi di jendela biasa. Jika tidak, kosongkan ruang; lihat [Penyimpanan penuh](#penyimpanan-perangkat-saya-hampir-penuh). Pemilih model dan pertanyaan **Unduh model?** memperingatkan Anda lebih dulu jika sebuah model kemungkinan tidak muat, dan **Setelan → Perangkat ini → Penyimpanan** menunjukkan berapa banyak yang diizinkan browser.
4. **Coba lagi.** Pilih model itu lagi dari menu model. Jika sebelumnya Anda membatalkan, Anda akan diminta mengonfirmasi unduhan lagi; itu normal.
5. **Pilih model yang lebih kecil** jika koneksi atau penyimpanan Anda terbatas.

## Balasan sangat lambat

AI berjalan di perangkat Anda sendiri, jadi kecepatannya tergantung perangkat keras dan ukuran model.

1. **Lihat petunjuk kecepatan** di atas bilah alat. Jika aplikasi menyarankan model yang lebih kecil, ketuk namanya untuk beralih.
2. **Pilih model yang lebih kecil** (misalnya *Cepat* di pemilih model). Lihat [Memilih model](06-models.md).
3. **Matikan fitur berpikir.** Di **Setelan → Balasan**, atur **Biarkan model penalaran berpikir dulu** ke **Nonaktif**.
4. **Tutup aplikasi dan tab browser lain yang berat**, terutama game, penyunting video, atau alat AI lain yang memakai GPU.
5. **Colokkan laptop Anda ke listrik.** Saat memakai baterai, banyak laptop memperlambat chip grafis untuk menghemat daya.
6. **Balasan pertama setelah memuat model** sering lebih lambat karena model masih "pemanasan". Balasan berikutnya lebih cepat.

## Balasan kacau atau mengulang kata yang sama

Misalnya: *"outer outer outer outer…"*, atau **"Membuat balasan…" terus berjalan tetapi tidak ada yang muncul di layar** (teks sampahnya bisa berupa baris kosong atau karakter tak terlihat).

**Artinya:** chip grafis Anda salah menghitung matematika 16-bit yang lebih cepat. Ini masalah yang sudah dikenal pada sebagian GPU dan driver, bukan kerusakan perangkat Anda.

1. Jika muncul dialog berjudul **Model ini tidak berfungsi di GPU Anda** (atau **Model ini mungkin tidak berfungsi di GPU Anda**), ketuk **Ganti model**. Aplikasi memilih versi 32-bit yang berfungsi.
2. Jika tidak, buka menu model dan pilih model berlabel **32-bit**, bukan 16-bit.
3. Setelah memperbarui browser atau driver grafis, Anda bisa memberi model 16-bit kesempatan lagi: **Setelan → Perangkat ini → Lupakan hasil pemeriksaan**.
4. **Di jendela pribadi (penyamaran)**, aplikasi dimulai dengan penyimpanan kosong, jadi aplikasi tidak ingat bahwa model 16-bit gagal di perangkat ini dan mungkin memilihnya lagi; pemeriksaan setelah memuat atau pada balasan pertama akan mendeteksinya.

Aplikasi juga menghentikan balasan yang rusak menjadi kata berulang atau teks yang tak terbaca (bahkan tak terlihat), menjelaskan apa yang terjadi, dan tidak memasukkannya ke percakapan agar tidak membingungkan model nantinya.

## Balasan terpotong

| Yang Anda lihat | Yang perlu dilakukan |
|---|---|
| *Terpotong di batas Token Maksimum* | Ketuk **Lanjutkan**. Untuk mengizinkan balasan yang lebih panjang, naikkan **Token Maksimum** di [Setelan](07-settings.md#token-maksimum). |
| *Dihentikan: model berhenti menulis selama satu menit.* | Ketuk **Lanjutkan** atau **Buat ulang**. Jika sering terjadi, pakai model yang lebih kecil. |
| *Balasan mulai mengulang dirinya sendiri…* | Ketuk **Buat ulang**, atau ajukan pertanyaan dengan cara lain. Menaikkan sedikit **Penalti Pengulangan** di Sampling lanjutan juga bisa membantu. |

## Jawaban buruk atau salah

Model di perangkat jauh lebih kecil daripada layanan AI online yang besar, jadi pengetahuannya lebih sedikit dan lebih sering keliru.

1. **Coba model yang lebih besar** jika perangkat Anda sanggup (Seimbang atau Pintar di pemilih model).
2. **Pakai persona Presisi** untuk pertanyaan faktual. Persona ini diminta berkata "Saya tidak yakin" alih-alih menebak.
3. **Turunkan Temperatur** (misalnya ke 0,3) agar jawabannya lebih fokus.
4. **Beri detail lebih banyak** dalam pertanyaan Anda, dan sebutkan format yang Anda inginkan.
5. **Mulai chat baru** jika percakapan sudah jauh menyimpang dari topik Anda saat ini.
6. **Untuk bahasa Indonesia**, model yang lebih besar (Qwen3.5 2B ke atas) biasanya menjawab jauh lebih baik daripada model sangat kecil.
7. **Selalu periksa lagi** fakta penting dengan sumber tepercaya.

## Asisten lupa apa yang saya katakan sebelumnya

Setiap model hanya bisa "melihat" sejumlah percakapan sekaligus (*jendela konteks*-nya). Dalam chat yang panjang, pesan paling lama tidak lagi dibaca.

1. **Ingatkan** detail penting di pesan Anda berikutnya.
2. **Perbesar Jendela Konteks** di **Setelan → Balasan**, lalu ketuk **Muat ulang model sekarang**. (Nilai yang lebih besar memakai lebih banyak memori GPU.)
3. **Mulai chat baru** untuk topik baru.

## Dokumen tidak bisa dilampirkan, atau jawabannya mengabaikan dokumen

1. **Periksa jenis file:** hanya PDF, TXT, dan Markdown (`.md`) yang didukung.
2. **Periksa ukurannya:** batas bawaan adalah 50 MB. Naikkan di **Setelan → Dokumen → Ukuran Unggahan Maksimum** (sampai 200 MB).
3. **PDF hasil pindaian tidak bisa dibaca.** Jika Anda tidak bisa memilih teksnya dengan mouse, PDF itu berupa gambar. Gunakan alat PDF dengan pengenalan teks (OCR) lebih dulu, atau salin teksnya ke file `.txt`.
4. **Dokumen yang sangat panjang** (lebih dari sekitar 200 halaman) dipotong di batasnya.
5. **Dokumen besar pertama saat offline?** Aplikasi perlu mengunduh alat bantu pencarian kecil sekali saja. Sambungkan ke internet dan coba lagi.
6. **Ajukan pertanyaan yang lebih spesifik.** Untuk dokumen panjang, aplikasi mencari bagian yang cocok dengan pertanyaan Anda. Kata-kata yang memang ada di dokumen membantunya menemukan bagian yang tepat.
7. **Pastikan Anda berada di chat yang benar.** Dokumen milik chat tempat dokumen itu dilampirkan.

## Aplikasi macet, membeku, atau layar menjadi kosong

Aplikasi pulih otomatis dari sebagian besar kesalahan GPU dan mesin: jika browser mengambil alih GPU (ponsel melakukannya saat aplikasi di latar belakang), model dimuat ulang dan pertanyaan Anda dijawab.

Jika sebuah model terlalu besar untuk memori perangkat, GPU berhenti bekerja atau seluruh halaman tertutup. Aplikasi lalu menampilkan **GPU berhenti bekerja** atau, saat Anda membukanya lagi, **Halaman tertutup tiba-tiba**. Aplikasi tidak memuat model itu lagi dengan sendirinya (jadi tidak bisa terjebak macet berulang-ulang), menyimpan apa yang sudah ditulis balasan, dan menawarkan model yang lebih kecil, **Coba lagi**, atau **Pilih model lain**. Menu model menandainya **⚠ macet di perangkat ini** sampai model itu berfungsi lagi.

1. **Tunggu sebentar.** Pemulihan bisa memakan beberapa detik.
2. **Muat ulang halaman.** Chat Anda tersimpan, dan pertanyaan yang belum terjawab diajukan lagi secara otomatis.
3. **Pilih model yang lebih kecil.** Macet biasanya berarti model terlalu besar untuk memori GPU Anda. Di ponsel, turunkan satu ukuran setiap kali (lihat [Ponsel](06-models.md#ponsel)).
4. **Tutup tab dan aplikasi lain yang berat memakai GPU.**
5. Jika GPU macet dua kali dalam satu kunjungan, aplikasi berhenti dan menampilkan layar pemecahan masalah; ikuti [langkah-langkah di atas](#webgpu-tidak-tersedia).

> **Catatan:** Setelah 30 menit tidak dipakai, aplikasi melepas model untuk mengosongkan memori GPU. Pesan berikutnya memuatnya lagi dari perangkat Anda, yang memakan beberapa detik.

## Chat saya hilang

1. **Browser dan perangkat yang sama?** Chat disimpan di browser tempat Anda membuatnya. Chat tidak tersinkron antarbrowser atau antarperangkat. Gunakan [Ekspor dan Impor](08-offline-and-backup.md#mencadangkan-dan-memindahkan-data-anda) untuk memindahkannya.
2. **Jendela pribadi / penyamaran?** Chat yang dibuat di sana bisa terhapus saat Anda menutup jendela. Periksa **Setelan → Perangkat ini → Chat disimpan di**.
3. **Menghapus data penjelajahan?** Menghapus "data situs" atau "cookie dan data situs" menghapus chat Anda. Jika Anda punya file ekspor, gunakan **Impor Chat** untuk memulihkannya.
4. **Cari chat itu.** Buka daftar chat dan ketik kata yang Anda ingat di **Cari chat**.

## Aplikasi tidak berfungsi offline

1. **Buka aplikasi sekali saat online** agar aplikasi bisa menyimpan dirinya. Lalu periksa **Setelan → Perangkat ini → Bisa offline**.
2. **Pakai model yang sudah Anda unduh** (bertanda ✓). Model baru memerlukan koneksi.
3. **Jendela pribadi / penyamaran** mungkin tidak menyimpan salinan offline.

## Penyimpanan perangkat saya hampir penuh

Model yang sudah diunduh paling banyak memakan ruang (sering beberapa gigabyte masing-masing). **Setelan → Perangkat ini → Penyimpanan** menunjukkan berapa banyak yang dipakai aplikasi dan berapa banyak yang diizinkan browser. Setelah model pertama dimuat, aplikasi meminta browser untuk mempertahankan penyimpanannya, agar model tidak terhapus saat ruang hampir habis; apakah itu dikabulkan tergantung browser ("disimpan oleh browser" di baris yang sama).

1. **Ekspor chat Anda lebih dulu:** **Setelan → Ekspor Chat**.
2. Di setelan browser Anda, cari data situs untuk `bowo-prasetyo.github.io` dan hapus. Di Chrome: **Setelan → Privasi dan keamanan → Setelan situs → Lihat izin dan data yang tersimpan di seluruh situs** (*Settings → Privacy and security → Site settings → View permissions and data stored across sites*).
3. Buka aplikasi lagi, pilih **satu** model, lalu impor chat Anda.

> **Penting:** Menghapus data situs menghapus **semua** yang disimpan aplikasi: model, chat, dokumen, dan setelan.

## Masih bermasalah?

* Catat apa yang Anda lihat di **Setelan → Perangkat ini**. Informasi itu berguna saat menjelaskan masalahnya.
* Laporkan masalahnya di [halaman GitHub](https://github.com/bowo-prasetyo/web-llm/issues) proyek ini. Anda boleh menulis dalam bahasa Indonesia. Jangan sertakan isi chat pribadi dalam laporan Anda.

[← Offline dan pencadangan](08-offline-and-backup.md) · [Beranda panduan](README.md) · [Berikutnya: Tanya jawab dan glosarium →](10-faq-and-glossary.md)
