// 1. Inisialisasi Nama Basis Data
const db = new Dexie('bd_kedaiyammie');

// 2. Deklarasi Skema Tabel dengan Versi Migration
db.version(1).stores({
    produk: 'id, nama, harga, status',
    keluar: 'id, tanggal, nominal',
    masuk: 'id, waktu, idproduk, total'
});

// Upgrade ke Versi 2: Tambah Index Kategori
db.version(2).stores({
    produk: 'id, nama, harga, kategori, status',
    keluar: 'id, tanggal, nominal',
    masuk: 'id, waktu, idproduk, total'
});

// Upgrade ke Versi 3: Optimasi Index Kueri untuk app_2.js
db.version(3).stores({
    produk: 'id, nama, harga, kategori, status',
    keluar: 'id, tanggal, nominal, kategori, [kategori+tanggal]',
    masuk: 'id, waktu, idproduk, total, [idproduk+waktu]'
});

// Helper UUID (Optimized dengan Native Web Crypto API jika tersedia)
function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Inisialisasi DB secara Asynchronous
async function initDatabase() {
    const startTime = Date.now();
    const MIN_SPLASH_DURATION = 2500; // Durasi minimal splash screen dalam milidetik (2.5 detik)

    try {
        await db.open();
        console.log(`Database bd_kedaiyammie (v${db.verno}) Berhasil Dihubungkan!`);
        
        const statusElem = document.getElementById('status-db');
        if (statusElem) statusElem.innerText = "DB Connected";

    } catch (error) {
        console.error("Gagal Membuka Database:", error);
        const statusElem = document.getElementById('status-db');
        if (statusElem) statusElem.innerText = "DB Error";
    } finally {
        // Hitung sisa waktu agar splash screen tampil konsisten minimal 2.5 detik
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, MIN_SPLASH_DURATION - elapsedTime);

        setTimeout(() => {
            const splashElem = document.getElementById('splash-screen');
            if (splashElem) {
                splashElem.classList.add('hidden');
                
                // Hapus elemen dari DOM setelah animasi fade-out selesai (0.8 detik)
                setTimeout(() => {
                    splashElem.style.display = 'none';
                }, 800);
            }
        }, remainingTime);
    }
}



// Jalankan Inisialisasi
initDatabase();
