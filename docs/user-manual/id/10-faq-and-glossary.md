# 10. Tanya jawab dan glosarium

[← Pemecahan masalah](09-troubleshooting.md) · [Beranda panduan](README.md) · [Referensi cepat →](quick-reference.md)

## Pertanyaan yang sering diajukan

### Privasi dan data

**Apakah benar-benar pribadi?**
Ya. Model AI berjalan di perangkat Anda sendiri. Pesan, chat, dokumen, dan setelan Anda hanya disimpan di browser Anda dan tidak pernah dikirim ke server. Tidak ada akun dan tidak ada pelacakan atas apa yang Anda ketik.

**Lalu apa yang diunduh aplikasi?**
Hanya yang diperlukan untuk berjalan: aplikasi itu sendiri, file model AI (dari Hugging Face dan GitHub), beberapa pustaka kode, font, dan, untuk dokumen besar, alat bantu pencarian kecil. Tidak satu pun permintaan itu berisi apa yang Anda ketik.

**Bisakah orang lain melihat chat saya?**
Tidak melalui aplikasi. Tetapi siapa pun yang bisa memakai perangkat dan browser Anda bisa membuka aplikasi dan melihat chat Anda, sama seperti riwayat penjelajahan Anda. Di komputer yang dipakai bersama, gunakan profil browser Anda sendiri, atau hapus chat setelah selesai.

**Amankah melampirkan dokumen rahasia?**
Dokumen hanya dibaca dan disimpan di perangkat Anda dan tidak pernah diunggah. Ingat bahwa file chat hasil ekspor ikut berisi dokumen yang Anda lampirkan, jadi simpan file itu dengan hati-hati.

### Biaya dan akun

**Apakah berbayar?**
Tidak. Tidak ada langganan, tidak ada akun, dan tidak ada kunci API.

**Apakah saya perlu mendaftar?**
Tidak.

### Memakai aplikasi

**Apakah bisa dipakai di ponsel saya?**
Bisa berjalan, tetapi ponsel hanya punya sedikit memori untuk AI, jadi banyak ponsel hanya mampu menjalankan model Sangat kecil, yang jawabannya sangat terbatas. Ponsel dengan memori besar bisa menjalankan Llama 3.2 1B (pilih **Cepat**). Jika model terlalu besar, halaman tertutup dan aplikasi menyarankan model yang lebih kecil lain kali; lihat [Ponsel](06-models.md#ponsel). Anda perlu browser dengan WebGPU: Safari di iOS 17 atau lebih baru, atau Chrome terbaru di Android. Untuk jawaban terbaik, gunakan komputer.

**Mengapa awal pertamanya lambat sekali?**
Pertama kali, aplikasi mengunduh model AI, sering 0,4–2 GB. Setelah itu model dimuat dari perangkat Anda dalam hitungan detik.

**Bisakah dipakai tanpa internet?**
Ya, setelah aplikasi dan sebuah model diunduh. Lihat [Memakai secara offline](08-offline-and-backup.md#memakai-aplikasi-secara-offline).

**Bisakah aplikasi mencari di web atau melihat berita hari ini?**
Tidak. Model hanya tahu apa yang dipelajarinya saat pelatihan, ditambah apa yang Anda ketik atau lampirkan. Model tidak bisa menjelajahi internet dan mungkin tidak tahu peristiwa terbaru.

**Bisakah aplikasi membaca gambar atau audio?**
Tidak. Aplikasi bekerja dengan teks, dan dengan dokumen PDF, TXT, dan Markdown yang berisi teks.

**Bisakah saya memakai lebih dari satu model?**
Ya. Anda bisa mengunduh beberapa model dan beralih di antaranya kapan saja dari menu model, bahkan di tengah chat.

**Bagaimana memindahkan chat saya ke perangkat lain?**
Ekspor di **Setelan → Ekspor Chat**, salin filenya, lalu gunakan **Impor Chat** di perangkat lain. Lihat [Mencadangkan dan memindahkan data Anda](08-offline-and-backup.md#mencadangkan-dan-memindahkan-data-anda).

**Apakah sebagus asisten AI online yang besar?**
Biasanya tidak. Model yang muat di perangkat pribadi jauh lebih kecil. Model ini bagus untuk pertanyaan sehari-hari, bantuan menulis, curah gagasan, dan kode sederhana, tetapi lebih sering keliru untuk topik yang rumit atau khusus. Sebagai gantinya, Anda mendapat privasi penuh dan bisa memakainya offline.

**Mengapa pertanyaan yang sama mendapat jawaban yang berbeda?**
Model AI mengandung unsur acak. Ketuk **Buat ulang** untuk versi lain. Untuk jawaban yang lebih konsisten, turunkan **Temperatur** di Setelan.

**Apakah aplikasi ini bisa dipakai dalam bahasa Indonesia?**
Ya, dalam dua hal. Tampilan aplikasi tersedia dalam bahasa Indonesia (**Setelan → Bahasa**). Dan AI membalas dalam bahasa yang Anda pakai saat menulis. Untuk bahasa Indonesia, model Qwen3.5 (2B ke atas) adalah pilihan yang baik; model yang sangat kecil sering menjawab dengan bahasa Indonesia yang kurang lancar.

---

## Glosarium

| Istilah | Artinya |
|---|---|
| **Model AI** (atau **model**) | "Otak" yang menulis balasan. Model berbeda-beda dalam ukuran, kecepatan, dan kualitas. |
| **Lampiran** (*attachment*) | Dokumen (PDF, TXT, Markdown) yang ditambahkan ke chat agar Anda bisa bertanya tentang isinya. |
| **Chat** (atau **sesi**) | Satu percakapan. Setiap chat disimpan terpisah di daftar chat. |
| **Jendela konteks** (*context window*) | Seberapa banyak teks yang bisa "dilihat" model sekaligus: percakapan Anda, ditambah potongan dokumen. Pesan lama di luar batas ini tidak lagi dibaca. |
| **Ekspor / Impor** | Menyimpan chat atau setelan Anda ke file, dan memuatnya kembali, untuk cadangan atau pindah ke perangkat lain. |
| **GPU** | *Graphics processing unit*, chip di perangkat Anda yang menggambar grafis. Aplikasi memakainya untuk menjalankan AI dengan cepat. |
| **Token Maksimum** (*Max Tokens*) | Panjang maksimum satu balasan. |
| **Parameter** (mis. **2B**, **9B**) | Ukuran sebuah model. "2B" berarti 2 miliar parameter. Lebih besar biasanya lebih pintar tetapi lebih lambat. |
| **Persona** | Gaya asisten: Ramah, Presisi, Penulis, Pemrogram, Curah Gagasan, atau instruksi Kustom Anda sendiri. |
| **PWA / Pasang aplikasi** | Memasang aplikasi web agar terbuka di jendelanya sendiri dengan ikon, seperti aplikasi biasa. |
| **q4f16 / q4f32** (16-bit / 32-bit) | Dua versi dari model yang sama. 16-bit lebih kecil dan lebih cepat; 32-bit berjalan di lebih banyak GPU. |
| **Buat ulang** (*Regenerate*) | Meminta AI menulis ulang balasan terakhir. |
| **Contoh pertanyaan** (*starter prompt*) | Pesan pertama yang disarankan di layar pembuka. Ketuk salah satunya untuk mengirimnya. |
| **Temperatur** (*Temperature*) | Seberapa kreatif (tinggi) atau mudah ditebak (rendah) balasannya. |
| **Berpikir / Proses berpikir** | Penalaran langkah demi langkah yang ditulis sebagian model sebelum jawabannya. Ditampilkan terlipat agar bisa Anda baca jika mau. |
| **Token** | Potongan kata yang dibaca dan ditulis model. Sekitar 100 token ≈ 75 kata bahasa Inggris (untuk bahasa Indonesia biasanya lebih sedikit kata). |
| **WebGPU** | Fitur browser yang memungkinkan halaman web memakai GPU Anda. Diperlukan oleh aplikasi ini. |
| **WebLLM** | Mesin sumber terbuka yang menjalankan model AI di dalam browser web. Hearth dibangun di atasnya. |

[← Pemecahan masalah](09-troubleshooting.md) · [Beranda panduan](README.md) · [Referensi cepat →](quick-reference.md)
