// Variable Global State
let keranjang = [];
let searchTimeout = null;
let searchTrxTimeout = null;
let tempPengeluaranData = null;
let filterRekapAktif = 'hari_ini';

// Helper Utility
function generateUUID() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID) 
        ? crypto.randomUUID() 
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
}

function formatRupiah(angka) {
    return 'Rp ' + Number(angka || 0).toLocaleString('id-ID');
}

// 1. ROUTER & NAVIGASI HALAMAN
async function navigasi(targetMenu) {
    if (targetMenu === 'produk') {
        const pageProd = document.getElementById('page-produk');
        if (pageProd) pageProd.style.display = 'flex';
        await muatOpsiKategori();
        await muatDaftarProduk();
    } else if (targetMenu === 'transaksi') {
        bukaTransaksiPage();
    } else if (targetMenu === 'rekapitulasi') {
        bukaHalamanRekap('hari_ini');
    } else if (targetMenu === 'pengeluaran') {
        bukaHalamanPengeluaran();
    } else {
        alert("Menu " + targetMenu.toUpperCase() + " sedang disiapkan.");
    }
}

function tutupHalaman(pageId) {
    const el = document.getElementById(pageId);
    if (el) el.style.display = 'none';
    muatDashboard();
}

// 2. DASHBOARD & AKTIVITAS UTAMA
async function muatDashboard() {
    try {
        const skrg = new Date();
        const thnAktif = skrg.getFullYear();
        const blnAktif = String(skrg.getMonth() + 1).padStart(2, '0');
        const prefixBulan = `${thnAktif}-${blnAktif}`;
        const endPrefixBulan = `${prefixBulan}-\xFF`;

        const [masukBulanIni, keluarBulanIni] = await Promise.all([
            db.masuk.where('waktu').between(prefixBulan, endPrefixBulan, true, true).toArray(),
            db.keluar.where('tanggal').between(prefixBulan, endPrefixBulan, true, true).toArray()
        ]);

        const totalPemasukan = masukBulanIni.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
        const totalPengeluaran = keluarBulanIni.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0);
        const laba = totalPemasukan - totalPengeluaran;

        const elLaba = document.getElementById('dash-laba');
        const elMasuk = document.getElementById('dash-pemasukan');
        const elKeluar = document.getElementById('dash-pengeluaran');

        if (elLaba) elLaba.innerText = formatRupiah(laba);
        if (elMasuk) elMasuk.innerText = formatRupiah(totalPemasukan);
        if (elKeluar) elKeluar.innerText = formatRupiah(totalPengeluaran);

        const [terbaruMasuk, terbaruKeluar] = await Promise.all([
            db.masuk.orderBy('waktu').reverse().limit(10).toArray(),
            db.keluar.orderBy('tanggal').reverse().limit(10).toArray()
        ]);

        let gabungan = [
            ...terbaruMasuk.map(m => ({
                id: m.id,
                tipe: 'masuk',
                judul: `Penjualan ${m.jumlah}x`,
                nominal: m.total,
                waktu: m.waktu
            })),
            ...terbaruKeluar.map(k => ({
                id: k.id,
                tipe: 'keluar',
                judul: k.keterangan || 'Pengeluaran',
                nominal: k.nominal,
                waktu: k.tanggal
            }))
        ];

        gabungan.sort((a, b) => new Date(b.waktu) - new Date(a.waktu));
        const terbarus10 = gabungan.slice(0, 10);
        const containerAktivitas = document.getElementById('list-aktivitas');

        if (containerAktivitas) {
            containerAktivitas.innerHTML = '';

            if (terbarus10.length === 0) {
                containerAktivitas.innerHTML = '<p class="empty-state">Belum ada transaksi tercatat.</p>';
            } else {
                const fragment = document.createDocumentFragment();

                terbarus10.forEach(act => {
                    const isMasuk = act.tipe === 'masuk';
                    const warna = isMasuk ? '#28a745' : '#dc3545';
                    const tanda = isMasuk ? '+' : '-';

                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'aktivitas-item';
                    itemDiv.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:12px 8px; border-bottom:1px solid #f0f0f0; cursor:pointer;';
                    itemDiv.onclick = () => bukaDetailAktivitas(act.id, act.tipe);

                    itemDiv.innerHTML = `
                        <div>
                            <strong style="font-size:14px; display:block; color:#333;">${act.judul}</strong>
                            <small style="color:#888; font-size:11px;">${act.waktu}</small>
                        </div>
                        <span style="color:${warna}; font-weight:bold; font-size:14px;">${tanda} ${formatRupiah(act.nominal)}</span>
                    `;
                    fragment.appendChild(itemDiv);
                });

                const btnMore = document.createElement('button');
                btnMore.className = 'btn-secondary';
                btnMore.style.cssText = 'width:100%; margin-top:12px; padding:10px; background:#f8f9fa; border:1px solid #ddd; border-radius:8px; font-weight:bold; color:#555; cursor:pointer;';
                btnMore.innerText = 'Lihat Selengkapnya →';
                btnMore.onclick = () => bukaHalamanRekap('hari_ini');
                fragment.appendChild(btnMore);

                containerAktivitas.appendChild(fragment);
            }
        }

    } catch (error) {
        console.error("Gagal memuat dashboard:", error);
    }
}

// 3. DETAIL TRANSAKSI MODAL
async function bukaDetailAktivitas(id, tipe) {
    const modal = document.getElementById('modal-detail-trx');
    const content = document.getElementById('detail-trx-content');
    if (!modal || !content) return;

    content.innerHTML = '<p>Memuat data...</p>';
    modal.style.display = 'flex';

    try {
        if (tipe === 'masuk') {
            const data = await db.masuk.get(id);
            if (!data) return;

            let prodNama = 'Produk';
            if (data.idproduk) {
                const prod = await db.produk.get(data.idproduk);
                if (prod) prodNama = prod.nama;
            }

            content.innerHTML = `
                <div style="font-size:13px; line-height:1.6;">
                    <div style="text-align:center; margin-bottom:12px;">
                        <span style="background:#e8f5e9; color:#2e7d32; padding:4px 12px; border-radius:12px; font-weight:bold; font-size:12px;">Pemasukan / Penjualan</span>
                        <h3 style="margin:8px 0 0 0; font-size:20px; color:#28a745;">${formatRupiah(data.total)}</h3>
                        <small style="color:#888;">${data.waktu}</small>
                    </div>
                    <hr style="border:0; border-top:1px dashed #ccc; margin:10px 0;">
                    <p><b>Produk:</b> ${prodNama}</p>
                    <p><b>Jumlah:</b> ${data.jumlah} x ${formatRupiah(data.harga)}</p>
                    <p><b>Subtotal:</b> ${formatRupiah(data.subtotal)}</p>
                    <p><b>Potongan/Diskon:</b> ${formatRupiah(data.potongan || 0)}</p>
                    <hr style="border:0; border-top:1px dashed #ccc; margin:10px 0;">
                    <p><b>Nama Pelanggan:</b> ${data.nama || '-'}</p>
                    <p><b>Telepon:</b> ${data.telepon || '-'}</p>
                    <p><b>Alamat:</b> ${data.alamat || '-'}</p>
                </div>
            `;
        } else {
            const data = await db.keluar.get(id);
            if (!data) return;

            content.innerHTML = `
                <div style="font-size:13px; line-height:1.6;">
                    <div style="text-align:center; margin-bottom:12px;">
                        <span style="background:#ffebee; color:#c62828; padding:4px 12px; border-radius:12px; font-weight:bold; font-size:12px;">Pengeluaran</span>
                        <h3 style="margin:8px 0 0 0; font-size:20px; color:#dc3545;">${formatRupiah(data.nominal)}</h3>
                        <small style="color:#888;">${data.tanggal}</small>
                    </div>
                    <hr style="border:0; border-top:1px dashed #ccc; margin:10px 0;">
                    <p><b>Keterangan:</b> ${data.keterangan || '-'}</p>
                </div>
            `;
        }
    } catch (err) {
        content.innerHTML = `<p style="color:red;">Gagal memuat detail: ${err.message}</p>`;
    }
}

function tutupModalDetail() {
    const modal = document.getElementById('modal-detail-trx');
    if (modal) modal.style.display = 'none';
}

// 4. REKAPITULASI & FILTER PERIODE
async function bukaHalamanRekap(filterAwal = 'hari_ini') {
    const page = document.getElementById('page-rekapitulasi');
    if (page) page.style.display = 'flex';
    
    const btnAwal = document.querySelector(`.rekap-pills button[onclick*="${filterAwal}"], .pill-btn[onclick*="${filterAwal}"], .btn-filter-pill[onclick*="${filterAwal}"]`);
    filterRekap(filterAwal, btnAwal);
}

async function filterRekap(jenis, btnElement = null) {
    filterRekapAktif = jenis;
    
    // Perbarui state tombol pill aktif
    const allPills = document.querySelectorAll('.btn-filter-pill, .pill-btn');
    allPills.forEach(p => p.classList.remove('active'));

    if (btnElement) {
        btnElement.classList.add('active');
    } else {
        const targetBtn = document.querySelector(`button[onclick*="${jenis}"]`);
        if (targetBtn) targetBtn.classList.add('active');
    }

    const skrg = new Date();
    const todayStr = skrg.toISOString().split('T')[0];

    let startRange = '';
    let endRange = '';

    const customBox = document.getElementById('box-custom-tanggal') || document.getElementById('box-custom-date');
    if (customBox) customBox.style.display = (jenis === 'custom') ? 'block' : 'none';

    if (jenis === 'hari_ini') {
        startRange = `${todayStr} 00:00:00`;
        endRange = `${todayStr} 23:59:59`;
    } else if (jenis === 'kemarin') {
        let tglKemarin = new Date(skrg);
        tglKemarin.setDate(skrg.getDate() - 1);
        const kemarinStr = tglKemarin.toISOString().split('T')[0];
        startRange = `${kemarinStr} 00:00:00`;
        endRange = `${kemarinStr} 23:59:59`;
    } else if (jenis === 'bulan' || jenis === 'bulan_ini') {
        const YYYY = skrg.getFullYear();
        const MM = String(skrg.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(YYYY, skrg.getMonth() + 1, 0).getDate();
        startRange = `${YYYY}-${MM}-01 00:00:00`;
        endRange = `${YYYY}-${MM}-${String(lastDay).padStart(2, '0')} 23:59:59`;
    } else if (jenis === 'tahun' || jenis === 'tahun_ini') {
        const YYYY = skrg.getFullYear();
        startRange = `${YYYY}-01-01 00:00:00`;
        endRange = `${YYYY}-12-31 23:59:59`;
    } else if (jenis === 'custom') {
        const tglMulai = document.getElementById('rekap-tgl-mulai')?.value;
        const tglSelesai = document.getElementById('rekap-tgl-selesai')?.value;
        if (tglMulai && tglSelesai) {
            startRange = `${tglMulai} 00:00:00`;
            endRange = `${tglSelesai} 23:59:59`;
        }
    }

    let filteredMasuk = [];
    let filteredKeluar = [];

    if (startRange && endRange) {
        [filteredMasuk, filteredKeluar] = await Promise.all([
            db.masuk.where('waktu').between(startRange, endRange, true, true).toArray(),
            db.keluar.where('tanggal').between(startRange, endRange, true, true).toArray()
        ]);
    }

    const totalMasuk = filteredMasuk.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const totalKeluar = filteredKeluar.reduce((s, i) => s + (Number(i.nominal) || 0), 0);
    const labaFilter = totalMasuk - totalKeluar;

    // Element Banners
    const elRekapLaba = document.getElementById('rekap-laba-bersih') || document.getElementById('rekap-total-laba');
    const elRekapMasuk = document.getElementById('rekap-total-pemasukan') || document.getElementById('rekap-total-masuk');
    const elRekapKeluar = document.getElementById('rekap-total-pengeluaran') || document.getElementById('rekap-total-keluar');
    const elJmlTrx = document.getElementById('rekap-jumlah-transaksi');

    if (elRekapLaba) {
        elRekapLaba.innerText = formatRupiah(labaFilter);
        elRekapLaba.style.color = labaFilter >= 0 ? '#2A9D8F' : '#E63946';
    }
    if (elRekapMasuk) elRekapMasuk.innerText = formatRupiah(totalMasuk);
    if (elRekapKeluar) elRekapKeluar.innerText = formatRupiah(totalKeluar);
    if (elJmlTrx) elJmlTrx.innerText = `${filteredMasuk.length} Transaksi Penjualan`;

    // Render Breakdown Kategori Pengeluaran
    const containerKat = document.getElementById('rekap-breakdown-kategori');
    if (containerKat) {
        const breakdown = {};
        filteredKeluar.forEach(k => {
            const kat = k.kategori || 'Lainnya';
            breakdown[kat] = (breakdown[kat] || 0) + (Number(k.nominal) || 0);
        });

        const katKeys = Object.keys(breakdown);
        if (katKeys.length === 0) {
            containerKat.innerHTML = '<p style="color: #888; text-align: center; margin: 0;">Belum ada data pengeluaran.</p>';
        } else {
            containerKat.innerHTML = katKeys.map(k => `
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                    <span>${k}</span>
                    <strong style="color:#dc3545;">${formatRupiah(breakdown[k])}</strong>
                </div>
            `).join('');
        }
    }

    // Render Arus Kas
    let gabungan = [
        ...filteredMasuk.map(m => ({ id: m.id, tipe: 'masuk', judul: `Penjualan ${m.jumlah}x`, nominal: m.total, waktu: m.waktu })),
        ...filteredKeluar.map(k => ({ id: k.id, tipe: 'keluar', judul: k.keterangan || 'Pengeluaran', nominal: k.nominal, waktu: k.tanggal }))
    ];

    gabungan.sort((a, b) => new Date(b.waktu) - new Date(a.waktu));

    const containerList = document.getElementById('rekap-list-aruskas') || document.getElementById('list-rekap-detail');
    if (containerList) {
        containerList.innerHTML = '';
        if (gabungan.length === 0) {
            containerList.innerHTML = '<p class="empty-state">Tidak ada transaksi pada periode ini.</p>';
        } else {
            const fragment = document.createDocumentFragment();
            gabungan.forEach(act => {
                const isMasuk = act.tipe === 'masuk';
                const warnaBar = isMasuk ? '#28a745' : '#dc3545';
                const warnaNominal = isMasuk ? 'var(--primary-color)' : '#dc3545';
                const badgeBg = isMasuk ? '#e8f5e9' : '#ffebee';
                const badgeColor = isMasuk ? '#2e7d32' : '#c62828';
                const badgeText = isMasuk ? 'Masuk' : 'Keluar';
                const tanda = isMasuk ? '+' : '-';

                const card = document.createElement('div');
                card.className = 'rekap-card-item';
                card.style.borderLeft = `4px solid ${warnaBar}`;
                card.onclick = () => bukaDetailAktivitas(act.id, act.tipe);
                
                card.innerHTML = `
                    <div>
                        <strong style="font-size:14px; display:block; color:#333; margin-bottom:2px;">${act.judul}</strong>
                        <small style="color:#888; font-size:11px;">📅 ${act.waktu}</small>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:bold; font-size:14px; color:${warnaNominal};">
                            ${tanda} ${formatRupiah(act.nominal)}
                        </div>
                        <span style="font-size:10px; background:${badgeBg}; color:${badgeColor}; padding:2px 8px; border-radius:6px; font-weight:600;">${badgeText}</span>
                    </div>
                `;
                fragment.appendChild(card);
            });
            containerList.appendChild(fragment);
        }
    }
}

// Hubungkan setFilterRekap ke filterRekap
function setFilterRekap(jenis, btn) {
    filterRekap(jenis, btn);
}

// Tambahkan setFilterRekap ke Window
Object.assign(window, { setFilterRekap });


// 5. MANAJEMEN KATEGORI & DEBOUNCE SEARCH
async function muatOpsiKategori() {
    try {
        const produkList = await db.produk.toArray();
        const kategoriSet = new Set();

        produkList.forEach(p => {
            if (p.kategori && p.kategori.trim() !== '') {
                kategoriSet.add(p.kategori.trim());
            }
        });

        const selectModal = document.getElementById('prod-kategori-select');
        const selectFilter = document.getElementById('filter-kategori');
        const currentFilterVal = selectFilter ? selectFilter.value : '';

        if (selectModal) selectModal.innerHTML = '<option value="">-- Pilih Kategori --</option>';
        if (selectFilter) selectFilter.innerHTML = '<option value="">Semua Kategori</option>';

        kategoriSet.forEach(kat => {
            if (selectModal) selectModal.innerHTML += `<option value="${kat}">${kat}</option>`;
            if (selectFilter) selectFilter.innerHTML += `<option value="${kat}">${kat}</option>`;
        });

        if (selectModal) selectModal.innerHTML += '<option value="__NEW__">+ Tambah Kategori Baru...</option>';
        if (selectFilter && currentFilterVal && kategoriSet.has(currentFilterVal)) {
            selectFilter.value = currentFilterVal;
        }
    } catch (error) {
        console.error("Gagal memuat opsi kategori:", error);
    }
}

function toggleInputKategori(val) {
    const inputNew = document.getElementById('prod-kategori-new');
    if (!inputNew) return;
    inputNew.style.display = (val === '__NEW__') ? 'block' : 'none';
    inputNew.required = (val === '__NEW__');
    if (val === '__NEW__') inputNew.focus();
}

function handleSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { muatDaftarProduk(); }, 300);
}

function handleSearchTrx() {
    clearTimeout(searchTrxTimeout);
    searchTrxTimeout = setTimeout(() => { muatProdukTransaksi(); }, 300);
}

// 6. PRODUK MANAGEMENT & PREVIEW GAMBAR
function previewGambar(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const maxSide = 300;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSide) { height *= maxSide / width; width = maxSide; }
                } else {
                    if (height > maxSide) { width *= maxSide / height; height = maxSide; }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                document.getElementById('prod-gamin-base64').value = compressedBase64;

                const imgPreview = document.getElementById('img-preview');
                if (imgPreview) {
                    imgPreview.src = compressedBase64;
                    imgPreview.style.display = 'block';
                }
                const imgPlaceholder = document.getElementById('img-placeholder');
                if (imgPlaceholder) imgPlaceholder.style.display = 'none';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

async function muatDaftarProduk() {
    const searchInput = document.getElementById('search-produk');
    const filterSelect = document.getElementById('filter-kategori');
    const listContainer = document.getElementById('list-produk');

    if (!listContainer) return;

    const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const filterKat = filterSelect ? filterSelect.value : '';

    try {
        let produkList = await db.produk.toArray();

        if (keyword !== '') produkList = produkList.filter(p => p.nama && p.nama.toLowerCase().includes(keyword));
        if (filterKat !== '') produkList = produkList.filter(p => p.kategori === filterKat);

        listContainer.innerHTML = '';

        if (produkList.length === 0) {
            listContainer.innerHTML = '<p class="empty-state">Belum ada produk tersimpan.</p>';
            return;
        }

        const placeholderSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="%23ccc"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7l-3 3.72L9 13l-3 4h12l-4-5z"/></svg>';
        const fragment = document.createDocumentFragment();

        produkList.forEach(prod => {
            const card = document.createElement('div');
            card.className = 'product-card';
            const imgSrc = prod.gamin ? prod.gamin : placeholderSvg;

            card.innerHTML = `
                <img src="${imgSrc}" class="prod-thumb" alt="${prod.nama}">
                <div class="prod-info">
                    ${prod.kategori ? `<span class="badge-kategori">${prod.kategori}</span>` : ''}
                    <h4>${prod.nama} ${prod.status == 0 ? '<small style="color:red">(Nonaktif)</small>' : ''}</h4>
                    <p>${formatRupiah(prod.harga)} | <small>Stok: ${prod.stok}</small></p>
                    ${prod.deskripsi ? `<p class="prod-deskripsi-text">${prod.deskripsi}</p>` : ''}
                </div>
                <div class="prod-actions">
                    <button class="btn-edit" onclick="bukaModalProduk('${prod.id}')">Edit</button>
                    <button class="btn-delete" onclick="hapusProduk('${prod.id}')">Hapus</button>
                </div>
            `;
            fragment.appendChild(card);
        });

        listContainer.appendChild(fragment);
    } catch (error) {
        console.error("Gagal memuat daftar produk:", error);
    }
}

async function bukaModalProduk(id = null) {
    document.getElementById('form-produk').reset();
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-gamin-base64').value = '';
    
    const preview = document.getElementById('img-preview');
    const placeholder = document.getElementById('img-placeholder');
    if (preview) preview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    
    const katNew = document.getElementById('prod-kategori-new');
    if (katNew) katNew.style.display = 'none';

    await muatOpsiKategori();

    if (id) {
        try {
            const prod = await db.produk.get(id);
            if (prod) {
                document.getElementById('modal-title-produk').innerText = "Edit Produk";
                document.getElementById('prod-id').value = prod.id;
                document.getElementById('prod-nama').value = prod.nama;
                document.getElementById('prod-kategori-select').value = prod.kategori || '';
                document.getElementById('prod-harga').value = prod.harga;
                document.getElementById('prod-stok').value = prod.stok;
                document.getElementById('prod-deskripsi').value = prod.deskripsi || '';
                document.getElementById('prod-status').value = prod.status;

                if (prod.gamin) {
                    document.getElementById('prod-gamin-base64').value = prod.gamin;
                    if (preview) { preview.src = prod.gamin; preview.style.display = 'block'; }
                    if (placeholder) placeholder.style.display = 'none';
                }

                document.getElementById('modal-produk').style.display = 'flex';
            }
        } catch (error) {
            console.error("Gagal mengambil data produk:", error);
        }
    } else {
        document.getElementById('modal-title-produk').innerText = "Tambah Produk";
        document.getElementById('modal-produk').style.display = 'flex';
    }
}

function tutupModalProduk() {
    const modal = document.getElementById('modal-produk');
    if (modal) modal.style.display = 'none';
}

async function simpanProduk(event) {
    event.preventDefault();

    const id = document.getElementById('prod-id').value || generateUUID();
    const nama = document.getElementById('prod-nama').value;
    let kategori = document.getElementById('prod-kategori-select').value;
    if (kategori === '__NEW__') {
        kategori = document.getElementById('prod-kategori-new').value.trim();
    }

    const harga = parseInt(document.getElementById('prod-harga').value) || 0;
    const stok = parseInt(document.getElementById('prod-stok').value) || 0;
    const deskripsi = document.getElementById('prod-deskripsi').value;
    const gamin = document.getElementById('prod-gamin-base64').value;
    const status = parseInt(document.getElementById('prod-status').value);

    try {
        await db.produk.put({
            id: id,
            nama: nama,
            kategori: kategori,
            harga: harga,
            stok: stok,
            deskripsi: deskripsi,
            gamin: gamin,
            status: status
        });

        tutupModalProduk();
        await muatOpsiKategori();
        await muatDaftarProduk();
    } catch (error) {
        alert("Gagal menyimpan produk: " + error.message);
    }
}

function hapusProduk(id) {
    document.getElementById('hapus-prod-id').value = id;
    document.getElementById('modal-konfirmasi').style.display = 'flex';
}

function tutupModalKonfirmasi() {
    document.getElementById('modal-konfirmasi').style.display = 'none';
    document.getElementById('hapus-prod-id').value = '';
}

async function eksekusiHapusProduk() {
    const id = document.getElementById('hapus-prod-id').value;
    if (id) {
        try {
            await db.produk.delete(id);
            tutupModalKonfirmasi();
            await muatOpsiKategori();
            await muatDaftarProduk();
        } catch (error) {
            alert("Gagal menghapus produk: " + error.message);
        }
    }
}

// 7. KASIR & TRANSAKSI
async function bukaTransaksiPage() {
    keranjang = [];
    document.getElementById('trx-potongan').value = 0;
    document.getElementById('trx-nama-pelanggan').value = '';
    document.getElementById('trx-telepon').value = '';
    document.getElementById('trx-alamat').value = '';
    
    document.getElementById('page-transaksi').style.display = 'flex';
    await muatKategoriTransaksi();
    await muatProdukTransaksi();
    renderKeranjang();
}

async function muatKategoriTransaksi() {
    try {
        const produkList = await db.produk.toArray();
        const katSet = new Set();
        produkList.forEach(p => { if (p.kategori) katSet.add(p.kategori); });

        const select = document.getElementById('filter-trx-kategori');
        if (select) {
            select.innerHTML = '<option value="">Semua</option>';
            katSet.forEach(k => select.innerHTML += `<option value="${k}">${k}</option>`);
        }
    } catch (error) {
        console.error("Gagal muat kategori transaksi:", error);
    }
}

async function muatProdukTransaksi() {
    const searchInput = document.getElementById('search-trx-produk');
    const selectKategori = document.getElementById('filter-trx-kategori');
    const grid = document.getElementById('grid-trx-produk');
    
    if (!grid) return;

    const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const katFilter = selectKategori ? selectKategori.value : '';
    grid.innerHTML = '';

    try {
        let list = await db.produk.where('status').equals(1).toArray();

        if (keyword) list = list.filter(p => p.nama && p.nama.toLowerCase().includes(keyword));
        if (katFilter) list = list.filter(p => p.kategori === katFilter);

        if (list.length === 0) {
            grid.innerHTML = '<p class="empty-state" style="grid-column: span 2;">Tidak ada produk tersedia.</p>';
            return;
        }

        const placeholderSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="%23ccc"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7l-3 3.72L9 13l-3 4h12l-4-5z"/></svg>';
        const fragment = document.createDocumentFragment();

        list.forEach(p => {
            const card = document.createElement('div');
            card.className = 'trx-card';
            const imgSrc = p.gamin ? p.gamin : placeholderSvg;

            card.innerHTML = `
                <div>
                    <img src="${imgSrc}" alt="${p.nama}">
                    <h5>${p.nama}</h5>
                    <p>${formatRupiah(p.harga)}</p>
                    <small style="color:#888;">Stok: ${p.stok}</small>
                </div>
                <button class="btn-add-cart" onclick="tambahKeKeranjang('${p.id}')">+ Pilih</button>
            `;
            fragment.appendChild(card);
        });

        grid.appendChild(fragment);
    } catch (error) {
        console.error("Gagal muat produk transaksi:", error);
    }
}

async function tambahKeKeranjang(id) {
    try {
        const prod = await db.produk.get(id);
        if (!prod) return;

        const item = keranjang.find(k => k.id === id);
        if (item) {
            if (item.jumlah < prod.stok) {
                item.jumlah++;
            } else {
                alert("Jumlah melebihi stok yang tersedia!");
            }
        } else {
            if (prod.stok > 0) {
                keranjang.push({
                    id: prod.id,
                    nama: prod.nama,
                    harga: prod.harga,
                    jumlah: 1,
                    stokMax: prod.stok
                });
            } else {
                alert("Stok produk habis!");
            }
        }
        renderKeranjang();
    } catch (error) {
        console.error("Gagal menambah ke keranjang:", error);
    }
}

function ubahQtyCart(id, delta) {
    const item = keranjang.find(k => k.id === id);
    if (item) {
        item.jumlah += delta;
        if (item.jumlah <= 0) {
            keranjang = keranjang.filter(k => k.id !== id);
        } else if (item.jumlah > item.stokMax) {
            item.jumlah = item.stokMax;
            alert("Mencapai batas maksimum stok!");
        }
    }
    renderKeranjang();
}

function renderKeranjang() {
    const cartList = document.getElementById('cart-list');
    if (!cartList) return;

    cartList.innerHTML = '';

    if (keranjang.length === 0) {
        cartList.innerHTML = '<p class="empty-state">Keranjang masih kosong.</p>';
        const badge = document.getElementById('cart-badge');
        if (badge) badge.innerText = '0 Item';
        hitungTotalTransaksi();
        return;
    }

    let totalItem = 0;
    const fragment = document.createDocumentFragment();

    keranjang.forEach(item => {
        totalItem += item.jumlah;
        const sub = item.harga * item.jumlah;
        
        const row = document.createElement('div');
        row.className = 'cart-row';
        row.innerHTML = `
            <div>
                <strong style="font-size:13px;">${item.nama}</strong>
                <div style="font-size:11px; color:#6C757D;">${formatRupiah(item.harga)} x ${item.jumlah} = <b>${formatRupiah(sub)}</b></div>
            </div>
            <div class="cart-qty-control">
                <button class="cart-qty-btn" onclick="ubahQtyCart('${item.id}', -1)">-</button>
                <span style="font-size:13px; font-weight:bold;">${item.jumlah}</span>
                <button class="cart-qty-btn" onclick="ubahQtyCart('${item.id}', 1)">+</button>
            </div>
        `;
        fragment.appendChild(row);
    });

    cartList.appendChild(fragment);
    const badge = document.getElementById('cart-badge');
    if (badge) badge.innerText = `${totalItem} Item`;
    hitungTotalTransaksi();
}

function hitungTotalTransaksi() {
    let subtotalAll = keranjang.reduce((sum, item) => sum + (item.harga * item.jumlah), 0);
    let potongan = parseInt(document.getElementById('trx-potongan')?.value) || 0;
    
    let grandTotal = subtotalAll - potongan;
    if (grandTotal < 0) grandTotal = 0;

    const totalTxt = document.getElementById('txt-total-bayar');
    if (totalTxt) totalTxt.innerText = formatRupiah(grandTotal);
    
    return { subtotalAll, potongan, grandTotal };
}

// Gantilah fungsi simpanTransaksi() di js/app.js dengan versi ini:
function simpanTransaksi() {
    if (keranjang.length === 0) {
        // Tampilkan modal alert kustom keranjang kosong
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.style.zIndex = '3000';
        modal.innerHTML = `
            <div class="modal-content" style="text-align: center; max-width: 300px;">
                <div style="font-size: 40px; margin-bottom: 8px;">🛒</div>
                <h4 style="margin-bottom: 8px; color: var(--text-dark);">Keranjang Masih Kosong</h4>
                <p style="font-size: 12px; color: #6c757d; margin-bottom: 18px;">
                    Silakan pilih minimal 1 produk terlebih dahulu sebelum menyelesaikan transaksi.
                </p>
                <button class="btn-primary" onclick="this.closest('.modal').remove()" style="width: 100%;">Mengerti</button>
            </div>
        `;
        document.body.appendChild(modal);
        return;
    }

    const { grandTotal } = hitungTotalTransaksi();
    
    const elTotal = document.getElementById('konfirmasi-trx-total');
    if (elTotal) elTotal.innerText = formatRupiah(grandTotal);

    const modal = document.getElementById('modal-konfirmasi-trx');
    if (modal) modal.style.display = 'flex';
}


function tutupModalKonfirmasiTrx() {
    const modal = document.getElementById('modal-konfirmasi-trx');
    if (modal) modal.style.display = 'none';
}

async function eksekusiSimpanTransaksi() {
    tutupModalKonfirmasiTrx();

    const { subtotalAll, potongan, grandTotal } = hitungTotalTransaksi();
    const namaPelanggan = document.getElementById('trx-nama-pelanggan')?.value.trim() || '';
    const telepon = document.getElementById('trx-telepon')?.value.trim() || '';
    const alamat = document.getElementById('trx-alamat')?.value.trim() || '';
    
    const skrg = new Date();
    const waktuISO = skrg.getFullYear() + '-' +
        String(skrg.getMonth() + 1).padStart(2, '0') + '-' +
        String(skrg.getDate()).padStart(2, '0') + ' ' +
        String(skrg.getHours()).padStart(2, '0') + ':' +
        String(skrg.getMinutes()).padStart(2, '0') + ':' +
        String(skrg.getSeconds()).padStart(2, '0');

    try {
        await db.transaction('rw', db.masuk, db.keluar, db.produk, async () => {
            const isSingleProduct = keranjang.length === 1;

            for (let item of keranjang) {
                const sub = item.harga * item.jumlah;
                let potBaris = isSingleProduct ? potongan : 0;
                const totalBaris = sub - potBaris;

                await db.masuk.add({
                    id: generateUUID(),
                    waktu: waktuISO,
                    nama: namaPelanggan,
                    telepon: telepon,
                    alamat: alamat,
                    jumlah: item.jumlah,
                    harga: item.harga,
                    subtotal: sub,
                    potongan: potBaris,
                    total: totalBaris < 0 ? 0 : totalBaris,
                    idproduk: item.id
                });

                const prodAsli = await db.produk.get(item.id);
                if (prodAsli) {
                    const stokBaru = prodAsli.stok - item.jumlah;
                    await db.produk.update(item.id, { stok: stokBaru < 0 ? 0 : stokBaru });
                }
            }

            if (!isSingleProduct && potongan > 0) {
                const rincianStr = keranjang.map(k => `${k.nama} ${k.jumlah}x${k.harga}`).join(', ');
                const tglFormat = String(skrg.getDate()).padStart(2, '0') + '/' + String(skrg.getMonth() + 1).padStart(2, '0') + '/' + skrg.getFullYear();

                await db.keluar.add({
                    id: generateUUID(),
                    tanggal: waktuISO,
                    nominal: potongan,
                    keterangan: `Potongan pembelian ${tglFormat}: (${rincianStr})`
                });
            }
        });

        keranjang = [];
        if (document.getElementById('trx-potongan')) document.getElementById('trx-potongan').value = 0;
        if (document.getElementById('trx-nama-pelanggan')) document.getElementById('trx-nama-pelanggan').value = '';
        if (document.getElementById('trx-telepon')) document.getElementById('trx-telepon').value = '';
        if (document.getElementById('trx-alamat')) document.getElementById('trx-alamat').value = '';

        tutupHalaman('page-transaksi');
        await muatDashboard();
    } catch (error) {
        console.error("Gagal menyimpan transaksi:", error);
        alert("Gagal menyimpan transaksi: " + error.message);
    }
}

// 8. MODUL PENGELUARAN (KAS KELUAR)
async function bukaHalamanPengeluaran() {
    const page = document.getElementById('page-pengeluaran');
    if (page) page.style.display = 'flex';
    await muatDaftarPengeluaran();
}

function bukaModalPengeluaran() {
    document.getElementById('pengeluaran-id').value = '';
    document.getElementById('modal-title-pengeluaran').innerText = 'Catat Pengeluaran';
    document.getElementById('form-pengeluaran').reset();
    
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('pengeluaran-tanggal').value = now.toISOString().slice(0, 16);

    document.getElementById('modal-pengeluaran').style.display = 'flex';
}

function tutupModalPengeluaran() {
    document.getElementById('modal-pengeluaran').style.display = 'none';
}

async function editPengeluaran(id) {
    tutupModalDetailPengeluaran();
    const item = await db.keluar.get(id);
    if (!item) return;

    document.getElementById('pengeluaran-id').value = item.id;
    document.getElementById('modal-title-pengeluaran').innerText = 'Edit Pengeluaran';
    document.getElementById('pengeluaran-nominal').value = item.nominal;
    document.getElementById('pengeluaran-kategori').value = item.kategori || 'Lainnya';
    document.getElementById('pengeluaran-keterangan').value = item.keterangan || '';

    if (item.tanggal) {
        const tglFix = item.tanggal.replace(' ', 'T').slice(0, 16);
        document.getElementById('pengeluaran-tanggal').value = tglFix;
    }

    document.getElementById('modal-pengeluaran').style.display = 'flex';
}

function handleFormPengeluaranSubmit(event) {
    event.preventDefault();

    const id = document.getElementById('pengeluaran-id').value;
    const nominal = Number(document.getElementById('pengeluaran-nominal').value) || 0;
    const kategori = document.getElementById('pengeluaran-kategori').value;
    const keterangan = document.getElementById('pengeluaran-keterangan').value.trim();
    const inputTgl = document.getElementById('pengeluaran-tanggal').value;

    let formattedTanggal = '';
    if (inputTgl) {
        const t = new Date(inputTgl);
        if (!isNaN(t.getTime())) {
            const YYYY = t.getFullYear();
            const MM = String(t.getMonth() + 1).padStart(2, '0');
            const DD = String(t.getDate()).padStart(2, '0');
            const hh = String(t.getHours()).padStart(2, '0');
            const mm = String(t.getMinutes()).padStart(2, '0');
            formattedTanggal = `${YYYY}-${MM}-${DD} ${hh}:${mm}:00`;
        }
    }

    if (!formattedTanggal) {
        const now = new Date();
        formattedTanggal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
    }

    tempPengeluaranData = {
        id: id || generateUUID(),
        isEdit: Boolean(id),
        nominal: nominal,
        kategori: kategori,
        keterangan: keterangan,
        tanggal: formattedTanggal
    };

    document.getElementById('konfirmasi-pengeluaran-title').innerText = id ? 'Update Pengeluaran?' : 'Simpan Pengeluaran?';
    document.getElementById('konfirmasi-pengeluaran-total').innerText = formatRupiah(nominal);
    document.getElementById('modal-konfirmasi-pengeluaran').style.display = 'flex';
}

function tutupModalKonfirmasiPengeluaran() {
    document.getElementById('modal-konfirmasi-pengeluaran').style.display = 'none';
}

async function eksekusiSimpanPengeluaran() {
    if (!tempPengeluaranData) return;

    try {
        await db.keluar.put({
            id: tempPengeluaranData.id,
            nominal: tempPengeluaranData.nominal,
            kategori: tempPengeluaranData.kategori,
            keterangan: tempPengeluaranData.keterangan,
            tanggal: tempPengeluaranData.tanggal
        });

        tempPengeluaranData = null;
        tutupModalKonfirmasiPengeluaran();
        tutupModalPengeluaran();
        
        await muatDaftarPengeluaran();
        muatDashboard();
    } catch (err) {
        console.error('Error simpan pengeluaran:', err);
        alert('Gagal menyimpan pengeluaran: ' + err.message);
    }
}

async function muatDaftarPengeluaran() {
    const search = (document.getElementById('search-pengeluaran')?.value || '').toLowerCase();
    const filterKat = document.getElementById('filter-kategori-pengeluaran')?.value || '';

    const skrg = new Date();
    const bulanStr = `${skrg.getFullYear()}-${String(skrg.getMonth() + 1).padStart(2, '0')}`;
    const endBulanStr = `${bulanStr}-\xFF`;

    const dataKeluarBulanIni = await db.keluar.where('tanggal').between(bulanStr, endBulanStr, true, true).toArray();
    const totalBulanIni = dataKeluarBulanIni.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0);

    const elTotalBulan = document.getElementById('pengeluaran-total-bulan');
    if (elTotalBulan) elTotalBulan.innerText = formatRupiah(totalBulanIni);

    let dataKeluar = await db.keluar.orderBy('tanggal').reverse().limit(100).toArray();

    let filtered = dataKeluar.filter(item => {
        const matchSearch = (item.keterangan || '').toLowerCase().includes(search) || (item.kategori || '').toLowerCase().includes(search);
        const matchKategori = filterKat === '' || item.kategori === filterKat;
        return matchSearch && matchKategori;
    });

    const container = document.getElementById('list-pengeluaran');
    if (!container) return;

    container.innerHTML = '';

    if (filtered.length === 0) {
        container.innerHTML = '<p class="empty-state">Tidak ada catatan pengeluaran ditemukan.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 12px 15px;
            margin-bottom: 10px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.04);
            border-left: 4px solid #dc3545;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
        `;

        card.onclick = () => bukaDetailPengeluaran(item.id);

        card.innerHTML = `
            <div>
                <span style="font-size: 11px; background: #ffebee; color: #c62828; padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                    ${item.kategori || 'Pengeluaran'}
                </span>
                <strong style="display: block; font-size: 14px; color: #333; margin-top: 4px;">${item.keterangan}</strong>
                <small style="color: #888; font-size: 11px;">📅 ${item.tanggal}</small>
            </div>
            <div style="text-align: right;">
                <div style="font-weight: bold; font-size: 14px; color: #dc3545;">
                    - ${formatRupiah(item.nominal)}
                </div>
            </div>
        `;
        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

async function bukaDetailPengeluaran(id) {
    const item = await db.keluar.get(id);
    if (!item) return;

    const body = document.getElementById('detail-pengeluaran-body');
    if (body) {
        body.innerHTML = `
            <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                <small style="color: #6c757d; display:block;">Nominal Pengeluaran</small>
                <strong style="font-size: 20px; color: #dc3545;">- ${formatRupiah(item.nominal)}</strong>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                    <td style="padding: 6px 0; color: #666; width: 35%;">Kategori</td>
                    <td style="padding: 6px 0; font-weight: 600;">: ${item.kategori || '-'}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #666;">Waktu</td>
                    <td style="padding: 6px 0;">: ${item.tanggal || '-'}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #666; vertical-align: top;">Keterangan</td>
                    <td style="padding: 6px 0; font-weight: 500;">: ${item.keterangan || '-'}</td>
                </tr>
            </table>
        `;
    }

    const btnEdit = document.getElementById('btn-detail-edit');
    const btnHapus = document.getElementById('btn-detail-hapus');
    if (btnEdit) btnEdit.onclick = () => editPengeluaran(item.id);
    if (btnHapus) btnHapus.onclick = () => konfirmasiHapusPengeluaran(item.id);

    document.getElementById('modal-detail-pengeluaran').style.display = 'flex';
}

function tutupModalDetailPengeluaran() {
    const modal = document.getElementById('modal-detail-pengeluaran');
    if (modal) modal.style.display = 'none';
}

function konfirmasiHapusPengeluaran(id) {
    tutupModalDetailPengeluaran();
    document.getElementById('hapus-pengeluaran-id').value = id;
    document.getElementById('modal-konfirmasi-hapus-pengeluaran').style.display = 'flex';
}

function tutupModalHapusPengeluaran() {
    document.getElementById('modal-konfirmasi-hapus-pengeluaran').style.display = 'none';
}

async function eksekusiHapusPengeluaran() {
    const id = document.getElementById('hapus-pengeluaran-id').value;
    if (id) {
        await db.keluar.delete(id);
        tutupModalHapusPengeluaran();
        await muatDaftarPengeluaran();
        muatDashboard();
    }
}

// 9. BACKUP & RESTORE DATA
// 9. BACKUP & RESTORE DATA
function bukaModalBackup() {
    document.getElementById('modal-backup-restore').style.display = 'flex';
}

function tutupModalBackup() {
    document.getElementById('modal-backup-restore').style.display = 'none';
}

// Helper Toast Notification
function showToast(message, icon = '✅') {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Fungsi Ekspor Backup JSON yang benar
async function eksporBackupJSON() {
    try {
        const produk = await db.produk.toArray();
        const keluar = await db.keluar.toArray();
        const masuk = await db.masuk.toArray();

        const backupObj = {
            app: 'KedaiYammie',
            version: 2,
            timestamp: new Date().toISOString(),
            data: { produk, keluar, masuk }
        };

        const jsonString = JSON.stringify(backupObj, null, 2);
        
        // Buat Blob dengan MIME type yang tepat
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const now = new Date();
        const YYYY = now.getFullYear();
        const MM = String(now.getMonth() + 1).padStart(2, '0');
        const DD = String(now.getDate()).padStart(2, '0');
        const fileName = `Backup_KedaiYammie_${YYYY}${MM}${DD}.json`;

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        
        a.click();

        // Beri jeda sebentar sebelum revoke URL dan hapus elemen
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);

        tutupModalBackup();
        showToast("File backup berhasil diunduh!", "💾");
    } catch (err) {
        console.error('Detail Error Backup:', err);
        showToast('Gagal mengunduh file backup', "❌");
    }
}


// Helper Modal Konfirmasi Download Custom
function tutupModalKonfirmasiDownload() {
    const modal = document.getElementById('modal-konfirmasi-download');
    if (modal) modal.style.display = 'none';
}

async function eksporBackupJSON() {
    try {
        const produk = await db.produk.toArray();
        const keluar = await db.keluar.toArray();
        const masuk = await db.masuk.toArray();

        const backupObj = {
            app: 'KedaiYammie',
            version: 2,
            timestamp: new Date().toISOString(),
            data: { produk, keluar, masuk }
        };

        const jsonString = JSON.stringify(backupObj, null, 2);
        
        // Menggunakan Base64 Data URI untuk menghindari dialog Blob UUID WebView
        const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
        const dataUrl = `data:application/json;charset=utf-8;base64,${base64Data}`;

        const now = new Date();
        const YYYY = now.getFullYear();
        const MM = String(now.getMonth() + 1).padStart(2, '0');
        const DD = String(now.getDate()).padStart(2, '0');
        const fileName = `Backup_KedaiYammie_${YYYY}${MM}${DD}.json`;

        // Update preview nama file
        const elNamaFile = document.getElementById('nama-file-backup-preview');
        if (elNamaFile) elNamaFile.textContent = fileName;

        // Pasang event listener pada tombol "Unduh Sekarang"
        const btnEksekusi = document.getElementById('btn-eksekusi-download');
        btnEksekusi.onclick = function() {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = fileName;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                if (document.body.contains(a)) {
                    document.body.removeChild(a);
                }
            }, 500);

            tutupModalKonfirmasiDownload();
            showToast("File backup berhasil diunduh!", "💾");
        };

        // 1. Sembunyikan modal backup utama secara eksplisit
        const modalBackupUtama = document.getElementById('modal-backup-restore');
        if (modalBackupUtama) modalBackupUtama.style.display = 'none';

        // 2. Tampilkan modal konfirmasi custom
        document.getElementById('modal-konfirmasi-download').style.display = 'flex';

    } catch (err) {
        console.error('Gagal menyiapkan backup:', err);
        showToast('Gagal menyiapkan file backup', "❌");
    }
}





// 10. INITIALIZATION & EXPORT WINDOW SCOPE
// 10. INITIALIZATION & EXPORT WINDOW SCOPE
document.addEventListener("DOMContentLoaded", () => {
    // Buat timer penundaan minimum (contoh: 2000 ms = 2 detik)
    const MINIMUM_SPLASH_TIME = 2000; 
    const delayPromise = new Promise(resolve => setTimeout(resolve, MINIMUM_SPLASH_TIME));

    // Jalankan pemuatan data dan delay minimum secara bersamaan
    Promise.all([muatDashboard(), delayPromise]).finally(() => {
        const splash = document.getElementById("splash-screen");
        const app = document.getElementById("app");
        
        if (splash) {
            // Efek fade-out CSS
            splash.classList.add("hidden");
            
            // Beri waktu animasi CSS fade-out selesai (500ms) sebelum menyembunyikan DOM
            setTimeout(() => {
                splash.style.display = "none";
                if (app) app.style.display = "block";
            }, 500);
        }
    });
});


// Registrasi Fungsi Global Window
Object.assign(window, {
    navigasi,
    tutupHalaman,
    bukaModalProduk,
    tutupModalProduk,
    simpanProduk,
    hapusProduk,
    muatDaftarProduk,
    previewGambar,
    toggleInputKategori,
    handleSearchInput,
    handleSearchTrx,
    bukaTransaksiPage,
    muatProdukTransaksi,
    tambahKeKeranjang,
    ubahQtyCart,
    hitungTotalTransaksi,
    simpanTransaksi,
    tutupModalKonfirmasi,
    eksekusiHapusProduk,
    muatDashboard,
    bukaDetailAktivitas,
    tutupModalDetail,
    bukaHalamanRekap,
    filterRekap,
    formatRupiah,
    tutupModalKonfirmasiTrx,
    eksekusiSimpanTransaksi,
    bukaHalamanPengeluaran,
    bukaModalPengeluaran,
    tutupModalPengeluaran,
    editPengeluaran,
    handleFormPengeluaranSubmit,
    tutupModalKonfirmasiPengeluaran,
    eksekusiSimpanPengeluaran,
    muatDaftarPengeluaran,
    bukaDetailPengeluaran,
    tutupModalDetailPengeluaran,
    konfirmasiHapusPengeluaran,
    tutupModalHapusPengeluaran,
    eksekusiHapusPengeluaran,
    bukaModalBackup,
    tutupModalBackup,
    eksporBackupJSON,
    prosesImportJSON
});
