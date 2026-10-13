const isLocal = window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1' || 
                window.location.protocol === 'file:' || 
                window.location.hostname === '';

const API_URL = isLocal ? 'http://localhost:5000/api' : '/api'; 
const BACKEND_URL = isLocal ? 'http://localhost:5000' : '';

(async function panelErisimKontrolu() {
    const token = localStorage.getItem('irsad_token');
    
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const res = await fetch(`${API_URL}/admin/verify`, {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const veri = await res.json();

        if (!res.ok || !veri.success || veri.rol !== 'admin') {
            throw new Error(veri.hata || "Yetkisiz erişim tespiti.");
        }

        document.body.style.display = 'block';

    } catch (err) {
        console.error("Erişim kontrol hatası:", err);
        if (err.name === 'TypeError' || (err.message && err.message.includes('fetch'))) {
            alert(`Sunucuya (${API_URL}) bağlanılamadı! Lütfen Node.js sunucunuzun çalıştığından ve CORS izinlerinin kurulu olduğundan emin olun.`);
            return;
        }
        alert("Oturum süreniz doldu veya yetkisiz erişim sağladınız!");
        localStorage.removeItem('irsad_token');
        localStorage.removeItem('irsad_kullanici_rol');
        localStorage.removeItem('irsad_kullanici_bilgi');
        window.location.href = 'login.html';
    }
})();
document.addEventListener("DOMContentLoaded", () => {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    function mobilMenuyuKapat() {
        if (sidebar) sidebar.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    }

    if (mobileMenuBtn && sidebar && sidebarOverlay) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active');
        });

        sidebarOverlay.addEventListener('click', mobilMenuyuKapat);
    }
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.content-section');
    const aktifSekme = localStorage.getItem('irsad_admin_sekme') || 'orders-section';
    
    function sekmeyiAc(targetId) {
        menuItems.forEach(menu => menu.classList.remove('active'));
        sections.forEach(section => section.classList.remove('active'));
        
        const targetSection = document.getElementById(targetId);
        const targetMenu = document.querySelector(`.menu-item[data-target="${targetId}"]`);
        
        if (targetSection) targetSection.classList.add('active');
        if (targetMenu) targetMenu.classList.add('active');
        
        localStorage.setItem('irsad_admin_sekme', targetId);
        
        if (targetId === 'kullanicilarSection' && typeof kullanicilarYukle === 'function') {
            kullanicilarYukle();
        }
        if (targetId === 'settings-section' && typeof ayarlariGetir === 'function') {
            ayarlariGetir();
        }
        if (targetId === 'indirim-kutulari-section' && typeof indirimKutulariniYukle === 'function') {
            indirimKutulariniYukle();
        }
        mobilMenuyuKapat();
    }

    sekmeyiAc(aktifSekme);

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            if (item.classList.contains('back-site')) return;
            e.preventDefault();
            const targetId = item.getAttribute('data-target');
            sekmeyiAc(targetId);
        });
    });
});

let tumUrunlerHafizasi = []; 
let urunMevcutSayfa = 1;
const sayfaBasinaUrunSayisi = 20; 
let urunAramaKelimesi = "";
let aktifSiparisMevcutSayfa = 1;
let gecmisSiparisMevcutSayfa = 1;
let aktifSiparisToplamSayfa = 1;
let gecmisSiparisToplamSayfa = 1;
let siparisAramaKelimesi = "";
let siparisIstekNo = 0; // art arda yazarken eski cevapların yenisini ezmesini engeller
let kullaniciMevcutSayfa = 1;
const sayfaBasinaKayitSayisi = 15;

const tokenGetir = () => localStorage.getItem('irsad_token') || "";
async function resmiKucult(dosya, maksKenar = 2000, kalite = 0.88) {
    try {
        if (!dosya || !dosya.type || !dosya.type.startsWith('image/')) return dosya;
        if (dosya.type === 'image/gif' || dosya.type === 'image/svg+xml') return dosya;

        const gecici = URL.createObjectURL(dosya);
        let img;
        try {
            img = await new Promise((tamam, hata) => {
                const i = new Image();
                i.onload = () => tamam(i);
                i.onerror = hata;
                i.src = gecici;
            });
        } finally {
            URL.revokeObjectURL(gecici);
        }

        const oran = Math.min(1, maksKenar / Math.max(img.naturalWidth, img.naturalHeight));
        if (oran === 1 && dosya.size < 2 * 1024 * 1024) return dosya; // zaten küçük

        const tuval = document.createElement('canvas');
        tuval.width = Math.max(1, Math.round(img.naturalWidth * oran));
        tuval.height = Math.max(1, Math.round(img.naturalHeight * oran));
        tuval.getContext('2d').drawImage(img, 0, 0, tuval.width, tuval.height);

        const png = dosya.type === 'image/png'; // saydam arka planlı PNG'ler bozulmasın
        const tur = png ? 'image/png' : 'image/jpeg';
        const blob = await new Promise(tamam => tuval.toBlob(tamam, tur, kalite));
        if (!blob || (oran === 1 && blob.size >= dosya.size)) return dosya;

        const yeniAd = (dosya.name || 'foto').replace(/\.[^.]+$/, '') + (png ? '.png' : '.jpg');
        return new File([blob], yeniAd, { type: tur });
    } catch (hata) {
        console.warn('Fotoğraf küçültülemedi, orijinali gönderiliyor:', hata);
        return dosya;
    }
}
function escapeHtml(deger) {
    if (deger === null || deger === undefined) return '';
    return String(deger)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
async function siparisleriYukle() {
    const istekNo = ++siparisIstekNo;
    const aramaParam = `&arama=${encodeURIComponent(siparisAramaKelimesi)}`;
    const aramaVar = siparisAramaKelimesi !== '';
    const musteriGosterimOlustur = (siparis) => {
        if (siparis.musteri_adi) {
            let epostaHtml = siparis.musteri_eposta ? `<br><small style="color:var(--text-muted);"><i class="fas fa-envelope"></i> ${escapeHtml(siparis.musteri_eposta)}</small>` : '';
            let telHtml = siparis.musteri_telefon ? `<br><small style="color:var(--text-muted);"><i class="fas fa-phone"></i> ${escapeHtml(siparis.musteri_telefon)}</small>` : '';
            return `<strong>${escapeHtml(siparis.musteri_adi)}</strong>${epostaHtml}${telHtml}`;
        }
        return `<span style="color: var(--text-muted); font-style: italic;">Misafir Müşteri</span>`;
    };

    try {
        const aktifRes = await fetch(`${API_URL}/admin/siparisler?sayfa=${aktifSiparisMevcutSayfa}&limit=${sayfaBasinaKayitSayisi}&tur=aktif${aramaParam}`, {
            headers: { 'Authorization': `Bearer ${tokenGetir()}` } 
        });
        const aktifVeri = await aktifRes.json();
        if (istekNo !== siparisIstekNo) return; // daha yeni bir arama başladı
        aktifSiparisToplamSayfa = aktifVeri.toplamSayfa || 1;
        const aktifSiparisler = aktifVeri.siparisler || [];
        const aktifTablo = document.getElementById('aktif-siparisler-body');

        if (aktifTablo) {
            aktifTablo.innerHTML = '';
            if (aktifSiparisler.length === 0) {
                aktifTablo.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">' + (aramaVar ? 'Aramaya uygun aktif sipariş bulunamadı.' : 'Henüz aktif sipariş bulunmuyor.') + '</td></tr>';
            } else {
                aktifSiparisler.forEach(siparis => {
                    const tarih = new Date(siparis.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    aktifTablo.innerHTML += `
                        <tr>
                            <td><strong>${escapeHtml(siparis.siparis_kodu)}</strong></td>
                            <td>${musteriGosterimOlustur(siparis)}</td>
                            <td>${tarih}</td>
                            <td>${escapeHtml(siparis.urunler || 'Ürün detayı yok')}</td>
                            <td><strong>${escapeHtml(siparis.toplam_tutar)} TL</strong></td>
                            <td class="text-center"><button class="btn-success" onclick="siparisiTamamla(${Number(siparis.id)})"><i class="fas fa-check"></i> Tamamla</button></td>
                        </tr>
                    `;
                });
            }
        }

        const gecmisRes = await fetch(`${API_URL}/admin/siparisler?sayfa=${gecmisSiparisMevcutSayfa}&limit=${sayfaBasinaKayitSayisi}&tur=gecmis${aramaParam}`, {
            headers: { 'Authorization': `Bearer ${tokenGetir()}` } 
        });
        const gecmisVeri = await gecmisRes.json();
        if (istekNo !== siparisIstekNo) return;
        gecmisSiparisToplamSayfa = gecmisVeri.toplamSayfa || 1;
        const gecmisSiparisler = gecmisVeri.siparisler || [];
        const gecmisTablo = document.getElementById('gecmis-siparisler-body');

        if (gecmisTablo) {
            gecmisTablo.innerHTML = '';
            if (gecmisSiparisler.length === 0) {
                gecmisTablo.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">' + (aramaVar ? 'Aramaya uygun geçmiş sipariş bulunamadı.' : 'Geçmiş sipariş bulunmuyor.') + '</td></tr>';
            } else {
                gecmisSiparisler.forEach(siparis => {
                    const tarih = new Date(siparis.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    gecmisTablo.innerHTML += `
                        <tr>
                            <td><strong>${escapeHtml(siparis.siparis_kodu)}</strong></td>
                            <td>${musteriGosterimOlustur(siparis)}</td>
                            <td>${tarih}</td>
                            <td>${escapeHtml(siparis.urunler || 'Ürün detayı yok')}</td>
                            <td><strong>${escapeHtml(siparis.toplam_tutar)} TL</strong></td>
                            <td class="text-center"><span style="color: var(--success);"><i class="fas fa-check-double"></i> ${escapeHtml(siparis.durum)}</span></td>
                            <td class="text-center"><button class="btn-danger" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;" onclick="siparisSil(${Number(siparis.id)})"><i class="fas fa-trash"></i> Kalıcı Sil</button></td>
                        </tr>
                    `;
                });
            }
        }

        const bilgi = document.getElementById('siparisAramaBilgi');
        if (bilgi) {
            bilgi.textContent = aramaVar
                ? `"${siparisAramaKelimesi}" için: ${aktifVeri.toplamSiparis || 0} aktif, ${gecmisVeri.toplamSiparis || 0} geçmiş sipariş bulundu.`
                : '';
        }
    } catch (error) {
        console.error("Siparişler çekilirken hata oluştu:", error);
    }
}

window.aktifSiparisSayfaDegistir = function(yon) {
    if (yon === 'ileri' && aktifSiparisMevcutSayfa < aktifSiparisToplamSayfa) {
        aktifSiparisMevcutSayfa++;
    } else if (yon === 'geri' && aktifSiparisMevcutSayfa > 1) {
        aktifSiparisMevcutSayfa--;
    }
    siparisleriYukle();
};

window.gecmisSiparisSayfaDegistir = function(yon) {
    if (yon === 'ileri' && gecmisSiparisMevcutSayfa < gecmisSiparisToplamSayfa) {
        gecmisSiparisMevcutSayfa++;
    } else if (yon === 'geri' && gecmisSiparisMevcutSayfa > 1) {
        gecmisSiparisMevcutSayfa--;
    }
    siparisleriYukle();
};

window.siparisiTamamla = async function(siparisId) {
    const onay = confirm("Bu siparişi tamamlandı olarak işaretlemek istediğinize emin misiniz?");
    if (!onay) return; 
    try {
        const response = await fetch(`${API_URL}/admin/siparis-tamamla`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenGetir()}`
            },
            body: JSON.stringify({ id: siparisId }) 
        });

        if (response.ok) {
            alert("Sipariş başarıyla tamamlandı!");
            siparisleriYukle(); 
        } else {
            alert("Siparişi güncellerken bir sorun oluştu.");
        }
    } catch (error) {
        console.error("Sipariş tamamlama hatası:", error);
        alert("Bağlantı hatası yaşandı!");
    }
};

window.siparisSil = async function(siparisId) {
    const onay = confirm("Bu geçmiş siparişi veri tabanından KALICI olarak silmek istediğinize emin misiniz?");
    if (!onay) return;
    try {
        const response = await fetch(`${API_URL}/admin/siparisler/${siparisId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokenGetir()}` }
        });
        const veri = await response.json();
        if (response.ok) {
            alert("Sipariş veri tabanından başarıyla temizlendi! 🗑️");
            siparisleriYukle(); 
        } else {
            alert("Hata: " + (veri.hata || "Sipariş silinirken bir sorun oluştu."));
        }
    } catch (error) {
        console.error("Silme işlemi sırasında hata:", error);
        alert("Sunucuyla bağlantı kurulamadı!");
    }
};
async function urunleriYukle(sayfaNumarasi = 1) {
    try {
        urunMevcutSayfa = sayfaNumarasi;
        const url = `${API_URL}/admin/urunler?sayfa=${urunMevcutSayfa}&limit=${sayfaBasinaUrunSayisi}&arama=${encodeURIComponent(urunAramaKelimesi)}`;  
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${tokenGetir()}` }
        });
        const veri = await response.json(); 
        tumUrunlerHafizasi = veri.urunler || []; 
        const urunSayisiKutusu = document.getElementById('toplamUrunSayisi');
        if (urunSayisiKutusu && veri.toplamUrun !== undefined) {
            urunSayisiKutusu.innerText = veri.toplamUrun;
        }
        urunleriEkranaBas(tumUrunlerHafizasi);
        sayfalamaButonlariniOlustur(veri.toplamSayfa || 1);
    } catch (error) {
        console.error("Ürünler çekilirken hata oluştu:", error);
    }
}

function urunleriEkranaBas(urunler) {
    const urunListesi = document.getElementById('adminUrunListesi');
    if (!urunListesi) return;
    urunListesi.innerHTML = ''; 
    if (urunler.length === 0) {
        urunListesi.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px;">Aradığınız kriterlere uygun ürün bulunamadı.</td></tr>`;
        return;
    }
    urunler.forEach(urun => {
        const fiyatGosterimi = (urun.fiyat > 0) 
            ? `<strong>${escapeHtml(urun.fiyat)} TL</strong>` 
            : `<span style="color: #e53935; font-weight: 500;">Fiyat Sorunuz</span>`;
        const resimSrc = urun.resim.startsWith('http') ? urun.resim : `${BACKEND_URL}${urun.resim}`;
        const satir = `
            <tr>
                <td class="text-center"><img src="${escapeHtml(resimSrc)}" alt="${escapeHtml(urun.baslik)}" class="admin-prod-thumb"></td>
                <td><strong>${escapeHtml(urun.baslik)}</strong></td>
                <td>${escapeHtml(urun.kategori)}</td>
                <td>${escapeHtml(urun.tip || '-')}</td>
                <td>${fiyatGosterimi}</td>
                <td class="text-center">
                    <button class="btn-success" style="background-color: #008cff;" onclick="urunDuzenle(${Number(urun.id)})"><i class="fas fa-edit"></i> Düzenle</button>
                    <button class="btn-danger" onclick="urunSil(${Number(urun.id)})"><i class="fas fa-trash-alt"></i> Sil</button>
                </td>
            </tr>
        `;
        urunListesi.innerHTML += satir;
    });
}

function sayfalamaButonlariniOlustur(toplamSayfa) {
    const paginationContainer = document.getElementById('urunPagination');
    if (!paginationContainer) return;

    paginationContainer.innerHTML = '';
    if (toplamSayfa <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn';
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.disabled = urunMevcutSayfa === 1;
    prevBtn.onclick = () => {
        if (urunMevcutSayfa > 1) {
            urunleriYukle(urunMevcutSayfa - 1);
        }
    };
    paginationContainer.appendChild(prevBtn);

    for (let i = 1; i <= toplamSayfa; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `pagination-btn ${urunMevcutSayfa === i ? 'active' : ''}`;
        pageBtn.innerText = i;
        pageBtn.onclick = () => {
            urunleriYukle(i);
        };
        paginationContainer.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn';
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.disabled = urunMevcutSayfa === toplamSayfa;
    nextBtn.onclick = () => {
        if (urunMevcutSayfa < toplamSayfa) {
            urunleriYukle(urunMevcutSayfa + 1);
        }
    };
    paginationContainer.appendChild(nextBtn);
}
window.urunSil = async function(id) {
    if (!confirm("Bu ürünü tamamen silmek istediğinize emin misiniz? Bu işlem geri alınamaz!")) return;
    try {
        const response = await fetch(`${API_URL}/admin/urunler/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokenGetir()}` }
        });
        if (response.ok) {
            alert("Ürün başarıyla silindi!");
            urunleriYukle(urunMevcutSayfa); 
        } else {
            alert("Silme işlemi sırasında bir hata oluştu.");
        }
    } catch (error) {
        console.error("Silme hatası:", error);
        alert("Sunucuya bağlanılamadı.");
    }
};

window.urunDuzenle = function(id) {
    const urun = tumUrunlerHafizasi.find(u => u.id === id);
    if (!urun) return;
    document.getElementById('editUrunId').value = urun.id; 
    document.getElementById('urunBaslik').value = urun.baslik;
    document.getElementById('urunKategori').value = urun.kategori;
    document.getElementById('urunTip').value = urun.tip || '';
    document.getElementById('urunFiyat').value = urun.fiyat || '';
    document.getElementById('urunAciklama').value = urun.aciklama || '';
    document.getElementById('modalBaslik').innerText = "Ürünü Düzenle";
    if(document.getElementById('mevcutResimNotu')) document.getElementById('mevcutResimNotu').style.display = 'block';
    if(document.getElementById('resimZorunluNotu')) document.getElementById('resimZorunluNotu').style.display = 'none';
    filtreOnerileriniYukle();
    document.getElementById('urunModal').classList.add('open');
};
async function filtreOnerileriniYukle() {
    try {
        const response = await fetch(`${API_URL}/admin/benzersiz-filtreler`, {
            headers: { 'Authorization': `Bearer ${tokenGetir()}` }
        });
        const veri = await response.json();
        const kategoriDatalist = document.getElementById('kategoriListesi');
        const tipDatalist = document.getElementById('tipListesi');
        if (kategoriDatalist && veri.kategoriler) {
            kategoriDatalist.innerHTML = veri.kategoriler.map(kat => `<option value="${escapeHtml(kat)}">`).join('');
        }
        if (tipDatalist && veri.tipler) {
            tipDatalist.innerHTML = veri.tipler.map(tip => `<option value="${escapeHtml(tip)}">`).join('');
        }
    } catch (error) {
        console.error("Filtre önerileri yüklenirken hata:", error);
    }
}
window.urunModalAc = function() {
    const urunModal = document.getElementById('urunModal');
    const urunFormu = document.getElementById('urunFormu');
    if (urunModal) {
        if (urunFormu) urunFormu.reset(); 
        const editIdInput = document.getElementById('editUrunId');
        if (editIdInput) editIdInput.value = ""; 
        const modalBaslik = document.getElementById('modalBaslik');
        if (modalBaslik) modalBaslik.innerText = "Yeni Ürün Ekle";
        if(document.getElementById('mevcutResimNotu')) document.getElementById('mevcutResimNotu').style.display = 'none';
        if(document.getElementById('resimZorunluNotu')) document.getElementById('resimZorunluNotu').style.display = 'inline';
        filtreOnerileriniYukle(); 
        urunModal.classList.add('open'); 
    }
};

window.urunModalKapat = function() {
    const urunModal = document.getElementById('urunModal');
    if (urunModal) {
        urunModal.classList.remove('open');
    }
};
document.addEventListener("DOMContentLoaded", () => {
    siparisleriYukle();
    urunleriYukle(); 
    if (typeof indirimKutulariniYukle === 'function') indirimKutulariniYukle();
    const siparisAraInput = document.getElementById('siparisAraInput');
    const siparisAramaTemizle = document.getElementById('siparisAramaTemizle');
    if (siparisAraInput) {
        let siparisAramaZamanlayici = null;
        const siparisAramasiniUygula = () => {
            siparisAramaKelimesi = siparisAraInput.value.trim();
            aktifSiparisMevcutSayfa = 1;
            gecmisSiparisMevcutSayfa = 1;
            if (siparisAramaTemizle) siparisAramaTemizle.style.display = siparisAramaKelimesi ? 'inline-flex' : 'none';
            siparisleriYukle();
        };
        siparisAraInput.addEventListener('input', () => {
            clearTimeout(siparisAramaZamanlayici);
            siparisAramaZamanlayici = setTimeout(siparisAramasiniUygula, 350);
        });
        if (siparisAramaTemizle) {
            siparisAramaTemizle.addEventListener('click', () => {
                siparisAraInput.value = '';
                siparisAramasiniUygula();
                siparisAraInput.focus();
            });
        }
    }

    const urunAraInput = document.getElementById('urunAraInput');
    if (urunAraInput) {
        urunAraInput.addEventListener('input', (e) => {
            urunAramaKelimesi = e.target.value.toLocaleUpperCase('tr-TR').trim();
            urunleriYukle(1); 
        });
    }

    const urunFormu = document.getElementById('urunFormu');
    if (urunFormu) {
        urunFormu.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            const editId = document.getElementById('editUrunId').value;
            const resimGiris = document.getElementById('urunResim');
            if (!editId && (!resimGiris || resimGiris.files.length === 0)) {
                alert("Lütfen bir ürün fotoğrafı seçin!");
                return;
            }
            const kargoPaketi = new FormData();
            kargoPaketi.append('baslik', document.getElementById('urunBaslik').value);
            kargoPaketi.append('kategori', document.getElementById('urunKategori').value.trim().toLocaleUpperCase('tr-TR'));
            kargoPaketi.append('tip', document.getElementById('urunTip').value.trim().toLocaleUpperCase('tr-TR'));
            kargoPaketi.append('fiyat', document.getElementById('urunFiyat').value || 0);
            kargoPaketi.append('aciklama', document.getElementById('urunAciklama').value);
            if (resimGiris && resimGiris.files.length > 0) {
                kargoPaketi.append('resim', await resmiKucult(resimGiris.files[0]));
            }
            try {
                const url = editId ? `${API_URL}/admin/urunler/${editId}` : `${API_URL}/admin/urun-ekle`;
                const method = editId ? 'PUT' : 'POST';

                const response = await fetch(url, {
                    method: method,
                    headers: { 'Authorization': `Bearer ${tokenGetir()}` },
                    body: kargoPaketi 
                });

                const veri = await response.json();

                if (response.ok) {
                    alert(editId ? "Ürün başarıyla güncellendi! 🎉" : "Ürün başarıyla dükkana eklendi! 🎉");
                    window.urunModalKapat(); 
                    urunleriYukle(urunMevcutSayfa); 
                } else {
                    alert("Hata: " + (veri.hata || "İşlem yapılırken bir sorun oluştu."));
                }
            } catch (error) {
                console.error("Kayıt hatası:", error);
                alert("Sunucuyla bağlantı kurulamadı!");
            }
        });
    }
});
window.kullanicilarYukle = async function() {
    const tabloGövde = document.getElementById('kullanicilarTabloGövde');
    if (!tabloGövde) return;
    tabloGövde.innerHTML = '<tr><td colspan="6" style="text-align:center;">Müşteri listesi yükleniyor...</td></tr>';
    
    try {
        const response = await fetch(`${API_URL}/admin/kullanicilar?sayfa=${kullaniciMevcutSayfa}&limit=${sayfaBasinaKayitSayisi}`, {
            headers: { 'Authorization': `Bearer ${tokenGetir()}` } 
        });
        
        const veri = await response.json();
        
        if (!response.ok) {
            throw new Error(veri.hata || "Kullanıcılar alınamadı");
        }

        const kullanicilar = veri.kullanicilar || veri; 

        if (!kullanicilar || kullanicilar.length === 0) {
            tabloGövde.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Henüz kayıtlı üye bulunmuyor.</td></tr>';
            return;
        }
        
        tabloGövde.innerHTML = ''; 
        
        kullanicilar.forEach(user => {
            const kayitTarihi = new Date(user.kayit_tarihi).toLocaleDateString('tr-TR', {
                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const satir = `
                <tr>
                    <td class="text-center"><strong>#${Number(user.id)}</strong></td>
                    <td>${escapeHtml(user.isim)}</td>
                    <td><a href="mailto:${escapeHtml(user.eposta)}">${escapeHtml(user.eposta)}</a></td>
                    <td class="text-center"><a href="tel:${escapeHtml(user.telefon)}">${escapeHtml(user.telefon)}</a></td>
                    <td class="text-center text-muted-small">${kayitTarihi}</td>
                    <td class="text-center">
                        <button class="btn-danger" data-isim="${escapeHtml(user.isim)}" onclick="kullaniciSil(${Number(user.id)}, this.dataset.isim)" style="padding:6px 12px; border-radius:4px;">
                            <i class="fas fa-user-slash"></i> Sil
                        </button>
                    </td>
                </tr>
            `;
            tabloGövde.insertAdjacentHTML('beforeend', satir);
        });
    } catch (error) {
        console.error("Kullanıcılar çekilirken hata:", error);
        tabloGövde.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#e53935;">Hata: ${escapeHtml(error.message)}</td></tr>`;
    }
};

window.kullaniciSil = async function(id, isim) {
    const onay = confirm(`"${isim}" isimli müşterinin kaydını tamamen silmek istediğinize emin misiniz?\nBu işlem geri alınamaz!`);
    if (!onay) return;
    try {
        const response = await fetch(`${API_URL}/admin/kullanicilar/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokenGetir()}` }
        });
        const sonuc = await response.json();
        if (response.ok && sonuc.success) {
            alert(sonuc.mesaj);
            kullanicilarYukle(); 
        } else {
            alert(sonuc.hata || "Kullanıcı silinemedi.");
        }
    } catch (error) {
        console.error(error);
        alert("Bağlantı hatası! Kullanıcı silinemedi.");
    }
};

window.kullaniciSayfaDegistir = function(yon) {
    if (yon === 'ileri') {
        kullaniciMevcutSayfa++;
    } else if (yon === 'geri' && kullaniciMevcutSayfa > 1) {
        kullaniciMevcutSayfa--;
    }
    kullanicilarYukle();
};
window.ayarlariGetir = async function() {
    try {
        const response = await fetch(`${API_URL}/ayarlar`);
        if (response.ok) {
            const data = await response.json();
            if (data) {
                if (document.getElementById('ayarTel1')) document.getElementById('ayarTel1').value = data.telefon1 || data.telefon || '';
                if (document.getElementById('ayarTel2')) document.getElementById('ayarTel2').value = data.telefon2 || '';

                if (document.getElementById('heroBaslikInput')) document.getElementById('heroBaslikInput').value = data.hero_baslik || '';
                if (document.getElementById('heroAltMetinInput')) document.getElementById('heroAltMetinInput').value = data.hero_alt_metin || '';

                const onizlemeAlani = document.getElementById('heroResimOnizleme');
                if (onizlemeAlani) {
                    if (data.hero_resim) {
                        const resimUrl = data.hero_resim.startsWith('http') ? data.hero_resim : `${BACKEND_URL}${data.hero_resim}`;
                        onizlemeAlani.innerHTML = `
                            <p style="font-size: 13px; font-weight: 600; margin-bottom: 5px; color: var(--gold);">Mevcut Arka Plan Görseli:</p>
                            <img src="${escapeHtml(resimUrl)}" alt="Hero Arka Plan" style="max-width: 100%; max-height: 180px; border-radius: 8px; border: 1px solid #444; object-fit: cover;">
                        `;
                    } else {
                        onizlemeAlani.innerHTML = `<p style="font-size: 12px; color: var(--text-muted);">Henüz özel bir arka plan resmi yüklenmedi.</p>`;
                    }
                }
            }
        }
    } catch (error) {
        console.error("Ayarlar çekilemedi:", error);
    }
};

const heroFormu = document.getElementById('heroFormu');
if (heroFormu) {
    heroFormu.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData();
        const baslikInput = document.getElementById('heroBaslikInput')?.value || '';
        const altMetinInput = document.getElementById('heroAltMetinInput')?.value || '';
        
        formData.append('hero_baslik', baslikInput);
        formData.append('hero_alt_metin', altMetinInput);

        const heroResimDosyasi = document.getElementById('heroResimInput')?.files[0];
        if (heroResimDosyasi) {
            formData.append('hero_resim', await resmiKucult(heroResimDosyasi, 2400));
        }

        const btn = heroFormu.querySelector('button[type="submit"]');
        const orjinalIcerik = btn.innerHTML;

        try {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Kaydediliyor...';
            btn.disabled = true;

            const response = await fetch(`${API_URL}/admin/ayarlar`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${tokenGetir()}` 
                },
                body: formData
            });

            const veri = await response.json();

            if (response.ok) {
                alert("Ana sayfa Hero alanı başarıyla güncellendi! ✨");
                ayarlariGetir(); 
                if (document.getElementById('heroResimInput')) {
                    document.getElementById('heroResimInput').value = '';
                }
            } else {
                alert("Hata: " + (veri.hata || "Ayarlar güncellenemedi."));
            }
        } catch (error) {
            console.error("Ayar kaydedilirken hata:", error);
            alert("Sunucuya bağlanılamadı.");
        } finally {
            btn.innerHTML = orjinalIcerik;
            btn.disabled = false;
        }
    });
}

const telefonFormu = document.getElementById('telefonFormu');
if (telefonFormu) {
    telefonFormu.addEventListener('submit', async (e) => {
        e.preventDefault();

        const tel1 = document.getElementById('ayarTel1').value.trim();
        const tel2 = document.getElementById('ayarTel2').value.trim();

        const formData = new FormData();
        formData.append('telefon1', tel1);
        formData.append('telefon2', tel2);

        const btn = telefonFormu.querySelector('button[type="submit"]');
        const orjinalIcerik = btn.innerHTML;

        try {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Kaydediliyor...';
            btn.disabled = true;

            const response = await fetch(`${API_URL}/admin/ayarlar`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${tokenGetir()}` 
                },
                body: formData
            });

            const veri = await response.json();

            if (response.ok) {
                alert("İletişim numaraları başarıyla kaydedildi! 📞");
            } else {
                alert("Hata: " + (veri.hata || "Numaralar kaydedilemedi."));
            }
        } catch (error) {
            console.error("Numaralar kaydedilirken hata:", error);
            alert("Sunucuya bağlanılamadı.");
        } finally {
            btn.innerHTML = orjinalIcerik;
            btn.disabled = false;
        }
    });
}
const KAMPANYA_MAKS_KUTU = 12;
const KAMPANYA_GRUP_BOYUTU = 3;
let kampanyaKutulariHafizasi = []; // en son sunucudan gelen kutu_no -> kutu verisi

window.indirimKutulariniYukle = async function() {
    const container = document.getElementById('indirimKutulariContainer');
    if (!container) return;

    try {
        const response = await fetch(`${API_URL}/indirim-kutulari`);
        const kutular = await response.json();
        kampanyaKutulariHafizasi = Array.isArray(kutular) ? kutular : [];
        kampanyaGrupHalindeCiz();
    } catch (err) {
        console.error("Kutular yüklenirken hata:", err);
        container.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding: 30px;">Kampanyalar yüklenirken bir hata oluştu.</p>';
    }
};
function kampanyaGorunecekGrupSayisi() {
    const doluNolar = kampanyaKutulariHafizasi
        .filter(k => !!k.baslik)
        .map(k => parseInt(k.kutu_no));

    const enBuyukDoluGrup = doluNolar.length > 0
        ? Math.ceil(Math.max(...doluNolar) / KAMPANYA_GRUP_BOYUTU)
        : 0;

    const toplamGrup = KAMPANYA_MAKS_KUTU / KAMPANYA_GRUP_BOYUTU;
    return Math.min(enBuyukDoluGrup + (enBuyukDoluGrup < toplamGrup ? 1 : 0) || 1, toplamGrup);
}

function kampanyaGrupHalindeCiz() {
    const container = document.getElementById('indirimKutulariContainer');
    container.innerHTML = '';

    const gosterilecekGrupSayisi = kampanyaGorunecekGrupSayisi();

    for (let grup = 1; grup <= gosterilecekGrupSayisi; grup++) {
        container.appendChild(kampanyaGrubuOlustur(grup));
    }

    kampanyaEkleButonuGuncelle();
}

function kampanyaGrubuOlustur(grupNo) {
    const baslangicNo = (grupNo - 1) * KAMPANYA_GRUP_BOYUTU + 1;
    const bitisNo = grupNo * KAMPANYA_GRUP_BOYUTU;

    const grupWrapper = document.createElement('div');
    grupWrapper.className = 'kampanya-grup';
    grupWrapper.style.cssText = 'grid-column: 1 / -1; margin-bottom: 10px;';

    const grupIcindeDoluVar = kampanyaKutulariHafizasi.some(k => {
        const no = parseInt(k.kutu_no);
        return no >= baslangicNo && no <= bitisNo && !!k.baslik;
    });

    grupWrapper.innerHTML = `
        <div class="kampanya-grup-baslik" style="display:flex; justify-content:space-between; align-items:center; margin: 20px 0 12px 0; padding-bottom: 8px; border-bottom: 1px dashed rgba(197,160,89,0.35);">
            <h3 style="margin:0; font-size:16px; color: var(--gold);">
                <i class="fas fa-layer-group"></i> ${grupNo}. Grup (Kampanya ${baslangicNo}-${bitisNo})
            </h3>
            ${grupIcindeDoluVar
                ? `<button type="button" class="btn-danger" style="padding:5px 12px; font-size:12px;" onclick="kampanyaGrubunuKaldir(${grupNo})"><i class="fas fa-trash"></i> Bu Grubu Kaldır</button>`
                : ''}
        </div>
        <div class="indirim-kutulari-grid" id="kampanyaGrupIcerik-${grupNo}"></div>
    `;

    const icerikAlani = grupWrapper.querySelector(`#kampanyaGrupIcerik-${grupNo}`);
    for (let no = baslangicNo; no <= bitisNo; no++) {
        const kutu = kampanyaKutulariHafizasi.find(k => parseInt(k.kutu_no) === no) || { kutu_no: no };
        icerikAlani.appendChild(kutuKartiOlustur(kutu, no));
    }

    return grupWrapper;
}
function kampanyaEkleButonuGuncelle() {
    const buton = document.querySelector('button[onclick="yeniKampanyaKutusuEkle()"]');
    if (!buton) return;
    const doluSayisi = kampanyaKutulariHafizasi.filter(k => !!k.baslik).length;
    if (doluSayisi >= KAMPANYA_MAKS_KUTU) {
        buton.disabled = true;
        buton.style.opacity = '0.5';
        buton.style.cursor = 'not-allowed';
        buton.innerHTML = `<i class="fas fa-check"></i> Maksimum Kampanya Sayısına Ulaşıldı (12/12)`;
    } else {
        buton.disabled = false;
        buton.style.opacity = '1';
        buton.style.cursor = 'pointer';
        buton.innerHTML = `<i class="fas fa-plus"></i> Yeni Kampanya Grubu Ekle (+3)`;
    }
}
window.yeniKampanyaKutusuEkle = function() {
    const doluSayisi = kampanyaKutulariHafizasi.filter(k => !!k.baslik).length;
    if (doluSayisi >= KAMPANYA_MAKS_KUTU) {
        alert("En fazla 12 kampanyalı ürün ekleyebilirsiniz. Yeni eklemek için önce bir grubu kaldırın.");
        return;
    }
    kampanyaGrupHalindeCiz();

    const yeniGrupNo = kampanyaGorunecekGrupSayisi();
    const hedefElement = document.getElementById(`kampanyaGrupIcerik-${yeniGrupNo}`);
    if (hedefElement) hedefElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
window.kampanyaGrubunuKaldir = async function(grupNo) {
    const baslangicNo = (grupNo - 1) * KAMPANYA_GRUP_BOYUTU + 1;
    const bitisNo = grupNo * KAMPANYA_GRUP_BOYUTU;

    if (!confirm(`${grupNo}. grubu (Kampanya ${baslangicNo}-${bitisNo}) tamamen kaldırmak istediğinize emin misiniz?`)) return;

    try {
        for (let no = baslangicNo; no <= bitisNo; no++) {
            await fetch(`${API_URL}/admin/indirim-kutulari/${no}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${tokenGetir()}` }
            });
        }
        alert("Grup başarıyla kaldırıldı.");
        indirimKutulariniYukle();
    } catch (error) {
        console.error("Grup silme hatası:", error);
        alert("Grup kaldırılırken bir hata oluştu.");
    }
};

function kutuKartiOlustur(kutu, kutuNo) {
    const div = document.createElement('div');
    div.className = 'kutu-kart';

    const urunVar = !!kutu.baslik;

    let resimSrc = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23ddd'/%3E%3C/svg%3E";
    if (urunVar && kutu.resim) {
        resimSrc = kutu.resim.startsWith('http') ? kutu.resim : `${BACKEND_URL}${kutu.resim}`;
    }

    div.innerHTML = `
        <div class="kutu-baslik" style="display: flex; justify-content: space-between; align-items: center;">
            <span>KAMPANYA ${kutuNo}</span>
            <span class="kutu-durum-rozet ${urunVar ? 'dolu' : 'bos'}">
                ${urunVar ? 'Aktif' : 'Boş'}
            </span>
        </div>

        <div class="kutu-onizleme">
            <img src="${escapeHtml(resimSrc)}" alt="Önizleme">
            <div class="kutu-onizleme-bilgi">
                <h4>${urunVar ? escapeHtml(kutu.baslik) : 'Bu Kutu Boş'}</h4>
                <p>${urunVar ? `${escapeHtml(kutu.fiyat)} TL - ${escapeHtml(kutu.kategori)}${kutu.tip ? ' / ' + escapeHtml(kutu.tip) : ''}` : 'Aşağıdaki formu doldurup ekleyin.'}</p>
            </div>
        </div>

        <form class="kutu-form" onsubmit="kutuKaydet(event, ${kutuNo})">
            <div class="form-group">
                <label>Ürün Başlığı *</label>
                <input type="text" id="kutu-baslik-${kutuNo}" value="${escapeHtml(kutu.baslik)}" required oninput="this.value = this.value.toLocaleUpperCase('tr-TR')">
            </div>
            <div class="form-group">
                <label>Kategori *</label>
                <input type="text" id="kutu-kategori-${kutuNo}" value="${escapeHtml(kutu.kategori)}" required oninput="this.value = this.value.toLocaleUpperCase('tr-TR')" placeholder="Var olan kategoriyle aynı yazarsan oraya eklenir, farklı yazarsan yeni kategori açılır">
            </div>
            <div class="form-group">
                <label>Seri / Koleksiyon (Tip)</label>
                <input type="text" id="kutu-tip-${kutuNo}" value="${escapeHtml(kutu.tip)}" oninput="this.value = this.value.toLocaleUpperCase('tr-TR')" placeholder="Var olan seriyle aynı yazarsan oraya eklenir, farklı yazarsan yeni seri açılır">
            </div>
            <div class="form-group">
                <label>Fiyat (TL)</label>
                <input type="number" step="0.01" id="kutu-fiyat-${kutuNo}" value="${escapeHtml(kutu.fiyat || '')}">
            </div>
            <div class="form-group">
                <label>Görsel${urunVar ? ' (boş bırakırsan mevcut görsel kalır)' : ' *'}</label>
                <input type="file" id="kutu-resim-${kutuNo}" accept="image/*" class="file-input" ${urunVar ? '' : 'required'}>
                <input type="hidden" id="kutu-mevcut-resim-${kutuNo}" value="${escapeHtml(kutu.resim)}">
                <input type="hidden" id="kutu-urun-id-${kutuNo}" value="${urunVar ? escapeHtml(kutu.urun_id) : ''}">
            </div>
            <button type="submit" class="btn-kutu-kaydet">
                <i class="fas fa-save"></i> ${urunVar ? 'Güncelle' : 'Ekle'}
            </button>
        </form>
    `;
    return div;
}

window.kutuKaydet = async function(event, kutuNo) {
    event.preventDefault();
    const formData = new FormData();

    formData.append('kutu_no', kutuNo);
    const mevcutUrunIdAlani = document.getElementById(`kutu-urun-id-${kutuNo}`);
    if (mevcutUrunIdAlani && mevcutUrunIdAlani.value) {
        formData.append('urun_id', mevcutUrunIdAlani.value);
    }
    formData.append('baslik', document.getElementById(`kutu-baslik-${kutuNo}`).value.trim());
    formData.append('kategori', document.getElementById(`kutu-kategori-${kutuNo}`).value.trim());
    formData.append('tip', document.getElementById(`kutu-tip-${kutuNo}`).value.trim());
    formData.append('fiyat', document.getElementById(`kutu-fiyat-${kutuNo}`).value);
    formData.append('mevcut_resim', document.getElementById(`kutu-mevcut-resim-${kutuNo}`).value);

    const resimInput = document.getElementById(`kutu-resim-${kutuNo}`);
    if (resimInput && resimInput.files[0]) {
        formData.append('resim', await resmiKucult(resimInput.files[0]));
    }

    try {
        const response = await fetch(`${API_URL}/admin/indirim-kutulari/kaydet`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tokenGetir()}` },
            body: formData
        });
        const veri = await response.json();
        if (response.ok) {
            alert("İşlem başarılı! 🎉");
            indirimKutulariniYukle();
        } else {
            alert("Hata: " + (veri.hata || "İşlem yapılırken bir sorun oluştu."));
        }
    } catch (error) {
        console.error("Kutu kaydetme hatası:", error);
        alert("Kayıt sırasında beklenmeyen bir hata oluştu.");
    }
};