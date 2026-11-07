# 4. Persona

[← Mengelola chat](03-managing-chats.md) · [Beranda panduan](README.md) · [Berikutnya: Dokumen →](05-documents.md)

**Persona** menentukan *cara* asisten berbicara: nadanya, seberapa rinci, dan apa yang menjadi fokusnya. Pertanyaan yang sama bisa mendapat jawaban yang santai, jawaban satu baris, atau tulisan yang rapi, tergantung personanya.

## Enam persona

| Persona | Paling cocok untuk | Contoh permintaan |
|---|---|---|
| 💬 **Ramah** *(bawaan)* | Bantuan sehari-hari dan obrolan santai | *"Bagaimana cara yang baik untuk mulai belajar gitar?"* |
| 🎯 **Presisi** | Jawaban singkat dan faktual tanpa melantur. Lebih baik berkata "Saya tidak yakin" daripada menebak. | *"Berapa titik didih air di permukaan laut?"* |
| ✍️ **Penulis** | Membuat draf, menulis ulang, dan merapikan email, pesan, esai, dan cerita | *"Tulis ulang pesan ini agar terdengar lebih sopan: …"* |
| 💻 **Pemrogram** | Menulis, menjelaskan, dan men-debug kode | *"Kenapa perulangan Python ini tidak pernah berhenti? …"* |
| 💡 **Curah Gagasan** | Menjelajahi ide dan pilihan | *"Beri saya 10 ide nama untuk toko roti."* |
| 🛠 **Kustom** | Instruksi Anda sendiri, ditulis di Setelan | Apa pun yang Anda atur |

Setiap persona bawaan diminta untuk tetap konsisten dengan apa yang dikatakannya sebelumnya, dan untuk mengoreksi Anda dengan sopan jika Anda mengatakan sesuatu yang tidak benar, alih-alih sekadar setuju.

Setiap persona bawaan juga tahu namanya **Hearth**, jadi ia menjawab "Siapa namamu?" dengan "Hearth". Jika ditanya siapa pembuatnya, ia bisa menjelaskan bahwa Hearth adalah aplikasi sumber terbuka dan balasannya berasal dari model AI terbuka yang berjalan di perangkat Anda. Persona **Kustom** hanya memakai instruksi Anda sendiri, jadi namanya mengikuti nama yang Anda berikan, atau tanpa nama.

> **Catatan:** Instruksi persona bawaan ditulis dalam bahasa Inggris, karena model kecil paling patuh pada instruksi berbahasa Inggris. Instruksi itu meminta asisten membalas dalam bahasa yang Anda pakai, jadi jika Anda menulis dalam bahasa Indonesia, asisten membalas dalam bahasa Indonesia.

## Memilih persona untuk chat baru

Di layar pembuka chat baru, ketuk salah satu kartu persona. Setiap persona juga menawarkan beberapa **contoh pertanyaan** di bawah kartu. Ketuk salah satunya untuk langsung mengirimnya.

## Mengganti persona di tengah chat

Gunakan **menu persona** di sisi kiri bilah alat (menampilkan ikon dan nama persona saat ini).

* Persona baru berlaku mulai pesan Anda **berikutnya**.
* Percakapan sejauh ini tetap disimpan.
* Setiap chat mengingat personanya sendiri, jadi mengganti di sini tidak memengaruhi chat Anda yang lain.

## Mengatur persona bawaan untuk chat baru

1. Buka **Setelan** (⚙).
2. Buka **Persona → Bawaan untuk chat baru**.
3. Pilih sebuah persona.

Untuk melihat persis apa yang diminta dari sebuah persona, buka **Tampilkan instruksi …** di bawah menu itu.

## Membuat persona Anda sendiri (Kustom)

Persona **Kustom** mengikuti instruksi yang Anda tulis sendiri.

1. Buka **Setelan → Persona**.
2. Di bawah **🛠 Persona kustom**, ketik instruksi Anda di kotak teks.
3. Kembali ke chat dan pilih **🛠 Kustom** di menu persona.

Perubahan berlaku mulai pesan berikutnya. Tidak ada yang perlu dimuat ulang.

**Tips menulis instruksi yang baik:**

* **Singkat dan sederhana.** Model kecil di perangkat jauh lebih patuh pada beberapa kalimat yang jelas daripada daftar aturan yang panjang.
* **Sebutkan siapa dia dan apa yang harus dilakukan.** Contoh:
  > *Kamu adalah tutor yang sabar untuk anak berusia 10 tahun. Jelaskan dengan kata-kata sederhana, pakai contoh sehari-hari, dan akhiri setiap jawaban dengan satu pertanyaan untuk memeriksa pemahaman.*
* **Sebutkan apa yang harus dihindari** dalam satu kalimat jika perlu: *"Jangan memakai istilah teknis."*
* **Bahasa:** model kecil sering lebih patuh pada instruksi berbahasa Inggris. Jika instruksi berbahasa Indonesia kurang diikuti, coba tulis instruksinya dalam bahasa Inggris dan tambahkan *"Reply in Indonesian."*

Untuk memulai dari awal, ketuk **Kembalikan ke instruksi Ramah**. Ini mengisi kotak dengan instruksi persona Ramah sebagai titik awal.

## Yang tidak diubah oleh persona

Persona hanya mengubah instruksi asisten. Persona tidak mengubah model, panjang balasan, kreativitas (temperatur), atau setelan lain di [Setelan](07-settings.md).

[← Mengelola chat](03-managing-chats.md) · [Beranda panduan](README.md) · [Berikutnya: Dokumen →](05-documents.md)
