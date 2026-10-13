const isLocal = window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1' || 
                window.location.protocol === 'file:' || 
                window.location.hostname === '';

const API_URL = isLocal ? 'http://localhost:5000/api' : '/api';
const BACKEND_URL = isLocal ? 'http://localhost:5000' : '';

window.sistemTelefonu = "905056592723";   // sipariş (WhatsApp)
window.iletisimTelefonu = "905301445190"; // iletişim (footer)
function htmlTemizle(deger) {
    if (deger === null || deger === undefined) return '';
    return String(deger)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function jsTirnakTemizle(metin) {
    return String(metin == null ? '' : metin)
        .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/\r?\n/g, ' ');
}

function whatsappNumarasiHazirla(telefon) {
    let n = String(telefon || '').replace(/\D/g, '');
    if (n.startsWith('00')) n = n.slice(2);
    if (n.startsWith('0')) n = '9' + n;        // 0530... -> 90530...
    else if (n.length === 10) n = '90' + n;    // 530...  -> 90530...
    return n;
}
function telefonuGoruntule(numara) {
    const n = String(numara || '');
    if (/^90\d{10}$/.test(n)) return `+90 (${n.slice(2, 5)}) ${n.slice(5, 8)} ${n.slice(8, 10)} ${n.slice(10, 12)}`;
    return '+' + n;
}

function iletisimTelefonunuGuncelle() {
    const link = document.getElementById('footer-tel-link');
    const yazi = document.getElementById('footer-tel-text');
    if (link) link.href = `tel:+${window.iletisimTelefonu}`;
    if (yazi) yazi.innerText = telefonuGoruntule(window.iletisimTelefonu);
}
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => { func.apply(this, args); }, delay);
    };
}
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

async function siteAyarlariniYukle() {
    try {
        const response = await fetch(`${API_URL}/ayarlar`);
        if (response.ok) {
            const ayarlar = await response.json();
            const siparisNo = whatsappNumarasiHazirla(ayarlar.telefon1 || ayarlar.telefon);
            if (siparisNo.length >= 11) window.sistemTelefonu = siparisNo;
            const iletisimNo = whatsappNumarasiHazirla(ayarlar.telefon2 || ayarlar.telefon1 || ayarlar.telefon);
            if (iletisimNo.length >= 11) window.iletisimTelefonu = iletisimNo;
            iletisimTelefonunuGuncelle();

            if (ayarlar.hero_resim) {
                const heroSection = document.getElementById('heroSection');
                if (heroSection) {
                    let resimYolu = ayarlar.hero_resim;
                    if (!resimYolu.startsWith('http')) {
                        resimYolu = `${BACKEND_URL}${resimYolu.startsWith('/') ? '' : '/'}${resimYolu}`;
                    }
                    const tazeResimYolu = `${resimYolu}?t=${new Date().getTime()}`;
                    heroSection.style.backgroundImage = `linear-gradient(180deg, rgba(26, 22, 19, 0.35) 0%, rgba(26, 22, 19, 0.8) 100%), url('${tazeResimYolu}')`;
                    heroSection.style.backgroundSize = 'cover';
                    heroSection.style.backgroundPosition = 'center';
                }
            }
            if (ayarlar.hero_baslik) {
                const heroTitle = document.getElementById('heroTitle');
                if (heroTitle) heroTitle.innerText = ayarlar.hero_baslik;
            }
            if (ayarlar.hero_alt_metin) {
                const heroDesc = document.getElementById('heroDesc');
                if (heroDesc) heroDesc.innerText = ayarlar.hero_alt_metin;
            }
        }
    } catch (error) {
        console.error("Site ayarları yüklenemedi:", error);
    }
}
const searchInput = document.getElementById('search-input');
const searchSuggestions = document.getElementById('searchSuggestions');

if (searchInput && searchSuggestions) {
    searchSuggestions.style.cssText = 'position:absolute; top:100%; left:0; right:0; background:#fff; box-shadow:0 5px 15px rgba(0,0,0,0.1); border-radius:0 0 8px 8px; z-index:1000; max-height:350px; overflow-y:auto; display:none;';
    
    searchInput.addEventListener('input', debounce(async function() {
        const kelime = this.value.trim();
        if (kelime.length < 2) {
            searchSuggestions.style.display = 'none';
            searchSuggestions.innerHTML = '';
            return;
        }
        try {
            const response = await fetch(`${API_URL}/urun-ara?q=${encodeURIComponent(kelime)}`);
            const sonuclar = await response.json();
            if (!sonuclar || sonuclar.length === 0) {
                searchSuggestions.innerHTML = '<div style="padding: 15px; color: #888; text-align: center; font-size:14px;">Aradığınız ürün bulunamadı.</div>';
                searchSuggestions.style.display = 'block';
                return;
            }
            let htmlContent = '';
            sonuclar.forEach(urun => {
                const resimYolu = urun.resim.startsWith('http') ? urun.resim : `${BACKEND_URL}${urun.resim}`;
                const fiyatYazi = urun.fiyat > 0 ? `${urun.fiyat} TL` : 'Fiyat için iletişime geçiniz';
                htmlContent += `
                    <a href="urun-detay.html?id=${urun.id}" style="display: flex; align-items: center; gap: 15px; padding: 10px 15px; border-bottom: 1px solid #f4f4f4; text-decoration: none; color: #1a1a1a; transition: background 0.2s;">
                        <img src="${resimYolu}" alt="${htmlTemizle(urun.baslik)}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 6px; border: 1px solid #eee;">
                        <div style="flex: 1;">
                            <div style="font-size: 14px; font-weight: 500; margin-bottom: 3px;">${htmlTemizle(urun.baslik)}</div>
                            <div style="font-size: 13px; color: #c5a059; font-weight: 600;">${fiyatYazi}</div>
                        </div>
                    </a>`;
            });
            searchSuggestions.innerHTML = htmlContent;
            searchSuggestions.style.display = 'block';
        } catch (err) { console.error("Arama hatası:", err); }
    }, 300));

    document.addEventListener('click', e => {
        if (!searchInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
            searchSuggestions.style.display = 'none';
        }
    });

    searchInput.addEventListener('focus', function() {
        if (this.value.trim().length >= 2 && searchSuggestions.innerHTML !== '') {
            searchSuggestions.style.display = 'block';
        }
    });
}
let aktifKategori = '', aktifTip = '';
let vitrinMevcutSayfa = 1, vitrinYukleniyor = false, vitrinUrunlerBitti = false;

async function dinamikFiltreleriYukle() {
    try {
        const response = await fetch(`${API_URL}/admin/benzersiz-filtreler`);
        const veri = await response.json();
        const katKutusu = document.getElementById('dinamikKategorilerKutusu');

        if (katKutusu && veri.kategoriler) {
            let katHtml = `<button class="category-card active" onclick="kategoriSec('', this)"><div class="cat-icon"><i class="fas fa-layer-group"></i></div><h3>Tüm Ürünler</h3></button>`;
            veri.kategoriler.forEach(kat => {
                katHtml += `<button class="category-card" onclick="kategoriSec('${kat}', this)"><div class="cat-icon"><i class="fas fa-box-open"></i></div><h3>${kat}</h3></button>`;
            });
            katKutusu.innerHTML = katHtml;
        }

        await koleksiyonFiltreleriniYukle('');
    } catch (error) { console.error("Filtreler yüklenemedi:", error); }
}

async function koleksiyonFiltreleriniYukle(kategoriAd = '') {
    try {
        const tipKutusu = document.getElementById('dinamikTiplerKutusu');
        if (!tipKutusu) return;

        const url = kategoriAd 
            ? `${API_URL}/admin/benzersiz-filtreler?kategori=${encodeURIComponent(kategoriAd)}` 
            : `${API_URL}/admin/benzersiz-filtreler`;

        const response = await fetch(url);
        const veri = await response.json();

        if (veri && veri.tipler) {
            let tipHtml = `<button class="filter-btn active" onclick="tipSec('', this)">Tüm Koleksiyonlar</button>`;
            veri.tipler.forEach(tip => {
                if (tip && tip.trim() !== '') {
                    tipHtml += `<button class="filter-btn" onclick="tipSec('${tip}', this)">${tip}</button>`;
                }
            });
            tipKutusu.innerHTML = tipHtml;
        }
    } catch (error) {
        console.error("Koleksiyon tipleri yüklenemedi:", error);
    }
}

async function urunleriYukle(yeniSayfa = false) {
    if (vitrinYukleniyor || (vitrinUrunlerBitti && yeniSayfa)) return;
    const vitrin = document.getElementById('urunlerVitrini');
    if (!vitrin) return;

    if (!yeniSayfa) {
        vitrinMevcutSayfa = 1;
        vitrinUrunlerBitti = false;
        vitrin.innerHTML = ''; 
    }
    vitrinYukleniyor = true;

    if (yeniSayfa) {
        vitrin.insertAdjacentHTML('beforeend', '<div id="loadingScroll" style="grid-column: 1/-1; text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin" style="font-size: 24px; color: #c5a059;"></i></div>');
    }

    try {
        const url = `${API_URL}/vitrin/urunler?kategori=${encodeURIComponent(aktifKategori)}&tip=${encodeURIComponent(aktifTip)}&sayfa=${vitrinMevcutSayfa}&limit=12`;   
        const response = await fetch(url);
        const yeniUrunler = await response.json();
        const loader = document.getElementById('loadingScroll');
        if (loader) loader.remove();

        if (!yeniUrunler || yeniUrunler.length < 12) vitrinUrunlerBitti = true;

        if ((!yeniUrunler || yeniUrunler.length === 0) && !yeniSayfa) {
            vitrin.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding: 2rem; color: #888;">Bu kriterlere uygun ürün bulunamadı.</p>';
        } else if (yeniUrunler && yeniUrunler.length > 0) {
            urunleriEkranaBas(yeniUrunler, yeniSayfa);
        }
        vitrinMevcutSayfa++; 
    } catch (error) { console.error("Ürünler çekilemedi:", error); } 
    finally { vitrinYukleniyor = false; }
}

function urunleriEkranaBas(urunListesi, eklemeMi = false) {
    const vitrin = document.getElementById('urunlerVitrini');
    if (!vitrin) return;
    let htmlBuffer = '';

    urunListesi.forEach(urun => {
        const resimSrc = urun.resim.startsWith('http') ? urun.resim : `${BACKEND_URL}${urun.resim}`;
        const badgeHtml = urun.tip ? `<span class="product-badge">${htmlTemizle(urun.tip)}</span>` : '';
        const güvenliBaslik = jsTirnakTemizle(urun.baslik);
        const fiyatGosterimi = (urun.fiyat > 0) ? `${urun.fiyat} TL` : `Fiyat için iletişime geçiniz`;
        const butonHtml = `<button class="add-cart-btn" onclick="sepeteEkle(${urun.id}, '${güvenliBaslik}', ${urun.fiyat}, '${resimSrc}', 1)">Sepete Ekle</button>`;

        htmlBuffer += `
            <div class="product-card">
                ${badgeHtml}
                <a href="urun-detay.html?id=${urun.id}" style="text-decoration:none; color:inherit;">
                    <div class="product-img-container">
                        <img src="${resimSrc}" alt="${htmlTemizle(urun.baslik)}" class="product-img" loading="lazy">
                    </div>
                </a>
                <div class="product-info">
                    <a href="urun-detay.html?id=${urun.id}" style="text-decoration:none; color:inherit;">
                        <h4>${htmlTemizle(urun.baslik)}</h4>
                        <div class="product-price">${fiyatGosterimi}</div>
                    </a>
                    ${butonHtml}
                </div>
            </div>`;
    });
    eklemeMi ? vitrin.insertAdjacentHTML('beforeend', htmlBuffer) : vitrin.innerHTML = htmlBuffer;
}

window.kategoriSec = function(kategoriAd, btnElement) {
    aktifKategori = kategoriAd;
    aktifTip = '';
    
    const seciliKategoriIsmi = document.getElementById('seciliKategoriIsmi');
    if(seciliKategoriIsmi) seciliKategoriIsmi.innerText = kategoriAd || "Tüm Ürünler";
    
    document.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    
    koleksiyonFiltreleriniYukle(kategoriAd);
    urunleriYukle(false); 
};

window.tipSec = function(tipAd, btnElement) {
    aktifTip = tipAd;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    urunleriYukle(false);
};
let sepet = JSON.parse(localStorage.getItem('irsad_sepet')) || [];

function sepetSayisiniGuncelle() {
    sepet = JSON.parse(localStorage.getItem('irsad_sepet')) || [];
    sepet.forEach(u => { u.adet = parseInt(u.adet) || 1; });
    const cartBadge = document.getElementById('cartCount');
    const mobileBadge = document.querySelector('.mobile-badge');
    const toplamUrun = sepet.reduce((toplam, urun) => toplam + parseInt(urun.adet || 0), 0);
    if (cartBadge) cartBadge.innerText = toplamUrun;
    if (mobileBadge) mobileBadge.innerText = toplamUrun;
}

window.sepeteEkle = function(id, baslik, fiyat, resim, adet = 1) {
    sepet = JSON.parse(localStorage.getItem('irsad_sepet')) || [];
    sepet.forEach(u => { u.adet = parseInt(u.adet) || 1; });
    const varOlanUrun = sepet.find(urun => urun.id === id);
    sessionStorage.removeItem('irsad_son_siparis'); // yeni alışverişe başlandı
    if (varOlanUrun) varOlanUrun.adet = Math.min(varOlanUrun.adet + parseInt(adet), 99);
    else sepet.push({ id, baslik, fiyat, resim, adet: Math.min(parseInt(adet) || 1, 99) });
    
    localStorage.setItem('irsad_sepet', JSON.stringify(sepet));
    sepetSayisiniGuncelle();
    sepetiEkranaBas();
    
    if (window.location.pathname.includes('sepet.html')) sepetSayfasiniYukle();
    else showToast(`${baslik} sepete eklendi!`);
};

window.sepettenCikar = function(id) {
    sepet = JSON.parse(localStorage.getItem('irsad_sepet')) || [];
    sessionStorage.removeItem('irsad_son_siparis');
    sepet = sepet.filter(urun => urun.id !== id);
    localStorage.setItem('irsad_sepet', JSON.stringify(sepet));
    sepetSayisiniGuncelle();
    sepetiEkranaBas();
    sepetSayfasiniYukle();
};

window.adetDegistir = function(id, miktar) {
    sepet = JSON.parse(localStorage.getItem('irsad_sepet')) || [];
    const urun = sepet.find(u => u.id === id);
    if (urun) {
        urun.adet = Math.min(parseInt(urun.adet) + parseInt(miktar), 99);
        if (urun.adet <= 0) {
            sepettenCikar(id);
            return;
        }
        localStorage.setItem('irsad_sepet', JSON.stringify(sepet));
        sepetSayisiniGuncelle();
        sepetiEkranaBas();
        sepetSayfasiniYukle(); 
    }
};

function sepetiEkranaBas() {
    const liste = document.getElementById('sepetUrunListesi');
    const toplamAlan = document.getElementById('sepetToplamTutar');
    if (!liste || !toplamAlan) return;

    if (sepet.length === 0) {
        liste.innerHTML = '<div style="text-align:center; padding:2rem; color:#888;">Sepetiniz boş.</div>';
        toplamAlan.innerText = '0.00 TL';
        return;
    }
    let htmlBuffer = '', toplamTutar = 0;
    sepet.forEach(urun => {
        let urunToplam = urun.adet * urun.fiyat;
        toplamTutar += urunToplam;
        const fiyatYazi = (urun.fiyat > 0) ? `${urunToplam.toFixed(2)} TL` : 'Fiyat için iletişime geçiniz';
        htmlBuffer += `
            <div class="cart-item" style="display:flex; gap:10px; margin-bottom:10px; align-items:center;">
                <img src="${htmlTemizle(urun.resim)}" alt="${htmlTemizle(urun.baslik)}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px;">
                <div style="flex:1;">
                    <h4 style="font-size: 13px; margin:0;">${htmlTemizle(urun.baslik)}</h4>
                    <p style="margin:0; font-size:12px;">${urun.adet} x ${fiyatYazi}</p>
                </div>
                <button onclick="sepettenCikar(${urun.id})" style="background: none; border: none; color: #e53935; cursor: pointer;"><i class="fas fa-trash"></i></button>
            </div>`;
    });
    liste.innerHTML = htmlBuffer;
    toplamAlan.innerText = `${toplamTutar.toFixed(2)} TL`;
}
function sonSiparisiOku() {
    try {
        const kayit = JSON.parse(sessionStorage.getItem('irsad_son_siparis') || 'null');
        if (kayit && kayit.kod && (Date.now() - kayit.zaman) < 3 * 60 * 60 * 1000) return kayit;
    } catch (e) {  }
    return null;
}

function siparisBasariKartiGoster(son) {
    const kapsayici = document.querySelector('.cart-container');
    if (!kapsayici) return false;
    kapsayici.innerHTML = `
        <div class="order-success-card">
            <div class="order-success-icon"><i class="fas fa-check"></i></div>
            <h2>Siparişiniz Alındı!</h2>
            <p class="order-success-code">Sipariş Kodunuz: <strong>${htmlTemizle(son.kod)}</strong></p>
            <p class="order-success-text">Siparişiniz kaydedildi. Adres ve ödeme bilgileri için WhatsApp üzerinden temsilcimizle iletişime geçebilirsiniz. WhatsApp açılmadıysa aşağıdaki butonu kullanın.</p>
            <div class="order-success-actions">
                <a class="order-success-wa" href="${htmlTemizle(son.waUrl)}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> WhatsApp'ta Siparişi Tamamla</a>
                <a class="order-success-continue" href="index.html" onclick="sessionStorage.removeItem('irsad_son_siparis')"><i class="fas fa-arrow-left"></i> Alışverişe Devam Et</a>
            </div>
        </div>`;
    return true;
}

function sepetSayfasiniYukle() {
    const cartItemsList = document.getElementById('cartItemsList');
    const cartSubTotal = document.getElementById('cartSubTotal');
    const cartTotal = document.getElementById('cartTotal');
    if (!cartItemsList) return; 

    if (sepet.length === 0) {
        const sonSiparis = sonSiparisiOku();
        if (sonSiparis && siparisBasariKartiGoster(sonSiparis)) return;
        cartItemsList.innerHTML = '<p class="empty-cart-msg" style="text-align:center; padding:40px; font-size:16px; color:#666;">Sepetinizde ürün bulunmamaktadır.</p>';
        if (cartSubTotal) cartSubTotal.innerText = '0.00 TL';
        if (cartTotal) cartTotal.innerText = '0.00 TL';
        return;
    }
    let htmlBuffer = '', toplam = 0;
    sepet.forEach(urun => {
        const satirinToplami = urun.fiyat * urun.adet;
        toplam += satirinToplami;
        htmlBuffer += `
            <div class="cart-item-row" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f0e6d6; padding: 15px 0;">
                <div style="display: flex; align-items: center; gap: 15px; flex: 2;">
                    <img src="${htmlTemizle(urun.resim)}" alt="${htmlTemizle(urun.baslik)}" style="width: 70px; height: 70px; object-fit: contain; border-radius: 8px;">
                    <div>
                        <h3 style="font-size: 15px; margin: 0; color: #1a1a1a;">${htmlTemizle(urun.baslik)}</h3>
                        <span style="font-size: 13px; color: #888;">${urun.fiyat > 0 ? urun.fiyat + ' TL' : 'Fiyat için iletişime geçiniz'}</span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; flex: 1; justify-content: center;">
                    <button onclick="adetDegistir(${urun.id}, -1)" style="width:25px; height:25px; border:1px solid #c5a059; background:white; color:#c5a059; cursor:pointer; font-weight:bold;">-</button>
                    <span style="font-weight:600;">${urun.adet}</span>
                    <button onclick="adetDegistir(${urun.id}, 1)" style="width:25px; height:25px; border:1px solid #c5a059; background:white; color:#c5a059; cursor:pointer; font-weight:bold;">+</button>
                </div>
                <div style="flex: 1; text-align: right; font-weight: 600; color: #c5a059;">
                    ${satirinToplami > 0 ? satirinToplami.toFixed(2) + ' TL' : 'Fiyat için iletişime geçiniz'}
                </div>
                <div style="padding-left: 15px;">
                    <button onclick="sepettenCikar(${urun.id})" style="background:none; border:none; color:#e53935; cursor:pointer; font-size:16px;"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>`;
    });
    cartItemsList.innerHTML = htmlBuffer;
    if (cartSubTotal) cartSubTotal.innerText = `${toplam.toFixed(2)} TL`;
    if (cartTotal) cartTotal.innerText = `${toplam.toFixed(2)} TL`;
}
async function tekUrunDetayiniYukle() {
    const urlParams = new URLSearchParams(window.location.search);
    const urunId = urlParams.get('id');
    if (!urunId) return;

    const detailImage = document.getElementById('detailImage');
    const detailTitle = document.getElementById('detailTitle');
    const detailBadge = document.getElementById('detailBadge');
    const detailPrice = document.getElementById('detailPrice');
    const detailDesc = document.getElementById('detailDesc');
    const detailAddToCart = document.getElementById('detailAddToCart');
    const breadCategory = document.getElementById('breadCategory');
    const breadProduct = document.getElementById('breadProduct');

    if (!detailTitle) return; 

    try {
        const response = await fetch(`${API_URL}/urunler/${urunId}`);
        if (!response.ok) throw new Error("Ürün bulunamadı");
        const urun = await response.json();
        const resimYolu = urun.resim.startsWith('http') ? urun.resim : `${BACKEND_URL}${urun.resim}`;

        if (detailImage) detailImage.src = resimYolu;
        if (detailTitle) detailTitle.innerText = urun.baslik;
        if (urun.baslik) document.title = `${urun.baslik} | İrşad Hac ve Hediyelik`;
        
        if (breadCategory && urun.kategori) breadCategory.innerText = urun.kategori;
        if (breadProduct && urun.baslik) breadProduct.innerText = urun.baslik;

        if (detailBadge) {
            detailBadge.innerText = urun.tip || urun.kategori || '';
            detailBadge.style.display = (urun.tip || urun.kategori) ? 'inline-block' : 'none';
        }
        if (detailDesc) detailDesc.innerText = urun.aciklama || 'Bu ürün için detaylı bir açıklama eklenmemiş.';
        if (detailPrice) detailPrice.innerText = urun.fiyat > 0 ? `${urun.fiyat} TL` : 'Fiyat için iletişime geçiniz';
        
        if (detailAddToCart) {
            detailAddToCart.onclick = function(e) {
                e.preventDefault();
                const qtyInput = document.getElementById('qtyInput');
                const eklenecekAdet = qtyInput ? parseInt(qtyInput.value) : 1;
                const güvenliBaslik = jsTirnakTemizle(urun.baslik);
                window.sepeteEkle(urun.id, güvenliBaslik, urun.fiyat, resimYolu, eklenecekAdet);
            };
        }

        ilgiliUrunleriYukle(urun.kategori, urun.id);

    } catch (error) {
        console.error("Detay yüklenirken hata:", error);
        if (detailTitle) detailTitle.innerText = "Ürün Bulunamadı!";
    }
}

async function ilgiliUrunleriYukle(kategoriAd, mevcutUrunId) {
    const grid = document.getElementById('ilgiliUrunlerGrid');
    if (!grid) return;
    try {
        const url = `${API_URL}/ilgili-urunler?kategori=${encodeURIComponent(kategoriAd || '')}&mevcutId=${mevcutUrunId}&limit=10`;
        const response = await fetch(url);
        const filtrelenmisUrunler = await response.json();

        const crossSellSection = document.querySelector('.cross-sell-section');

        if (!filtrelenmisUrunler || filtrelenmisUrunler.length === 0) {
            if (crossSellSection) crossSellSection.style.display = 'none';
            return;
        } else if (crossSellSection) {
            crossSellSection.style.display = 'block';
        }

        let htmlBuffer = '';

        filtrelenmisUrunler.forEach(urun => {
            const resimSrc = urun.resim.startsWith('http') ? urun.resim : `${BACKEND_URL}${urun.resim}`;
            const fiyatGosterimi = (urun.fiyat > 0) ? `${urun.fiyat} TL` : `Fiyat için iletişime geçiniz`;
            const güvenliBaslik = jsTirnakTemizle(urun.baslik);

            htmlBuffer += `
                <div class="product-card">
                    <a href="urun-detay.html?id=${urun.id}" style="text-decoration:none; color:inherit;">
                        <div class="product-img-container">
                            <img src="${resimSrc}" alt="${htmlTemizle(urun.baslik)}" class="product-img" loading="lazy">
                        </div>
                        <div class="product-info">
                            <h4>${htmlTemizle(urun.baslik)}</h4><div class="product-price">${fiyatGosterimi}</div>
                        </div>
                    </a>
                    <div style="padding: 0 22px 22px; margin-top: auto;">
                        <button class="add-cart-btn" onclick="sepeteEkle(${urun.id}, '${güvenliBaslik}', ${urun.fiyat}, '${resimSrc}', 1)">Sepete Ekle</button>
                    </div>
                </div>`;
        });
        grid.innerHTML = htmlBuffer;
    } catch (err) {
        console.error("İlgili ürünler çekilemedi:", err);
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">Öneriler şu an yüklenemiyor.</p>';
    }
}
async function firsatUrunleriniYukle() {
    const container = document.getElementById('promoGridContainer');
    if (!container) return;

    try {
        const response = await fetch(`${API_URL}/firsat-urunleri`); 
        if (!response.ok) throw new Error("Ağ yanıtı başarısız");
        
        const urunler = await response.json();

        if (!urunler || urunler.length === 0) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: #888; padding: 20px;">Şu an için aktif fırsat ürünü bulunmuyor.</p>';
            return;
        }

        let htmlContent = '';
        urunler.forEach((urun) => {
            const resimSrc = urun.resim.startsWith('http') ? urun.resim : `${BACKEND_URL}${urun.resim}`;
            const rozet = urun.etiket || 'Özel İndirim';
            const kisaAciklama = urun.kisa_aciklama || 'Stoklarla sınırlı bu özel ürünü hemen inceleyin.';

            htmlContent += `
                <div class="promo-card" onclick="window.location.href='urun-detay.html?id=${urun.urun_id}'" style="cursor:pointer;">
                    <div class="promo-card-bg" style="background-image: url('${resimSrc}');"></div>
                    <div class="promo-card-overlay"></div>
                    <div class="promo-card-content">
                        <span class="promo-badge">${htmlTemizle(rozet)}</span>
                        <h3>${htmlTemizle(urun.baslik)}</h3>
                        <p>${htmlTemizle(kisaAciklama)}</p>
                        <span class="promo-btn">İncele <i class="fas fa-arrow-right"></i></span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = htmlContent;

    } catch (error) {
        console.error("Fırsat ürünleri yüklenirken hata:", error);
        container.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: #dc3545; padding: 20px;">Fırsat ürünleri şu an yüklenemedi.</p>';
    }
}
window.addEventListener('pageshow', function(event) {
    sepetSayisiniGuncelle(); sepetiEkranaBas();
    if (window.location.pathname.includes('sepet.html')) sepetSayfasiniYukle();
});

document.addEventListener('DOMContentLoaded', () => {
    siteAyarlariniYukle(); 
    authDurumunuKontrolEt(); sepetSayisiniGuncelle(); sepetiEkranaBas();
    dinamikFiltreleriYukle(); urunleriYukle(); sepetSayfasiniYukle();   
    tekUrunDetayiniYukle(); firsatUrunleriniYukle();

    const whatsappOrderBtn = document.getElementById('whatsappOrderBtn');
    if (whatsappOrderBtn) {
        whatsappOrderBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const sepetGuncel = JSON.parse(localStorage.getItem('irsad_sepet')) || [];
            const rol = localStorage.getItem('irsad_kullanici_rol');

            if (sepetGuncel.length === 0) { alert("Sepetiniz boş! Lütfen önce ürün ekleyiniz."); return; }
            if (!rol || rol === 'misafir' || (rol !== 'kullanici' && rol !== 'admin')) {
                alert("Sipariş oluşturabilmek için lütfen önce giriş yapınız.");
                window.location.href = "login.html?redirect=sepet&msg=siparis_gerekli";
                return;
            }
            whatsappSiparisGonder(sepetGuncel, window.sistemTelefonu);
        });
    }

    const sepetTetikleyiciler = [
        document.getElementById('cartBtn'), document.getElementById('mobileCartBtn'),       
        document.querySelector('.cart-btn'), document.querySelector('.mobile-cart-trigger')  
    ];
    sepetTetikleyiciler.forEach(element => {
        if (element) {
            element.style.cursor = 'pointer'; 
            element.onclick = function(e) { e.preventDefault(); window.location.href = 'sepet.html'; };
        }
    });

    const qtyMinus = document.getElementById('qtyMinus');
    const qtyPlus = document.getElementById('qtyPlus');
    const qtyInput = document.getElementById('qtyInput');
    
    if (qtyMinus && qtyInput) {
        qtyMinus.onclick = function(e) { e.preventDefault(); let val = parseInt(qtyInput.value) || 1; if (val > 1) qtyInput.value = val - 1; };
    }
    if (qtyPlus && qtyInput) {
        qtyPlus.onclick = function(e) { e.preventDefault(); let val = parseInt(qtyInput.value) || 1; qtyInput.value = val + 1; };
    }
    
    const sentinel = document.getElementById('scrollSentinel');
    if (sentinel) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !vitrinYukleniyor && !vitrinUrunlerBitti) {
                    urunleriYukle(true);
                }
            });
        }, { rootMargin: '300px 0px' });
        observer.observe(sentinel);
    }
});
function authDurumunuKontrolEt() {
    const rol = localStorage.getItem('irsad_kullanici_rol');
    const authBtn = document.getElementById('authBtn');
    const mobileAuthBtn = document.getElementById('mobileAuthBtn');
    const adminPanelBtn = document.getElementById('adminPanelBtn');
    const mobileAdminBtn = document.getElementById('mobileAdminBtn');
    const whatsappOrderBtn = document.getElementById('whatsappOrderBtn');

    if (rol === 'admin') {
        if (adminPanelBtn) adminPanelBtn.style.display = 'inline-flex';
        if (mobileAdminBtn) mobileAdminBtn.classList.add('admin-visible');
    } else {
        if (adminPanelBtn) adminPanelBtn.style.display = 'none';
        if (mobileAdminBtn) mobileAdminBtn.classList.remove('admin-visible');
    }

    if (rol === 'admin' || rol === 'kullanici') {
        if (authBtn) {
            authBtn.href = "#"; authBtn.innerHTML = '<i class="fas fa-user-circle"></i><span style="font-size: 13px; font-weight: 500; margin-left: 5px;">Profilim</span>';
            authBtn.onclick = function(e) { e.preventDefault(); profilModalAc(); };
        }
        if (mobileAuthBtn) {
            mobileAuthBtn.href = "#"; mobileAuthBtn.innerHTML = '<i class="fas fa-user-circle"></i> <span>Profilim</span>';
            mobileAuthBtn.onclick = function(e) { e.preventDefault(); profilModalAc(); };
        }
        if (whatsappOrderBtn) whatsappOrderBtn.innerHTML = '<i class="fab fa-whatsapp"></i> Siparişi Tamamla';
    } else {
        if (authBtn) {
            authBtn.href = "login.html"; authBtn.innerHTML = '<i class="fas fa-user"></i><span style="font-size: 13px; font-weight: 500; margin-left: 5px;">Giriş Yap</span>';
            authBtn.onclick = null; 
        }
        if (mobileAuthBtn) {
            mobileAuthBtn.href = "login.html"; mobileAuthBtn.innerHTML = '<i class="fas fa-user"></i> <span>Giriş</span>';
            mobileAuthBtn.onclick = null;
        }
        if (whatsappOrderBtn) whatsappOrderBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sipariş İçin Giriş Yapınız';
    }
}

let tumKullaniciSiparisleri = [], gosterilenSiparisSayisi = 0;
const SIPARIS_LIMIT = 10;

window.profilModalAc = async function() {
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    const yerelKullaniciVerisi = localStorage.getItem('irsad_kullanici_bilgi');
    
    if (yerelKullaniciVerisi) {
        try {
            const kullanici = JSON.parse(yerelKullaniciVerisi);
            document.getElementById('profileUserName').innerText = kullanici.isim || kullanici.ad_soyad || kullanici.ad || 'Müşteri';
            document.getElementById('profileUserEmail').innerHTML = `<i class="fas fa-envelope"></i> ${htmlTemizle(kullanici.email || kullanici.eposta || kullanici.mail || 'E-posta yok')}`;
            document.getElementById('profileUserPhone').innerHTML = `<i class="fas fa-phone"></i> ${htmlTemizle(kullanici.telefon || kullanici.tel || kullanici.phone || kullanici.telefon_no || 'Telefon yok')}`;
        } catch (e) { console.error("Profil bilgisi okunamadı:", e); }
    }

    const ordersContainer = document.getElementById('profileOrdersList');
    ordersContainer.innerHTML = '<div style="text-align:center; padding:15px; color:#888;"><i class="fas fa-spinner fa-spin"></i> Siparişler yükleniyor...</div>';
    modal.classList.add('open');

    const token = localStorage.getItem('irsad_token');

    if (!token || token === 'null') {
        ordersContainer.innerHTML = '<p style="text-align:center; color:#dc3545; font-size:13px;">Oturum süreniz dolmuş. Lütfen tekrar <a href="login.html" style="color:#c5a059; font-weight:bold;">giriş yapın</a>.</p>';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/kullanici/siparisler`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });

        if (response.status === 401) {
            ordersContainer.innerHTML = '<p style="text-align:center; color:#dc3545; font-size:13px;">Oturum süreniz dolmuş. Lütfen tekrar <a href="login.html" style="color:#c5a059; font-weight:bold;">giriş yapın</a>.</p>';
            return;
        }

        if (!response.ok) throw new Error("Siparişler çekilemedi");
        
        tumKullaniciSiparisleri = await response.json();
        gosterilenSiparisSayisi = 0; 
        
        if (!tumKullaniciSiparisleri || tumKullaniciSiparisleri.length === 0) {
            ordersContainer.innerHTML = '<p style="text-align:center; color:#888; font-size:13px; padding:10px;">Henüz verilmiş bir siparişiniz bulunmamaktadır.</p>';
            return;
        }
        ordersContainer.innerHTML = ''; 
        siparisDilimiEkranaBas(); 
    } catch (err) {
        console.error("Sipariş geçmişi yükleme hatası:", err);
        ordersContainer.innerHTML = '<p style="text-align:center; color:#dc3545; font-size:13px;">Sipariş geçmişi yüklenirken bir hata oluştu.</p>';
    }
}

function siparisDilimiEkranaBas() {
    const ordersContainer = document.getElementById('profileOrdersList');
    const eskiBtn = document.getElementById('btnDahaFazlaSiparis');
    if (eskiBtn) eskiBtn.remove();

    const sonrakiDilim = tumKullaniciSiparisleri.slice(gosterilenSiparisSayisi, gosterilenSiparisSayisi + SIPARIS_LIMIT);
    let ordersHtml = '';
    sonrakiDilim.forEach(sip => {
        const tarihFormatted = new Date(sip.tarih).toLocaleDateString('tr-TR');
        ordersHtml += `
            <div class="order-card-item">
                <div class="order-card-header"><span>Sipariş Kodu: ${htmlTemizle(sip.siparis_kodu)}</span></div>
                <div class="order-card-products">${htmlTemizle(sip.urunler || 'Ürün detayı bulunamadı.')}</div>
                <div class="order-card-footer"><span class="order-date"><i class="far fa-calendar-alt"></i> ${tarihFormatted}</span><span class="order-total">${htmlTemizle(sip.toplam_tutar)} TL</span></div>
            </div>`;
    });

    ordersContainer.insertAdjacentHTML('beforeend', ordersHtml);
    gosterilenSiparisSayisi += sonrakiDilim.length;

    const kalanSiparisSayisi = tumKullaniciSiparisleri.length - gosterilenSiparisSayisi;
    if (kalanSiparisSayisi > 0) {
        ordersContainer.insertAdjacentHTML('beforeend', `
            <div id="btnDahaFazlaSiparis" style="text-align:center; padding:10px 0;">
                <button onclick="siparisDilimiEkranaBas()" style="background:#c5a059; color:#ffffff; border:none; padding:8px 18px; border-radius:6px; cursor:pointer; font-size:13px; font-weight:500; transition: background 0.2s;">
                    <i class="fas fa-chevron-down"></i> Daha Fazlasını Göster (${kalanSiparisSayisi})
                </button>
            </div>`);
    }
}

window.profilModalKapat = function() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('open');
}

window.cikisYap = function() {
    localStorage.removeItem('irsad_kullanici_rol'); localStorage.removeItem('irsad_token');
    localStorage.removeItem('irsad_kullanici_bilgi'); localStorage.removeItem('irsad_sepet');
    profilModalKapat(); window.location.href = 'index.html';
};
const scrollTopBtn = document.getElementById("scrollTopBtn");
if (scrollTopBtn) {
    window.addEventListener("scroll", throttle(() => {
        if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
            scrollTopBtn.style.display = "flex"; scrollTopBtn.style.opacity = "1";
        } else {
            scrollTopBtn.style.display = "none"; scrollTopBtn.style.opacity = "0";
        }
    }, 150));
    scrollTopBtn.addEventListener("click", () => { window.scrollTo({ top: 0, behavior: "smooth" }); });
    scrollTopBtn.style.display = "none";
}

let siparisGonderiliyor = false;

async function whatsappSiparisGonder(sepet, whatsappTelefonNo = window.sistemTelefonu) {
    if (siparisGonderiliyor) return; // çift tıklamayla çift sipariş oluşmasını engeller

    const token = localStorage.getItem('irsad_token');
    if (!token) {
        alert("Sipariş verebilmek için lütfen giriş yapınız.");
        window.location.href = "login.html?redirect=sepet&msg=siparis_gerekli";
        return;
    }

    siparisGonderiliyor = true;
    const mobilCihaz = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    let waPencere = null;
    if (!mobilCihaz) {
        try { waPencere = window.open('', '_blank'); } catch (e) { waPencere = null; }
    }
    const pencereyiKapat = () => { try { if (waPencere && !waPencere.closed) waPencere.close(); } catch (e) {  } };

    let musteriIsmi = "Misafir Müşteri";
    try {
        const kayitliKullanici = JSON.parse(localStorage.getItem('irsad_kullanici_bilgi') || '{}');
        musteriIsmi = kayitliKullanici.isim || musteriIsmi;
    } catch (e) { console.error("LocalStorage kullanıcı verisi okunamadı:", e); }

    try {
        const response = await fetch(`${API_URL}/siparis-olustur`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ sepet: sepet.map(u => ({ id: u.id, adet: u.adet })) })
        });
        const sonuc = await response.json().catch(() => ({}));

        if (response.status === 401) {
            pencereyiKapat();
            localStorage.removeItem('irsad_token');
            localStorage.removeItem('irsad_kullanici_rol');
            localStorage.removeItem('irsad_kullanici_bilgi');
            alert("Oturum süreniz dolmuş. Lütfen tekrar giriş yapın. Sepetiniz korunmuştur.");
            window.location.href = "login.html?redirect=sepet&msg=siparis_gerekli";
            return;
        }
        if (!response.ok) {
            pencereyiKapat();
            alert("Sipariş oluşturulurken bir hata oluştu: " + (sonuc.hata || "Bilinmeyen hata"));
            return;
        }

        const urunler = Array.isArray(sonuc.urunler) ? sonuc.urunler : [];
        let urunDetaylari = "";
        urunler.forEach((u, index) => {
            const araToplam = Math.round(u.fiyat * u.adet * 100) / 100;
            const fiyatYazi = u.fiyat > 0 ? `${araToplam} TL` : 'Fiyat için görüşülecek';
            urunDetaylari += `${index + 1}. ${u.baslik} x ${u.adet} adet - ${fiyatYazi}\n`;
        });

        const waMesaj = `🛒 *YENİ SİPARİŞ (İrşad Hediyelik)*\n\n📌 *Sipariş Kodu:* ${sonuc.siparisKodu}\n👤 *Müşteri:* ${musteriIsmi}\n\n📦 *Ürünler:*\n${urunDetaylari}\n💰 *Toplam Tutar:* ${sonuc.toplamTutar} TL\n\nSiparişimi onaylamak ve adres/ödeme detaylarını iletmek istiyorum.`;
        const waUrl = `https://api.whatsapp.com/send?phone=${whatsappNumarasiHazirla(whatsappTelefonNo)}&text=${encodeURIComponent(waMesaj)}`;
        try {
            sessionStorage.setItem('irsad_son_siparis', JSON.stringify({ kod: sonuc.siparisKodu, waUrl, zaman: Date.now() }));
        } catch (e) {  }
        localStorage.removeItem('irsad_sepet');
        sepetSayisiniGuncelle(); sepetiEkranaBas();
        if (window.location.pathname.includes('sepet.html')) sepetSayfasiniYukle();
        else showToast(`Siparişiniz alındı! Sipariş kodu: ${sonuc.siparisKodu}`);

        if (urunler.length < sepet.length) {
            alert("Bazı ürünler artık satışta olmadığı için siparişe eklenmedi.");
        }
        if (waPencere && !waPencere.closed) waPencere.location.href = waUrl;
        else window.location.href = waUrl;
    } catch (error) {
        console.error("Sipariş gönderme hatası:", error);
        pencereyiKapat();
        alert("Sunucuyla bağlantı kurulamadı!");
    } finally {
        siparisGonderiliyor = false;
    }
}

function showToast(mesaj) {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = '<i class="fas fa-check-circle"></i> <span></span>';
    toast.querySelector('span').textContent = mesaj;
    toastContainer.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300); 
    }, 3000);
}