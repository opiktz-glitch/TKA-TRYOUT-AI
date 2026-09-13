// =====================================================
// KONTEN PANDUAN / KISI-KISI PENULISAN SOAL
// =====================================================
//
// Sumber: Dokumen kisi-kisi materi TKA (Bahasa Indonesia,
// Matematika, IPA/IPAS).
//
// Struktur per-section:
// - title      : judul bagian (mis. nama mata pelajaran)
// - paragraphs : daftar paragraf teks biasa (opsional)
// - items      : daftar poin. Setiap poin bisa berupa:
//                  - string biasa, atau
//                  - { label, text } supaya "label" tampil
//                    tebal di depan (mis. nama sub-topik).

export const PANDUAN_SOAL_JUDUL =
  "Panduan / Kisi-Kisi Penulisan Soal TKA";

export const PANDUAN_SOAL_SUMBER =
  "Rincian materi untuk mata pelajaran Bahasa Indonesia, Matematika, dan IPA/IPAS";

export const PANDUAN_SOAL_SECTIONS = [
  {
    title:
      "1. Bahasa Indonesia (Fokus pada Literasi Membaca)",
    paragraphs: [
      "Asesmen Bahasa Indonesia menitikberatkan pada keterampilan memahami, mengolah, dan mengevaluasi isi teks (fiksi maupun nonfiksi):",
    ],
    items: [
      {
        label: "Memahami Isi Teks",
        text: "Menemukan ide pokok/gagasan pendukung, informasi tersurat dan tersirat, serta unsur-unsur cerita fiksi (tokoh, latar, alur, amanat).",
      },
      {
        label: "Kosakata dan Makna Kata",
        text: "Menentukan makna kata dalam konteks bacaan, mengenali makna kiasan/ungkapan, serta memahami sinonim dan antonim.",
      },
      {
        label: "Evaluasi dan Apresiasi",
        text: "Menilai relevansi isi teks dengan kehidupan sehari-hari, menilai kesesuaian antarinformasi, serta menarik kesimpulan logis dari keseluruhan bacaan.",
      },
    ],
  },

  {
    title: "2. Matematika (Fokus pada Penalaran Kuantitatif)",
    paragraphs: [
      "Materi Matematika merujuk pada Kurikulum 2013 dan Kurikulum Merdeka yang dikelompokkan ke dalam beberapa elemen utama:",
    ],
    items: [
      {
        label: "Bilangan",
        text: "Pecahan senilai, operasi hitung pecahan dan bilangan cacah, perbandingan/skala, persen, serta KPK dan FPB.",
      },
      {
        label: "Geometri dan Pengukuran",
        text: "Sifat-sifat dan unsur bangun datar (luas, keliling, simetri), konstruksi serta volume bangun ruang (kubus, balok, gabungan ruang), serta konversi satuan panjang, berat, dan waktu.",
      },
      {
        label: "Data dan Statistika",
        text: "Membaca, menafsirkan, serta mengolah data dari bentuk tabel, piktogram, atau diagram.",
      },
      {
        label: "Aljabar Dasar",
        text: "Melanjutkan pola bilangan dan menyelesaikan kalimat matematika sederhana.",
      },
    ],
  },

  {
    title: "3. IPA / IPAS (Fokus pada Sains dan Alam Sekitar)",
    paragraphs: [
      "Materi sains menguji pemahaman konsep ilmu pengetahuan alam serta penerapannya dalam kehidupan sehari-hari:",
    ],
    items: [
      {
        label: "Makhluk Hidup dan Lingkungannya",
        text: "Sistem gerak pada manusia dan hewan, sistem pernapasan dan peredaran darah, serta perkembangbiakan makhluk hidup.",
      },
      {
        label: "Materi dan Energinya",
        text: "Perubahan wujud benda beserta sifatnya, jenis-jenis gaya (dorong, tarik, gesek, gravitasi, magnet) serta pengaruhnya terhadap gerak, dan sumber energi serta perubahannya.",
      },
      {
        label: "Bumi dan Alam",
        text: "Kenampakan alam/buatan, komponen peta, serta pemahaman ekosistem dan interaksi antar makhluk hidup.",
      },
    ],
  },
];
