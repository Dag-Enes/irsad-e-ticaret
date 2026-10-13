require('dotenv').config();
const express = require('express');
const compression = require('compression'); 
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const mysql = require('mysql2');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');

// 🛡️ ZORUNLU AYAR KONTROLÜ: JWT_SECRET yoksa sunucu hiç açılmasın
if (!process.env.JWT_SECRET) {
    console.error('HATA: .env dosyasında JWT_SECRET tanımlı değil! Sunucu başlatılmadı.');
    process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
    console.warn('UYARI: JWT_SECRET çok kısa. En az 32 karakterlik rastgele bir değer kullanmanız önerilir.');
}

// 🚀 SHARP PERFORMANS VE BELLEK OPTİMİZASYONU
sharp.concurrency(1);
sharp.cache(false);

// 1. Sunucu Uygulaması Ayarları
const app = express();

// 🛡️ REVERSE PROXY (Nginx, Cloudflare, cPanel) ARKASINDA IP DOĞRU ALINMASI İÇİN
app.set('trust proxy', 1);


// 🚀 TÜM HTTP YANITLARINI (JSON/TEXT) OTOMATİK SIKIŞTIRMA (GZIP)
app.use(compression());

// 🛡️ HELMET (HTTP BAŞLIK GÜVENLİĞİ & GİZLİLİK)
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false
}));

// CORS Ayarlarını Yapılandırma
const corsAyarlari = {
    origin: [
        'https://irsadkitapevi.com.tr', 
        'https://www.irsadkitapevi.com.tr', 
        'https://api.irsadkitapevi.com.tr',
        'http://localhost:5000', 
        'http://127.0.0.1:5000',
        'http://localhost:5500',
        'http://127.0.0.1:5500'
    ], 
    methods: ['GET', 'POST', 'PUT', 'DELETE'], 
    allowedHeaders: ['Content-Type', 'Authorization'], 
    credentials: true
};

app.use(cors(corsAyarlari));
app.use(express.json());

// 🛡️ GENEL İSTEK SINIRI: Tek bir IP'den aşırı yoğun istek gelirse (bot / tarama) veritabanını korur.
// Normal kullanım çok altındadır; ortak internet kullanan (mobil operatör vb.) ziyaretçileri de rahatlıkla karşılar.
const genelLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    message: { hata: "Çok fazla istek gönderildi. Lütfen kısa bir süre bekleyip tekrar deneyin." },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api', genelLimiter);

// 🛡️ SİPARİŞ SPAM KORUMASI (RATE LIMITER)
const siparisLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 Dakika
    max: 5, // Aynı IP'den 1 dakikada en fazla 5 sipariş
    message: { hata: "Çok fazla sipariş denemesi yaptınız. Lütfen 1 dakika bekleyip tekrar deneyiniz." },
    standardHeaders: true,
    legacyHeaders: false
});

// 🛡️ GİRİŞ VE ŞİFRE SIFIRLAMA KORUMASI (BRUTE-FORCE RATE LIMITER)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Dakika
    max: 30, // 15 dakikada aynı IP'den en fazla 30 deneme
    message: { hata: "Çok fazla giriş veya şifre sıfırlama denemesi yaptınız. Lütfen 15 dakika sonra tekrar deneyiniz." },
    standardHeaders: true,
    legacyHeaders: false
});

// 🛡️ YENİ ÜYELİK KORUMASI: Botların veritabanını sahte üyeliklerle doldurmasını engeller
const kayitLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 Saat
    max: 10, // Aynı IP'den 1 saatte en fazla 10 yeni üyelik
    message: { hata: "Bu bağlantıdan çok fazla üyelik oluşturuldu. Lütfen daha sonra tekrar deneyiniz." },
    standardHeaders: true,
    legacyHeaders: false
});

// 🛡️ ŞİFRE SIFIRLAMA KODU İSTEME / DOĞRULAMA KORUMASI (daha sıkı)
const sifirlamaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Dakika
    max: 10, // 15 dakikada aynı IP'den en fazla 10 işlem
    message: { hata: "Çok fazla şifre sıfırlama denemesi yaptınız. Lütfen 15 dakika sonra tekrar deneyiniz." },
    standardHeaders: true,
    legacyHeaders: false
});

// Fotoğrafların kaydedileceği klasör kontrolü
const uploadsKlasoru = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsKlasoru)){
    fs.mkdirSync(uploadsKlasoru, { recursive: true });
}

// Uploads klasörünü dışa açma
// Dosya adları benzersiz olduğu için tarayıcıda uzun süre önbelleğe alınabilir
app.use('/uploads', express.static(uploadsKlasoru, { maxAge: '30d', immutable: true }));
// Public (Frontend) klasörünü dışa açma
app.use(express.static(path.join(__dirname, 'public')));

// 🛡️ GÜVENLİ DOSYA YÜKLEME AYARLARI (MULTER KOTASI VE FİLTRESİ)
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 15 * 1024 * 1024 // Maksimum 15 MB dosya boyutu sınırı
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyası (jpg, png, webp vb.) yükleyebilirsiniz!'), false);
        }
    }
});

// 2. MySQL Veritabanı Havuzu (Pool)
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Büyük siparişlerde ürün listesi MySQL varsayılan sınırında (1024 karakter) sessizce kesilmesin
db.on('connection', (baglanti) => {
    baglanti.query("SET SESSION group_concat_max_len = 16384");
});

// 3. Veritabanı Bağlantı Kontrolü
db.getConnection((err, connection) => {
    if (err) {
        console.error('Veritabanına bağlanırken hata oluştu: ' + err.stack);
        return;
    }
    console.log('MySQL Veritabanı Havuzuna (Pool) başarıyla bağlanıldı! Depo aktif.');
    connection.release();
});

// ====================================================================
// 🧰 YARDIMCI FONKSİYONLAR
// ====================================================================
const dbp = db.promise();

// ⚡ KISA SÜRELİ ÖNBELLEK: Herkesin gördüğü ve sık istenen veriler (vitrin, kategoriler, ayarlar...)
// 60 saniye bellekte tutulur; her ziyaretçi için veritabanına gidilmez.
// Admin panelinden yapılan her değişiklikte önbellek anında temizlenir, yani değişiklikler hemen görünür.
const ONBELLEK_SURESI_MS = 60 * 1000;
const ONBELLEK_MAX_KAYIT = 300;
const onbellek = new Map();

function onbellekten(anahtar) {
    const kayit = onbellek.get(anahtar);
    if (!kayit) return null;
    if (kayit.bitis < Date.now()) {
        onbellek.delete(anahtar);
        return null;
    }
    return kayit.veri;
}

function onbellegeYaz(anahtar, veri) {
    if (onbellek.size >= ONBELLEK_MAX_KAYIT) {
        onbellek.delete(onbellek.keys().next().value); // en eski kaydı at
    }
    onbellek.set(anahtar, { veri, bitis: Date.now() + ONBELLEK_SURESI_MS });
}

function onbellekTemizle() {
    onbellek.clear();
}

// 🔧 Şifre sıfırlama için gereken sütunlar yoksa açılışta otomatik eklenir (bir kez çalışır, sonra hiçbir şey yapmaz)
(async () => {
    try {
        const [kolonlar] = await dbp.query("SHOW COLUMNS FROM kullanicilar LIKE 'sifirlama_kodu'");
        if (kolonlar.length === 0) {
            await dbp.query("ALTER TABLE kullanicilar ADD COLUMN sifirlama_kodu VARCHAR(100) NULL, ADD COLUMN sifirlama_bitis DATETIME NULL, ADD COLUMN sifirlama_deneme TINYINT NOT NULL DEFAULT 0");
            console.log("✅ 'kullanicilar' tablosuna şifre sıfırlama sütunları eklendi.");
        }
    } catch (e) {
        console.error("⚠️ Şifre sıfırlama sütunları eklenemedi:", e.message);
        console.error("   Lütfen MySQL Workbench'te elle çalıştırın: ALTER TABLE kullanicilar ADD COLUMN sifirlama_kodu VARCHAR(100) NULL, ADD COLUMN sifirlama_bitis DATETIME NULL, ADD COLUMN sifirlama_deneme TINYINT NOT NULL DEFAULT 0;");
    }
})();

// Sayfa ve limit değerlerini güvenli aralıkta tutar (negatif / aşırı büyük değerleri engeller)
function sayfalamaAl(req, varsayilanLimit, maksimumLimit = 100) {
    const sayfa = Math.max(parseInt(req.query.sayfa) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || varsayilanLimit, 1), maksimumLimit);
    return { sayfa, limit };
}

// Fiyatı sayıya çevirir. Boşsa 0, geçersizse (eksi, harf vb.) null döner.
function fiyatiTemizle(deger) {
    if (deger === undefined || deger === null || String(deger).trim() === '') return 0;
    const sayi = Number(String(deger).replace(',', '.'));
    if (!Number.isFinite(sayi) || sayi < 0 || sayi > 99999999) return null;
    return Math.round(sayi * 100) / 100;
}

const buyukHarfTemizle = (deger) => String(deger || '').toLocaleUpperCase('tr-TR').trim();

// Arama kelimelerinden özel karakterleri (+ - " ( ) ~ * vb.) temizler
function aramaKelimeleriniHazirla(girdi) {
    return String(girdi || '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6)
        .map(k => k.slice(0, 40));
}

function benzersizDosyaAdi(onek) {
    return `${onek}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.webp`;
}

function dosyayiSil(yol) {
    try { if (yol && fs.existsSync(yol)) fs.unlinkSync(yol); } catch (e) { console.error('Dosya silinemedi:', e.message); }
}

function htmlKacis(metin) {
    return String(metin == null ? '' : metin)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Yüklenen resmi küçültüp WebP olarak kaydeder
async function resmiKaydet(buffer, onek, genislik, kalite) {
    const dosyaAdi = benzersizDosyaAdi(onek);
    const filePath = path.join(uploadsKlasoru, dosyaAdi);
    await sharp(buffer)
        .rotate() // telefon fotoğraflarının yan/ters görünmesini engeller (EXIF yönünü uygular)
        .resize({ width: genislik, withoutEnlargement: true })
        .webp({ quality: kalite })
        .toFile(filePath);
    return { filePath, resimYolu: '/uploads/' + dosyaAdi };
}

// ====================================================================
// 🛡️ GÜVENLİK GÖREVLİSİ (MIDDLEWARE) - TÜM ROTALARDAN ÖNCE TANIMLANDI
// ====================================================================
const tokenCozumle = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    if (!token || token === 'null' || token === 'undefined') return null;
    try {
        return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (error) {
        return null;
    }
};

// Giriş yapmış herhangi bir kullanıcı (üye veya admin). Kullanıcının hâlâ var olduğunu veritabanından doğrular.
const girisKontrol = (req, res, next) => {
    const cozulmusToken = tokenCozumle(req);
    if (!cozulmusToken) {
        return res.status(401).json({ hata: "Oturum süreniz dolmuş veya geçersiz! Lütfen tekrar giriş yapın." });
    }

    db.query("SELECT id, isim, rol FROM kullanicilar WHERE id = ? AND silindi_mi = 0", [cozulmusToken.id], (err, sonuclar) => {
        if (err) {
            console.error("Oturum doğrulama veritabanı hatası:", err);
            return res.status(500).json({ hata: "Veritabanı hatası!" });
        }
        if (sonuclar.length === 0) {
            return res.status(401).json({ hata: "Hesabınız bulunamadı veya kapatılmış. Lütfen tekrar giriş yapın." });
        }
        req.kullanici = sonuclar[0];
        next();
    });
};

// Sadece admin. Rol bilgisi token'dan değil, veritabanından okunur (rol değişirse hemen etkili olur).
const adminKontrol = (req, res, next) => {
    girisKontrol(req, res, () => {
        if (req.kullanici.rol !== 'admin') {
            return res.status(403).json({ hata: "Yetkisiz işlem: Bu alana sadece yöneticiler girebilir!" });
        }
        next();
    });
};

// ====================================================================
// VİTRİN: ID'SİNE GÖRE TEK BİR ÜRÜNÜ GETİRME API'Sİ (SOFT DELETE FİLTRELİ)
// ====================================================================
app.get('/api/urun-detay', (req, res) => {
    const urunId = req.query.id;

    if (!urunId) {
        return res.status(400).json({ hata: "Ürün ID parametresi eksik!" });
    }

    const sqlSorgusu = "SELECT * FROM urunler WHERE id = ? AND silindi_mi = 0";
    
    db.query(sqlSorgusu, [urunId], (err, sonuclar) => {
        if (err) {
            console.error("Ürün detayı çekilirken hata oluştu:", err);
            return res.status(500).json({ hata: "Veritabanı hatası!" });
        }
        
        if (sonuclar.length === 0) {
            return res.status(404).json({ hata: "Ürün bulunamadı!" });
        }

        res.json(sonuclar[0]); 
    });
});

// ====================================================================
// VİTRİN: SONSUZ KAYDIRMA (INFINITE SCROLL) İÇİN HAFİF API (SOFT DELETE FİLTRELİ + ÖNBELLEKLİ)
// ====================================================================
app.get('/api/vitrin/urunler', (req, res) => {
    const { sayfa, limit } = sayfalamaAl(req, 12, 48);
    const kategori = String(req.query.kategori || '').slice(0, 100);
    const tip = String(req.query.tip || '').slice(0, 100);

    const anahtar = `vitrin:${sayfa}:${limit}:${kategori}:${tip}`;
    const onbellekliVeri = onbellekten(anahtar);
    if (onbellekliVeri) return res.json(onbellekliVeri);

    const offset = (sayfa - 1) * limit;

    let sqlSorgusu = "SELECT id, baslik, fiyat, resim, tip FROM urunler WHERE silindi_mi = 0";
    let parametreler = [];

    if (kategori) {
        sqlSorgusu += " AND kategori = ?";
        parametreler.push(kategori);
    }

    if (tip) {
        sqlSorgusu += " AND tip = ?";
        parametreler.push(tip);
    }

    sqlSorgusu += " ORDER BY id DESC LIMIT ? OFFSET ?";
    parametreler.push(limit, offset);

    db.query(sqlSorgusu, parametreler, (err, sonuclar) => {
        if (err) {
            console.error("Vitrin ürünleri çekilirken hata:", err);
            return res.status(500).json({ hata: "Veritabanı hatası!" });
        }
        onbellegeYaz(anahtar, sonuclar);
        res.json(sonuclar);
    });
});

// ====================================================================
// VİTRİN: MÜŞTERİ SEPETİNİ SİPARİŞE DÖNÜŞTÜRME API'Sİ (TRANSACTION İLE)
// - Giriş zorunlu, kullanıcı bilgisi token'dan alınır
// - Fiyat, ürün adı ve sipariş kodu SUNUCUDA belirlenir (tarayıcıya güvenilmez)
// ====================================================================
app.post('/api/siparis-olustur', siparisLimiter, girisKontrol, async (req, res) => {
    const { sepet } = req.body || {};

    if (!Array.isArray(sepet) || sepet.length === 0) {
        return res.status(400).json({ hata: "Sepet boş!" });
    }
    if (sepet.length > 50) {
        return res.status(400).json({ hata: "Sepette en fazla 50 çeşit ürün olabilir." });
    }

    // Her ürün için id ve adet kontrolü (adet: 1-99 arası tam sayı olmalı; eksi/ondalık/aşırı büyük değerler reddedilir)
    const adetler = new Map();
    for (const kalem of sepet) {
        const id = Number(kalem && kalem.id);
        const adet = Number(kalem && kalem.adet);
        if (!Number.isInteger(id) || id < 1 || !Number.isInteger(adet) || adet < 1 || adet > 99) {
            return res.status(400).json({ hata: "Sepetteki ürün bilgileri geçersiz. Her ürünün adedi 1 ile 99 arasında olmalıdır." });
        }
        adetler.set(id, Math.min((adetler.get(id) || 0) + adet, 99));
    }

    const urunIdleri = [...adetler.keys()];
    let connection;
    try {
        // Tek bir hesabın 24 saatte en fazla 20 sipariş vermesine izin verilir (yanlışlıkla/kötü niyetle şişmeyi önler)
        const [gunlukSiparis] = await dbp.query(
            "SELECT COUNT(*) AS sayi FROM siparisler WHERE kullanici_id = ? AND tarih > DATE_SUB(NOW(), INTERVAL 1 DAY)",
            [req.kullanici.id]
        );
        if (gunlukSiparis[0] && gunlukSiparis[0].sayi >= 20) {
            return res.status(429).json({ hata: "Günlük sipariş sınırına ulaştınız. Lütfen bizimle WhatsApp üzerinden iletişime geçin." });
        }

        connection = await dbp.getConnection();
        await connection.beginTransaction();

        // Sadece satışta olan (silinmemiş) ürünler
        const [veritabaniUrunleri] = await connection.query(
            "SELECT id, fiyat, baslik FROM urunler WHERE id IN (?) AND silindi_mi = 0",
            [urunIdleri]
        );

        if (veritabaniUrunleri.length === 0) {
            await connection.rollback();
            return res.status(400).json({ hata: "Sepetinizdeki ürünler artık satışta değil. Lütfen sepetinizi güncelleyin." });
        }

        let gercekToplamTutar = 0;
        const guvenliSepet = [];
        for (const urun of veritabaniUrunleri) {
            const adet = adetler.get(Number(urun.id));
            const fiyat = parseFloat(urun.fiyat) || 0;
            gercekToplamTutar += fiyat * adet;
            guvenliSepet.push({ id: urun.id, baslik: urun.baslik, adet, fiyat });
        }
        gercekToplamTutar = Math.round(gercekToplamTutar * 100) / 100;

        // Sipariş kodunu sunucu üretir; nadiren çakışırsa yeniden dener
        let siparisKodu = null;
        let yeniSiparisId = null;
        for (let deneme = 0; deneme < 5 && !siparisKodu; deneme++) {
            const aday = 'IRSD-' + crypto.randomInt(100000, 1000000);
            try {
                const [siparisSonuc] = await connection.query(
                    "INSERT INTO siparisler (siparis_kodu, toplam_tutar, kullanici_id) VALUES (?, ?, ?)",
                    [aday, gercekToplamTutar, req.kullanici.id]
                );
                siparisKodu = aday;
                yeniSiparisId = siparisSonuc.insertId;
            } catch (e) {
                if (e.code !== 'ER_DUP_ENTRY') throw e;
            }
        }
        if (!siparisKodu) throw new Error('Benzersiz sipariş kodu üretilemedi');

        const urunlerVerisi = guvenliSepet.map(urun => [yeniSiparisId, urun.id, urun.baslik, urun.adet, urun.fiyat]);
        await connection.query(
            "INSERT INTO siparis_urunleri (siparis_id, urun_id, urun_baslik, adet, fiyat) VALUES ?",
            [urunlerVerisi]
        );
        await connection.commit();

        res.status(200).json({
            mesaj: "Sipariş güvenli bir şekilde veritabanına kaydedildi!",
            siparisKodu,
            toplamTutar: gercekToplamTutar,
            urunler: guvenliSepet
        });

    } catch (error) {
        console.error("Sipariş işlem hatası:", error);
        if (connection) {
            try { await connection.rollback(); } catch (e) { /* yoksay */ }
        }
        res.status(500).json({ hata: "Sipariş kaydedilemedi." });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// ====================================================================
// SİTE AYARLARINI GETİRME API'Sİ (HERKESE AÇIK - her sayfa açılışında istenir, bu yüzden önbellekli)
// ====================================================================
app.get('/api/ayarlar', (req, res) => {
    const onbellekliVeri = onbellekten('ayarlar');
    if (onbellekliVeri) return res.json(onbellekliVeri);

    db.query("SELECT * FROM ayarlar LIMIT 1", (err, sonuclar) => {
        if (err) {
            console.error("Site ayarları çekilirken hata:", err);
            return res.status(500).json({ hata: "Veritabanı hatası!" });
        }
        const veri = sonuclar.length === 0 ? {} : sonuclar[0];
        onbellegeYaz('ayarlar', veri);
        res.json(veri);
    });
});

// ====================================================================
// ADMIN PANELİ: SİTE AYARLARINI GÜNCELLEME (HERO RESMİ VE YAZI DESTEKLİ)
// ====================================================================
app.post('/api/admin/ayarlar', adminKontrol, upload.single('hero_resim'), async (req, res) => {
    try {
        // req.body içerisinden yeni başlık ve alt metin değerlerini de alıyoruz
        const { telefon1, telefon2, hero_baslik, hero_alt_metin } = req.body; 

        // Telefon numaraları sadece rakam, +, boşluk, parantez ve tire içerebilir
        const telefonGecerli = (t) => t === undefined || t === '' || /^[0-9+\s()\-]{7,25}$/.test(String(t));
        if (!telefonGecerli(telefon1) || !telefonGecerli(telefon2)) {
            return res.status(400).json({ hata: "Telefon numarası geçersiz! Sadece rakam, +, boşluk, parantez ve tire kullanabilirsiniz." });
        }
        if ((hero_baslik && String(hero_baslik).length > 150) || (hero_alt_metin && String(hero_alt_metin).length > 400)) {
            return res.status(400).json({ hata: "Başlık veya alt metin çok uzun!" });
        }
        let newHeroResimPath = null;

        if (req.file) {
            try {
                const uniqueFilename = benzersizDosyaAdi('hero');
                const filePath = path.join(uploadsKlasoru, uniqueFilename);

                await sharp(req.file.buffer)
                    .rotate()
                    .resize({ width: 1920, withoutEnlargement: true })
                    .webp({ quality: 85 })
                    .toFile(filePath);

                newHeroResimPath = '/uploads/' + uniqueFilename;
            } catch (error) {
                console.error("Hero görsel işleme hatası:", error);
                return res.status(500).json({ hata: "Hero görseli işlenirken hata oluştu." });
            }
        }

        db.query("SELECT * FROM ayarlar LIMIT 1", (err, sonuclar) => {
            if (err) {
                console.error("Ayar kontrol veritabanı hatası:", err);
                return res.status(500).json({ hata: "Veritabanı okuma hatası." });
            }

            if (sonuclar.length === 0) {
                // Eğer tabloda hiç ayar yoksa (İlk Ekleme)
                const insertSql = "INSERT INTO ayarlar (telefon1, telefon2, hero_resim, hero_baslik, hero_alt_metin) VALUES (?, ?, ?, ?, ?)";
                db.query(insertSql, [telefon1 || '', telefon2 || '', newHeroResimPath, hero_baslik || '', hero_alt_metin || ''], (err2) => {
                    if (err2) {
                        console.error("Ayar ekleme hatası:", err2);
                        return res.status(500).json({ hata: "Ayarlar veritabanına eklenemedi." });
                    }
                    onbellekTemizle();
                    res.json({ mesaj: "Site ayarları başarıyla kaydedildi!" });
                });
            } else {
                // Eğer tabloda ayar varsa (Güncelleme)
                const mevcutAyar = sonuclar[0];
                const guncelHeroResim = newHeroResimPath || mevcutAyar.hero_resim;

                if (newHeroResimPath && mevcutAyar.hero_resim) {
                    const eskiDiskYolu = path.join(uploadsKlasoru, path.basename(mevcutAyar.hero_resim));
                    if (fs.existsSync(eskiDiskYolu)) {
                        fs.unlink(eskiDiskYolu, (e) => {
                            if (e) console.error("Eski hero resmi silinemedi:", e);
                        });
                    }
                }

                const updateSql = "UPDATE ayarlar SET telefon1 = ?, telefon2 = ?, hero_resim = ?, hero_baslik = ?, hero_alt_metin = ? WHERE id = ?";
                db.query(updateSql, [
                    telefon1 !== undefined ? telefon1 : mevcutAyar.telefon1, 
                    telefon2 !== undefined ? telefon2 : mevcutAyar.telefon2, 
                    guncelHeroResim, 
                    hero_baslik !== undefined ? hero_baslik : mevcutAyar.hero_baslik,
                    hero_alt_metin !== undefined ? hero_alt_metin : mevcutAyar.hero_alt_metin,
                    mevcutAyar.id
                ], (err2) => {
                    if (err2) {
                        console.error("Ayar güncelleme hatası:", err2);
                        return res.status(500).json({ hata: "Ayarlar güncellenemedi." });
                    }
                    onbellekTemizle();
                    res.json({ mesaj: "Site ayarları başarıyla güncellendi!" });
                });
            }
        });
    } catch (genelHata) {
        console.error("Endpoint genel hatası:", genelHata);
        res.status(500).json({ hata: "Sunucu içi beklenmeyen hata." });
    }
});

// ====================================================================
// ADMIN PANELİ: FRONTEND İÇİN GÜVENLİK VE ROL DOĞRULAMA API'Sİ
// ====================================================================
app.get('/api/admin/verify', adminKontrol, (req, res) => {
    if (req.kullanici && req.kullanici.rol === 'admin') {
        return res.status(200).json({ success: true, rol: 'admin' });
    }
    return res.status(403).json({ success: false, hata: "Admin yetkisi gerekli." });
});

// ====================================================================
// ADMIN PANELİ: TÜM SİPARİŞLERİ LİSTELEME API'Sİ
// ====================================================================
app.get('/api/admin/siparisler', adminKontrol, (req, res) => {
    const { sayfa, limit } = sayfalamaAl(req, 12, 100);
    const tur = req.query.tur; 
    const offset = (sayfa - 1) * limit;

    const kosullar = [];
    const aramaParametreleri = [];
    if (tur === 'aktif') {
        kosullar.push("(s.durum != 'Tamamlandı' AND s.durum != 'İptal')");
    } else if (tur === 'gecmis') {
        kosullar.push("(s.durum = 'Tamamlandı' OR s.durum = 'İptal')");
    }

    // 🔎 Sipariş kodu, müşteri adı, e-posta veya telefona göre arama (kodun bir kısmı yazılsa da bulunur)
    const arama = String(req.query.arama || '').trim().slice(0, 60);
    if (arama) {
        const kacis = (metin) => metin.replace(/[\\%_]/g, '\\$&');
        const like = `%${kacis(arama)}%`;
        // Sipariş kodları her zaman BÜYÜK harflidir; veritabanı dil ayarı ne olursa olsun küçük harfle yazılan kod da bulunsun
        const likeKod = `%${kacis(arama.toLocaleUpperCase('en-US'))}%`;
        const sartlar = ["s.siparis_kodu LIKE ?", "k.isim LIKE ?", "k.eposta LIKE ?", "k.telefon LIKE ?"];
        aramaParametreleri.push(likeKod, like, like, like);

        // Telefon "0532 444 55 66" gibi boşluklu kayıtlıysa, boşluksuz yazılan numara da bulunsun
        const sadeceRakam = arama.replace(/\D/g, '');
        if (sadeceRakam.length >= 3) {
            sartlar.push("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(k.telefon, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') LIKE ?");
            aramaParametreleri.push(`%${sadeceRakam}%`);
        }
        kosullar.push("(" + sartlar.join(" OR ") + ")");
    }
    const durumFiltresi = kosullar.length > 0 ? " WHERE " + kosullar.join(" AND ") : "";

    const countSql = `SELECT COUNT(*) AS toplam FROM siparisler s LEFT JOIN kullanicilar k ON s.kullanici_id = k.id${durumFiltresi}`;

    db.query(countSql, aramaParametreleri, (err, countSonuc) => {
        if (err) {
            console.error("Sipariş sayısı çekilirken hata:", err);
            return res.status(500).json({ hata: "Sayfalama bilgisi alınamadı." });
        }
        
        const toplamSiparis = countSonuc[0].toplam;
        const toplamSayfa = Math.ceil(toplamSiparis / limit) || 1;

        // Önce sayfadaki siparişler seçilir, ürün listesi sadece o satırlar için hesaplanır (tüm tabloyu gruplamaz)
        const sqlSorgusu = `
            SELECT
                s.id, s.siparis_kodu, s.toplam_tutar, s.durum, s.tarih,
                k.isim AS musteri_adi, k.eposta AS musteri_eposta, k.telefon AS musteri_telefon,
                (SELECT GROUP_CONCAT(CONCAT(su.adet, 'x ', su.urun_baslik) SEPARATOR ', ')
                   FROM siparis_urunleri su WHERE su.siparis_id = s.id) AS urunler
            FROM siparisler s
            LEFT JOIN kullanicilar k ON s.kullanici_id = k.id
            ${durumFiltresi}
            ORDER BY s.tarih DESC
            LIMIT ? OFFSET ?
        `;

        db.query(sqlSorgusu, [...aramaParametreleri, limit, offset], (err, sonuclar) => {
            if (err) {
                console.error("Admin siparişleri çekilirken hata oluştu:", err);
                return res.status(500).json({ hata: "Veritabanından siparişler alınamadı!" });
            }
            
            res.json({
                siparisler: sonuclar,
                toplamSayfa: toplamSayfa,
                mevcutSayfa: sayfa,
                toplamSiparis: toplamSiparis
            }); 
        });
    });
});

// ====================================================================
// ADMIN PANELİ: SİPARİŞ DURUMUNU 'TAMAMLANDI' YAPMA API'Sİ
// ====================================================================
app.post('/api/admin/siparis-tamamla', adminKontrol, (req, res) => {
    const siparisId = parseInt(req.body.id);

    if (!siparisId) {
        return res.status(400).json({ hata: "Sipariş ID eksik!" });
    }

    const sqlSorgusu = "UPDATE siparisler SET durum = 'Tamamlandı' WHERE id = ?";

    db.query(sqlSorgusu, [siparisId], (err, sonuc) => {
        if (err) {
            console.error("Sipariş güncellenirken hata oluştu:", err);
            return res.status(500).json({ hata: "Sipariş durumu güncellenemedi!" });
        }
        res.json({ mesaj: "Sipariş başarıyla tamamlandı!" });
    });
});

// ====================================================================
// ADMIN PANELİ: ÜRÜN LİSTELEME API'Sİ (SOFT DELETE FİLTRELİ)
// ====================================================================
app.get('/api/admin/urunler', adminKontrol, (req, res) => {
    const { sayfa, limit } = sayfalamaAl(req, 20, 100);
    const arama = req.query.arama || "";
    
    const offset = (sayfa - 1) * limit;

    let aramaKriteri = "";
    let sorguParametreleri = [];
    
    const aramaKelimeleri = aramaKelimeleriniHazirla(arama);
    if (aramaKelimeleri.length > 0) {
        aramaKriteri = " WHERE silindi_mi = 0 AND (MATCH(baslik, aciklama) AGAINST(? IN BOOLEAN MODE) OR baslik LIKE ? OR kategori LIKE ? OR tip LIKE ?)";
        const arananKelime = aramaKelimeleri.map(k => `${k}*`).join(' ');
        const arananLike = `%${aramaKelimeleri.join(' ')}%`;
        sorguParametreleri.push(arananKelime, arananLike, arananLike, arananLike);
    } else {
        aramaKriteri = " WHERE silindi_mi = 0";
    }

    const toplamSayiSorgusu = `SELECT COUNT(*) AS toplam FROM urunler${aramaKriteri}`;
    
    db.query(toplamSayiSorgusu, sorguParametreleri, (err, countSonuc) => {
        if (err) {
            console.error("Ürün sayısı çekilirken hata:", err);
            return res.status(500).json({ hata: "Sayfalama bilgisi alınamadı." });
        }
        
        const toplamUrun = countSonuc[0].toplam;
        const toplamSayfa = Math.ceil(toplamUrun / limit) || 1;

        const sqlSorgusu = `SELECT * FROM urunler${aramaKriteri} ORDER BY id DESC LIMIT ? OFFSET ?`;
        
        sorguParametreleri.push(limit, offset);

        db.query(sqlSorgusu, sorguParametreleri, (err, sonuclar) => {
            if (err) {
                console.error("Admin ürünleri çekilirken hata:", err);
                return res.status(500).json({ hata: "Ürünler veri tabanından çekilemedi!" });
            }
            
            res.json({
                urunler: sonuclar,       
                toplamSayfa: toplamSayfa, 
                mevcutSayfa: sayfa,      
                toplamUrun: toplamUrun   
            });
        });
    });
});

// ====================================================================
// ADMIN PANELİ: YENİ ÜRÜN EKLEME API'Sİ
// ====================================================================
app.post('/api/admin/urun-ekle', adminKontrol, upload.single('resim'), async (req, res) => {
    const baslik = buyukHarfTemizle(req.body.baslik);
    const kategori = buyukHarfTemizle(req.body.kategori);
    const tip = buyukHarfTemizle(req.body.tip);
    const aciklama = String(req.body.aciklama || '');
    const fiyat = fiyatiTemizle(req.body.fiyat);

    // Önce her şeyi doğrula, sonra resmi işle (hatalı istekte diskte sahipsiz dosya kalmasın)
    if (!baslik || !kategori || !req.file) {
        return res.status(400).json({ hata: "Lütfen zorunlu alanları (Başlık, Kategori, Fotoğraf) doldurun!" });
    }
    if (fiyat === null) {
        return res.status(400).json({ hata: "Geçersiz fiyat! Fiyat 0 veya daha büyük bir sayı olmalıdır." });
    }

    let kaydedilen;
    try {
        kaydedilen = await resmiKaydet(req.file.buffer, 'urun', 800, 80);
    } catch (error) {
        console.error("Sharp görsel işleme hatası:", error);
        return res.status(500).json({ hata: "Görsel işlenirken sunucuda bir hata oluştu." });
    }

    const sqlSorgusu = "INSERT INTO urunler (baslik, kategori, tip, fiyat, resim, aciklama) VALUES (?, ?, ?, ?, ?, ?)";
    db.query(sqlSorgusu, [baslik, kategori, tip, fiyat, kaydedilen.resimYolu, aciklama], (err, sonuc) => {
        if (err) {
            console.error("Ürün eklenirken hata oluştu:", err);
            dosyayiSil(kaydedilen.filePath);
            return res.status(500).json({ hata: "Ürün veritabanına eklenemedi!" });
        }
        onbellekTemizle();
        res.json({ mesaj: "Ürün başarıyla dükkana eklendi!", yeniUrunId: sonuc.insertId });
    });
});

// ====================================================================
// FİLTRELER: MEVCUT BENZERSİZ KATEGORİ VE KOLEKSİYONLAR API'Sİ (ÖNBELLEKLİ)
// ====================================================================
app.get('/api/admin/benzersiz-filtreler', (req, res) => {
    const kategori = String(req.query.kategori || '').trim().slice(0, 100);

    const anahtar = `filtre:${kategori || 'tumu'}`;
    const onbellekliVeri = onbellekten(anahtar);
    if (onbellekliVeri) return res.json(onbellekliVeri);

    if (kategori) {
        const sqlTipKategoriyeOzel = "SELECT DISTINCT tip FROM urunler WHERE silindi_mi = 0 AND kategori = ? AND tip IS NOT NULL AND tip != ''";

        db.query(sqlTipKategoriyeOzel, [kategori], (err, tipSonuclar) => {
            if (err) {
                console.error("Kategoriye özel tipler çekilirken SQL hatası:", err);
                return res.status(500).json({ hata: "Koleksiyonlar alınamadı!" });
            }
            const veri = { tipler: tipSonuclar.map(satir => satir.tip) };
            onbellegeYaz(anahtar, veri);
            res.json(veri);
        });
        return;
    }

    const sqlKategori = "SELECT DISTINCT kategori FROM urunler WHERE silindi_mi = 0 AND kategori IS NOT NULL AND kategori != ''";
    const sqlTip = "SELECT DISTINCT tip FROM urunler WHERE silindi_mi = 0 AND tip IS NOT NULL AND tip != ''";

    db.query(sqlKategori, (err, katSonuclar) => {
        if (err) {
            console.error("Kategoriler çekilirken SQL hatası:", err);
            return res.status(500).json({ hata: "Kategoriler alınamadı!" });
        }

        db.query(sqlTip, (err2, tipSonuclar) => {
            if (err2) {
                console.error("Koleksiyonlar çekilirken SQL hatası:", err2);
                return res.status(500).json({ hata: "Koleksiyonlar alınamadı!" });
            }
            const veri = {
                kategoriler: katSonuclar.map(satir => satir.kategori),
                tipler: tipSonuclar.map(satir => satir.tip)
            };
            onbellegeYaz(anahtar, veri);
            res.json(veri);
        });
    });
});

// ===================================================================
// VİTRİN: TEK BİR ÜRÜNÜN DETAYINI ID'SİNE GÖRE GETİRME API'Sİ (ÖNBELLEKLİ)
// ===================================================================
app.get('/api/urunler/:id', (req, res) => {
    const urunId = parseInt(req.params.id);
    if (!urunId || urunId < 1) {
        return res.status(404).json({ hata: "Aradığınız ürün dükkanda bulunamadı!" });
    }

    const anahtar = `urun:${urunId}`;
    const onbellekliVeri = onbellekten(anahtar);
    if (onbellekliVeri) return res.json(onbellekliVeri);

    db.query("SELECT * FROM urunler WHERE id = ? AND silindi_mi = 0", [urunId], (err, sonuc) => {
        if (err) {
            console.error("Ürün detayı çekilirken SQL hatası:", err);
            return res.status(500).json({ hata: "Veritabanı hatası oluştu!" });
        }
        if (sonuc.length === 0) {
            return res.status(404).json({ hata: "Aradığınız ürün dükkanda bulunamadı!" });
        }
        onbellegeYaz(anahtar, sonuc[0]);
        res.json(sonuc[0]);
    });
});

// ===================================================================
// VİTRİN: ARAMA ÇUBUĞU İÇİN CANLI ÜRÜN ARAMA API'Sİ
// (özel karakterler temizlenir; kısa kelimeler için LIKE yedeği vardır)
// ===================================================================
app.get('/api/urun-ara', (req, res) => {
    const kelimeler = aramaKelimeleriniHazirla(req.query.q);

    if (kelimeler.length === 0) {
        return res.json([]);
    }

    const sql = "SELECT id, baslik, fiyat, resim FROM urunler WHERE silindi_mi = 0 AND (MATCH(baslik, aciklama) AGAINST(? IN BOOLEAN MODE) OR baslik LIKE ?) LIMIT 10";
    const aranan = kelimeler.map(k => `${k}*`).join(' ');
    const like = `%${kelimeler.join(' ')}%`;

    const anahtar = `ara:${aranan}`;
    const onbellekliVeri = onbellekten(anahtar);
    if (onbellekliVeri) return res.json(onbellekliVeri);

    db.query(sql, [aranan, like], (err, sonuclar) => {
        if (err) {
            console.error("Arama sırasında SQL hatası:", err);
            return res.status(500).json({ hata: "Arama yapılamadı" });
        }
        onbellegeYaz(anahtar, sonuclar);
        res.json(sonuclar);
    });
});

// ====================================================================
// ADMIN PANELİ: ÜRÜNÜ MANTIKSAL SİLME (SOFT DELETE) API'Sİ
// ====================================================================
app.delete('/api/admin/urunler/:id', adminKontrol, (req, res) => {
    const urunId = req.params.id;

    const sqlUrunSil = "UPDATE urunler SET silindi_mi = 1 WHERE id = ?";
    db.query(sqlUrunSil, [urunId], (err, silmeSonuc) => {
        if (err) {
            console.error("Ürün pasife alınırken hata:", err);
            return res.status(500).json({ hata: "Ürün silinemedi." });
        }

        onbellekTemizle();
        res.json({ mesaj: "Ürün başarıyla kaldırıldı." });
    });
});

// ====================================================================
// ADMIN PANELİ: ÜRÜN GÜNCELLEME (ESKİ RESMİ DİSKTEN SİLEREK)
// ====================================================================
app.put('/api/admin/urunler/:id', adminKontrol, upload.single('resim'), async (req, res) => {
    const urunId = parseInt(req.params.id);
    if (!urunId || urunId < 1) {
        return res.status(400).json({ hata: "Geçersiz ürün numarası!" });
    }

    const baslik = buyukHarfTemizle(req.body.baslik);
    const kategori = buyukHarfTemizle(req.body.kategori);
    const tip = buyukHarfTemizle(req.body.tip);
    const aciklama = String(req.body.aciklama || '');
    const fiyat = fiyatiTemizle(req.body.fiyat);

    if (!baslik || !kategori) {
        return res.status(400).json({ hata: "Başlık ve Kategori alanları boş bırakılamaz!" });
    }
    if (fiyat === null) {
        return res.status(400).json({ hata: "Geçersiz fiyat! Fiyat 0 veya daha büyük bir sayı olmalıdır." });
    }

    let yeniResim = null;
    try {
        const [mevcut] = await dbp.query("SELECT resim FROM urunler WHERE id = ? AND silindi_mi = 0", [urunId]);
        if (mevcut.length === 0) {
            return res.status(404).json({ hata: "Güncellenecek ürün bulunamadı!" });
        }
        const eskiResimYolu = mevcut[0].resim;

        if (req.file) {
            yeniResim = await resmiKaydet(req.file.buffer, 'urun', 800, 80);
            await dbp.query(
                "UPDATE urunler SET baslik=?, kategori=?, tip=?, fiyat=?, aciklama=?, resim=? WHERE id=?",
                [baslik, kategori, tip, fiyat, aciklama, yeniResim.resimYolu, urunId]
            );
            if (eskiResimYolu && !eskiResimYolu.startsWith('http')) {
                dosyayiSil(path.join(uploadsKlasoru, path.basename(eskiResimYolu)));
            }
        } else {
            await dbp.query(
                "UPDATE urunler SET baslik=?, kategori=?, tip=?, fiyat=?, aciklama=? WHERE id=?",
                [baslik, kategori, tip, fiyat, aciklama, urunId]
            );
        }

        onbellekTemizle();
        res.json({ mesaj: req.file ? "Ürün ve resmi başarıyla güncellendi!" : "Ürün başarıyla güncellendi!" });
    } catch (error) {
        console.error("Ürün güncelleme hatası:", error);
        if (yeniResim) dosyayiSil(yeniResim.filePath);
        res.status(500).json({ hata: "Ürün güncellenirken hata oluştu." });
    }
});

// ====================================================================
// ADMIN PANELİ: GEÇMİŞ SİPARİŞİ KALICI SİLME API'Sİ
// ====================================================================
app.delete('/api/admin/siparisler/:id', adminKontrol, (req, res) => {
    const siparisId = req.params.id;

    const sqlUrunleriSil = "DELETE FROM siparis_urunleri WHERE siparis_id = ?";
    
    db.query(sqlUrunleriSil, [siparisId], (err, urunSonuc) => {
        if (err) {
            console.error("Sipariş ürünleri silinirken hata:", err);
            return res.status(500).json({ hata: "Sipariş detayları silinemedi." });
        }

        const sqlSiparisiSil = "DELETE FROM siparisler WHERE id = ?";
        
        db.query(sqlSiparisiSil, [siparisId], (err, siparisSonuc) => {
            if (err) {
                console.error("Ana sipariş silinirken hata:", err);
                return res.status(500).json({ hata: "Ana sipariş silinemedi." });
            }

            res.json({ mesaj: "Sipariş veri tabanından kalıcı olarak temizlendi!" });
        });
    });
});

// ====================================================================
// KULLANICI: YENİ ÜYE KAYIT API'Sİ (RATE LIMITER KORUMALI)
// ====================================================================
app.post('/api/register', kayitLimiter, [
    body('eposta').trim().isEmail().withMessage('Geçerli bir e-posta adresi girmelisiniz.')
        .isLength({ max: 100 }).withMessage('E-posta adresi çok uzun.'),
    body('sifre').isLength({ min: 6, max: 20 }).withMessage('Şifreniz en az 6, en fazla 20 karakter olmalıdır.'),
    body('isim').trim().notEmpty().withMessage('İsim alanı boş bırakılamaz.')
        .isLength({ min: 2, max: 60 }).withMessage('İsim 2 ile 60 karakter arasında olmalıdır.')
        .matches(/^[^<>]*$/).withMessage('İsimde < veya > karakterleri kullanılamaz.'),
    body('telefon').optional({ checkFalsy: true }).trim()
        .matches(/^[0-9+\s()\-]{7,20}$/).withMessage('Telefon numarası geçersiz.')
], (req, res) => {
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ hata: errors.array()[0].msg });
    }

    const { isim, eposta, sifre, telefon } = req.body;

    const epostaKontrolSql = "SELECT id FROM kullanicilar WHERE eposta = ?";
    
    db.query(epostaKontrolSql, [eposta], async (err, sonuclar) => {
        if (err) {
            console.error("Veritabanı kontrol hatası:", err);
            return res.status(500).json({ hata: "Veritabanı kontrol hatası!" });
        }
        
        if (sonuclar.length > 0) {
            return res.status(400).json({ hata: "Bu e-posta adresiyle zaten bir hesap açılmış!" });
        }

        try {
            const sifrelenmisSifre = await bcrypt.hash(sifre, 10);

            const kayitSql = "INSERT INTO kullanicilar (isim, eposta, sifre, telefon, rol) VALUES (?, ?, ?, ?, 'uye')";
            
            db.query(kayitSql, [isim, eposta, sifrelenmisSifre, telefon], (err, sonuc) => {
                if (err) {
                    console.error("Kayıt hatası:", err);
                    return res.status(500).json({ hata: "Kayıt esnasında bir hata oluştu." });
                }
                res.json({ success: true, mesaj: "Hesabınız başarıyla oluşturuldu! Giriş yapabilirsiniz. 🎉" });
            });
        } catch (error) {
            console.error("Şifreleme hatası:", error);
            res.status(500).json({ hata: "Güvenlik işlemi sırasında hata oluştu." });
        }
    });
});

// ====================================================================
// KULLANICI: GİRİŞ YAPMA API'Sİ
// ====================================================================
app.post('/api/login', authLimiter, [
    body('eposta').isEmail().withMessage('Lütfen geçerli bir e-posta giriniz.'),
    body('sifre').notEmpty().withMessage('Şifre alanı boş bırakılamaz.')
], (req, res) => {
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ hata: errors.array()[0].msg });
    }

    const { eposta, sifre } = req.body;

    const sql = "SELECT * FROM kullanicilar WHERE eposta = ? AND silindi_mi = 0";
    
    db.query(sql, [eposta], async (err, sonuclar) => {
        if (err) {
            console.error("Veritabanı hatası:", err);
            return res.status(500).json({ hata: "Veritabanı hatası!" });
        }
        
        if (sonuclar.length === 0) {
            return res.status(401).json({ hata: "E-posta veya şifre hatalı!" });
        }

        const kullanici = sonuclar[0];
        
        try {
            const sifreDogruMu = await bcrypt.compare(sifre, kullanici.sifre);

            if (!sifreDogruMu) {
                return res.status(401).json({ hata: "E-posta veya şifre hatalı!" });
            }

            const token = jwt.sign(
                { id: kullanici.id, isim: kullanici.isim, rol: kullanici.rol },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                token: token,
                kullanici: { id: kullanici.id, isim: kullanici.isim, eposta: kullanici.eposta, telefon: kullanici.telefon, rol: kullanici.rol }
            });
        } catch (error) {
            console.error("Giriş sırasında şifre doğrulama hatası:", error);
            res.status(500).json({ hata: "Sistemsel bir hata oluştu." });
        }
    });
});

// ====================================================================
// ADMIN PANELİ: ÜYELERİ LİSTELEME API'Sİ
// ====================================================================
app.get('/api/admin/kullanicilar', adminKontrol, (req, res) => {
    const { sayfa, limit } = sayfalamaAl(req, 20, 100);
    const offset = (sayfa - 1) * limit;

    db.query("SELECT COUNT(*) AS toplam FROM kullanicilar WHERE rol = 'uye' AND silindi_mi = 0", (err, countSonuc) => {
        if (err) {
            console.error("Sayfalama hatası:", err);
            return res.status(500).json({ hata: "Sayfalama bilgisi alınamadı." });
        }

        const toplamKullanici = countSonuc[0].toplam;
        const toplamSayfa = Math.ceil(toplamKullanici / limit) || 1;

        const sql = "SELECT id, isim, eposta, telefon, kayit_tarihi FROM kullanicilar WHERE rol = 'uye' AND silindi_mi = 0 ORDER BY id DESC LIMIT ? OFFSET ?";
        
        db.query(sql, [limit, offset], (err, sonuclar) => {
            if (err) {
                console.error("Üye listesi çekme hatası:", err);
                return res.status(500).json({ hata: "Üyeler listelenirken bir hata oluştu." });
            }
            
            res.json({
                kullanicilar: sonuclar,
                toplamSayfa: toplamSayfa,
                mevcutSayfa: sayfa,
                toplamKullanici: toplamKullanici
            });
        });
    });
});

// ====================================================================
// ADMIN PANELİ: ÜYE MANTIKSAL SİLME (SOFT DELETE) API'Sİ
// ====================================================================
app.delete('/api/admin/kullanicilar/:id', adminKontrol, (req, res) => {
    const silinecekId = req.params.id;

    const sql = "UPDATE kullanicilar SET silindi_mi = 1 WHERE id = ? AND rol = 'uye'";
    
    db.query(sql, [silinecekId], (err, sonuc) => {
        if (err) {
            console.error("Kullanıcı silme hatası:", err);
            return res.status(500).json({ hata: "Kullanıcı silinirken sistemsel hata oluştu." });
        }
        res.json({ success: true, mesaj: "Kullanıcı kaydı başarıyla silindi." });
    });
});

// ====================================================================
// KULLANICI: ŞİFRE SIFIRLAMA - ADIM 1: E-POSTAYA 6 HANELİ DOĞRULAMA KODU GÖNDERME
// Şifre bu aşamada DEĞİŞMEZ; ancak e-postadaki kod doğrulanınca değişir.
// ====================================================================
app.post('/api/sifre-sifirla', sifirlamaLimiter, [
    body('eposta').trim().isEmail().withMessage('Lütfen geçerli bir e-posta adresi girin.')
], (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ hata: errors.array()[0].msg });
    }

    const { eposta } = req.body;
    // Hesap var olsa da olmasa da aynı cevap verilir (e-posta adreslerinin keşfedilmesini önler)
    const genelCevap = { success: true, mesaj: "Eğer bu e-posta adresiyle kayıtlı bir hesap varsa, doğrulama kodu gönderilmiştir." };

    const kontrolSql = `
        SELECT id, isim,
               (sifirlama_bitis IS NOT NULL AND sifirlama_bitis > DATE_ADD(NOW(), INTERVAL 14 MINUTE)) AS cok_yeni
        FROM kullanicilar WHERE eposta = ? AND silindi_mi = 0`;

    db.query(kontrolSql, [eposta], async (err, sonuclar) => {
        if (err) {
            console.error("Şifre sıfırlama hatası:", err);
            if (err.code === 'ER_BAD_FIELD_ERROR') {
                console.error("➡️ 'kullanicilar' tablosunda sifirlama_kodu / sifirlama_bitis / sifirlama_deneme sütunları yok. Sunucuyu yeniden başlatın ya da SQL komutunu elle çalıştırın.");
            }
            return res.status(500).json({ hata: "Veritabanı hatası!" });
        }

        if (sonuclar.length === 0) {
            return res.json(genelCevap);
        }

        const kullanici = sonuclar[0];

        // Son 1 dakika içinde kod gönderildiyse tekrar mail göndermeyiz (mail bombardımanını önler)
        if (kullanici.cok_yeni) {
            return res.json(genelCevap);
        }

        const kod = String(crypto.randomInt(100000, 1000000));

        try {
            const kodHash = await bcrypt.hash(kod, 10);
            await dbp.query(
                "UPDATE kullanicilar SET sifirlama_kodu = ?, sifirlama_bitis = DATE_ADD(NOW(), INTERVAL 15 MINUTE), sifirlama_deneme = 0 WHERE id = ?",
                [kodHash, kullanici.id]
            );

            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT) || 465,
                secure: process.env.SMTP_PORT == 465,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });

            const mailOptions = {
                from: `"İrşad Hediyelik" <${process.env.SMTP_USER}>`,
                to: eposta,
                subject: "Şifre Sıfırlama Doğrulama Kodunuz",
                html: `<h3>Merhaba ${htmlKacis(kullanici.isim)},</h3>
                       <p>Hesabınız için şifre sıfırlama talebinde bulundunuz.</p>
                       <p>Doğrulama kodunuz: <b style="font-size:20px; letter-spacing:3px;">${kod}</b></p>
                       <p>Bu kod <b>15 dakika</b> boyunca geçerlidir. Kodu sitedeki şifre sıfırlama ekranına girerek yeni şifrenizi belirleyebilirsiniz.</p>
                       <p style="color:#777; font-size:13px;">Bu talebi siz yapmadıysanız bu e-postayı dikkate almayın; şifreniz değişmemiştir.</p>`
            };

            try {
                await transporter.sendMail(mailOptions);
                return res.json(genelCevap);
            } catch (mailErr) {
                console.error("Mail gönderme hatası:", mailErr);
                await dbp.query("UPDATE kullanicilar SET sifirlama_kodu = NULL, sifirlama_bitis = NULL, sifirlama_deneme = 0 WHERE id = ?", [kullanici.id]);
                return res.status(500).json({ hata: "Doğrulama kodu e-posta ile gönderilemedi. Lütfen daha sonra tekrar deneyin." });
            }
        } catch (hata) {
            console.error("Şifre sıfırlama kodu oluşturma hatası:", hata);
            return res.status(500).json({ hata: "Güvenlik işlemi sırasında bir hata oluştu." });
        }
    });
});

// ====================================================================
// KULLANICI: ŞİFRE SIFIRLAMA - ADIM 2: KODU DOĞRULAYIP YENİ ŞİFREYİ KAYDETME
// (Kod 15 dk geçerli, en fazla 5 hatalı deneme hakkı vardır)
// ====================================================================
app.post('/api/sifre-guncelle', sifirlamaLimiter, [
    body('eposta').trim().isEmail().withMessage('Geçerli bir e-posta adresi giriniz.'),
    body('geciciSifre').trim().matches(/^\d{6}$/).withMessage('Doğrulama kodu 6 haneli bir sayıdır.'),
    body('yeniSifre').isLength({ min: 6, max: 20 }).withMessage('Yeni şifre en az 6, en fazla 20 karakter olmalıdır.')
], (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ hata: errors.array()[0].msg });
    }

    const { eposta, geciciSifre: kod, yeniSifre } = req.body;
    const kodHatasi = "Doğrulama kodu hatalı veya süresi dolmuş! Lütfen yeni bir kod isteyin.";

    const sql = `
        SELECT id, sifirlama_kodu, sifirlama_deneme,
               (sifirlama_bitis IS NOT NULL AND sifirlama_bitis > NOW()) AS gecerli
        FROM kullanicilar WHERE eposta = ? AND silindi_mi = 0`;

    db.query(sql, [eposta], async (err, sonuclar) => {
        if (err) {
            console.error("Veritabanı hatası:", err);
            return res.status(500).json({ hata: "Veritabanı hatası!" });
        }

        const kullanici = sonuclar[0];
        if (!kullanici || !kullanici.sifirlama_kodu || !kullanici.gecerli) {
            return res.status(400).json({ hata: kodHatasi });
        }

        try {
            if (kullanici.sifirlama_deneme >= 5) {
                await dbp.query("UPDATE kullanicilar SET sifirlama_kodu = NULL, sifirlama_bitis = NULL, sifirlama_deneme = 0 WHERE id = ?", [kullanici.id]);
                return res.status(400).json({ hata: "Çok fazla hatalı deneme yaptınız. Lütfen yeni bir kod isteyin." });
            }

            const kodDogruMu = await bcrypt.compare(kod, kullanici.sifirlama_kodu);
            if (!kodDogruMu) {
                await dbp.query("UPDATE kullanicilar SET sifirlama_deneme = sifirlama_deneme + 1 WHERE id = ?", [kullanici.id]);
                return res.status(400).json({ hata: "Girdiğiniz doğrulama kodu hatalı!" });
            }

            const hashedYeniSifre = await bcrypt.hash(yeniSifre, 10);
            await dbp.query(
                "UPDATE kullanicilar SET sifre = ?, sifirlama_kodu = NULL, sifirlama_bitis = NULL, sifirlama_deneme = 0 WHERE id = ?",
                [hashedYeniSifre, kullanici.id]
            );
            res.json({ success: true, mesaj: "Şifreniz başarıyla güncellendi! Yeni şifrenizle giriş yapabilirsiniz." });
        } catch (error) {
            console.error("Şifre güncelleme hatası:", error);
            res.status(500).json({ hata: "Sistemsel bir hata oluştu." });
        }
    });
});

// ====================================================================
// KULLANICI: KENDİ GEÇMİŞ SİPARİŞLERİ
// ====================================================================
app.get('/api/kullanici/siparisler', girisKontrol, (req, res) => {
    const sql = `
        SELECT s.id, s.siparis_kodu, s.toplam_tutar, s.durum, s.tarih,
               (SELECT GROUP_CONCAT(CONCAT(su.adet, 'x ', su.urun_baslik) SEPARATOR ', ')
                  FROM siparis_urunleri su WHERE su.siparis_id = s.id) AS urunler
        FROM siparisler s
        WHERE s.kullanici_id = ?
        ORDER BY s.tarih DESC
        LIMIT 100
    `;

    db.query(sql, [req.kullanici.id], (err, sonuclar) => {
        if (err) {
            console.error("Kullanıcı siparişleri SQL hatası:", err);
            return res.status(500).json({ hata: "Siparişler çekilemedi." });
        }
        res.json(sonuclar);
    });
});

// ====================================================================
// VİTRİN: İLGİLİ / ÖNERİLEN ÜRÜNLERİ GETİRME API'Sİ (ÖNBELLEKLİ)
// ====================================================================
app.get('/api/ilgili-urunler', (req, res) => {
    const kategori = String(req.query.kategori || '').slice(0, 100);
    const mevcutId = parseInt(req.query.mevcutId) || 0;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 8, 1), 20);

    const anahtar = `ilgili:${kategori}:${mevcutId}:${limit}`;
    const onbellekliVeri = onbellekten(anahtar);
    if (onbellekliVeri) return res.json(onbellekliVeri);

    let sqlSorgusu = "SELECT id, baslik, fiyat, resim, tip FROM urunler WHERE silindi_mi = 0 AND id != ?";
    let parametreler = [mevcutId];

    if (kategori) {
        sqlSorgusu += " AND kategori = ?";
        parametreler.push(kategori);
    }

    sqlSorgusu += " ORDER BY id DESC LIMIT ?";
    parametreler.push(limit);

    db.query(sqlSorgusu, parametreler, (err, sonuclar) => {
        if (err) {
            console.error("İlgili ürünler çekilirken hata:", err);
            return res.status(500).json({ hata: "Veritabanı hatası!" });
        }
        onbellegeYaz(anahtar, sonuclar);
        res.json(sonuclar);
    });
});

// ====================================================================
// FIRSAT ÜRÜNLERİ VE İNDİRİM KUTULARI API'LERİ
// ====================================================================

// 1. Vitrin için Fırsat Ürünlerini Çekme (Limit Sınırı Kaldırıldı)
app.get('/api/firsat-urunleri', (req, res) => {
    const onbellekliVeri = onbellekten('firsat');
    if (onbellekliVeri) return res.json(onbellekliVeri);

    const sql = `
        SELECT 
            k.kutu_no, 
            u.id AS urun_id, 
            u.baslik, 
            u.fiyat, 
            u.resim, 
            u.aciklama AS kisa_aciklama,
            'Özel İndirim' AS etiket
        FROM indirim_kutulari k
        INNER JOIN urunler u ON k.urun_id = u.id
        WHERE u.silindi_mi = 0
        ORDER BY k.kutu_no ASC
    `;
    db.query(sql, (err, sonuclar) => {
        if (err) {
            console.error("Fırsat ürünleri çekilirken hata:", err);
            return res.status(500).json({ hata: "Veritabanı hatası!" });
        }
        onbellegeYaz('firsat', sonuclar);
        res.json(sonuclar);
    });
});

// 2. Kutuları Ve Bağlı Ürün Bilgilerini Getir (Admin Paneli İçin)
app.get('/api/indirim-kutulari', (req, res) => {
    const sql = `
        SELECT k.kutu_no, k.urun_id, u.baslik, u.kategori, u.tip, u.fiyat, u.resim, u.aciklama
        FROM indirim_kutulari k
        LEFT JOIN urunler u ON k.urun_id = u.id AND u.silindi_mi = 0
        ORDER BY k.kutu_no ASC
    `;
    db.query(sql, (err, sonuclar) => {
        if (err) {
            console.error("Kutular getirilirken hata:", err);
            return res.status(500).json({ hata: "Kutular getirilemedi." });
        }
        res.json(sonuclar);
    });
});

// 3. Kampanya kutusunu kaydet (Admin)
//    - urun_id varsa: O ÜRÜN GÜNCELLENİR (yeni ürün oluşturulmaz) ve kutuya bağlanır
//    - urun_id yoksa: Yeni ürün oluşturulur ve kutuya bağlanır
app.post('/api/admin/indirim-kutulari/kaydet', adminKontrol, upload.single('resim'), async (req, res) => {
    const body = req.body || {};

    if (!body.kutu_no) {
        return res.status(400).json({ hata: "Kutu numarası zorunludur!" });
    }

    // 🛡️ KAMPANYA KUTUSU ÜST SINIRI (Vitrin tasarımı 3'ün katı ve en fazla 12 kutu ile uyumlu çalışır)
    const kutuNo = parseInt(body.kutu_no);
    if (isNaN(kutuNo) || kutuNo < 1 || kutuNo > 12) {
        return res.status(400).json({ hata: "Kampanya kutusu numarası 1 ile 12 arasında olmalıdır!" });
    }

    const mevcutUrunId = parseInt(body.urun_id) || 0;
    const baslik = buyukHarfTemizle(body.baslik);
    const kategori = buyukHarfTemizle(body.kategori);
    const tip = buyukHarfTemizle(body.tip);
    const fiyat = fiyatiTemizle(body.fiyat);

    if (fiyat === null) {
        return res.status(400).json({ hata: "Geçersiz fiyat! Fiyat 0 veya daha büyük bir sayı olmalıdır." });
    }

    const kutuSql = `
        INSERT INTO indirim_kutulari (kutu_no, urun_id)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE urun_id = VALUES(urun_id)
    `;

    // Sadece var olan bir ürünü kutuya bağlama (başlık gönderilmemişse)
    if (mevcutUrunId > 0 && !baslik) {
        try {
            const [urun] = await dbp.query("SELECT id FROM urunler WHERE id = ? AND silindi_mi = 0", [mevcutUrunId]);
            if (urun.length === 0) {
                return res.status(404).json({ hata: "Bağlanmak istenen ürün bulunamadı!" });
            }
            await dbp.query(kutuSql, [kutuNo, mevcutUrunId]);
            return res.json({ mesaj: `${kutuNo}. kutu ürüne başarıyla bağlandı!` });
        } catch (error) {
            console.error("Kutu güncellenirken SQL hatası:", error);
            return res.status(500).json({ hata: "Kutu veritabanına kaydedilemedi." });
        }
    }

    if (!baslik || !kategori) {
        return res.status(400).json({ hata: "Ürün Başlığı ve Kategori zorunludur!" });
    }
    if (mevcutUrunId === 0 && !req.file) {
        return res.status(400).json({ hata: "Yeni kampanya ürünü için görsel yüklemek zorunludur!" });
    }

    let yeniResim = null;
    try {
        if (req.file) {
            yeniResim = await resmiKaydet(req.file.buffer, 'urun', 800, 80);
        }

        // --- MEVCUT ÜRÜNÜ GÜNCELLE ---
        if (mevcutUrunId > 0) {
            const [mevcut] = await dbp.query("SELECT resim FROM urunler WHERE id = ? AND silindi_mi = 0", [mevcutUrunId]);
            if (mevcut.length === 0) {
                if (yeniResim) dosyayiSil(yeniResim.filePath);
                return res.status(404).json({ hata: "Güncellenecek ürün bulunamadı!" });
            }
            const eskiResimYolu = mevcut[0].resim;

            if (yeniResim) {
                await dbp.query(
                    "UPDATE urunler SET baslik=?, kategori=?, tip=?, fiyat=?, resim=? WHERE id=?",
                    [baslik, kategori, tip, fiyat, yeniResim.resimYolu, mevcutUrunId]
                );
                if (eskiResimYolu && !eskiResimYolu.startsWith('http')) {
                    dosyayiSil(path.join(uploadsKlasoru, path.basename(eskiResimYolu)));
                }
            } else {
                await dbp.query(
                    "UPDATE urunler SET baslik=?, kategori=?, tip=?, fiyat=? WHERE id=?",
                    [baslik, kategori, tip, fiyat, mevcutUrunId]
                );
            }
            await dbp.query(kutuSql, [kutuNo, mevcutUrunId]);
            onbellekTemizle();
            return res.json({ mesaj: `${kutuNo}. kutudaki ürün başarıyla güncellendi!`, urunId: mevcutUrunId });
        }

        // --- YENİ ÜRÜN OLUŞTUR VE KUTUYA BAĞLA ---
        const [urunSonuc] = await dbp.query(
            "INSERT INTO urunler (baslik, kategori, tip, fiyat, resim, aciklama) VALUES (?, ?, ?, ?, ?, ?)",
            [baslik, kategori, tip, fiyat, yeniResim.resimYolu, '']
        );
        const yeniUrunId = urunSonuc.insertId;
        await dbp.query(kutuSql, [kutuNo, yeniUrunId]);
        onbellekTemizle();

        res.json({
            mesaj: `Yeni ürün başarıyla dükkana eklendi ve ${kutuNo}. kutuya bağlandı!`,
            yeniUrunId: yeniUrunId
        });
    } catch (error) {
        console.error("Kampanya kutusu kaydedilirken hata:", error);
        if (yeniResim) dosyayiSil(yeniResim.filePath);
        res.status(500).json({ hata: "Kampanya kutusu kaydedilemedi." });
    }
});

// 4. Kampanya Kutusunu Kaldır (Admin) - Sadece kutu bağlantısını siler, ürünü SİLMEZ
app.delete('/api/admin/indirim-kutulari/:kutu_no', adminKontrol, (req, res) => {
    const kutuNo = parseInt(req.params.kutu_no);

    if (isNaN(kutuNo) || kutuNo < 1 || kutuNo > 12) {
        return res.status(400).json({ hata: "Geçersiz kutu numarası!" });
    }

    const sql = "DELETE FROM indirim_kutulari WHERE kutu_no = ?";
    db.query(sql, [kutuNo], (err, sonuc) => {
        if (err) {
            console.error("Kampanya kutusu silinirken hata:", err);
            return res.status(500).json({ hata: "Kutu veritabanından kaldırılamadı." });
        }
        onbellekTemizle();
        res.json({ mesaj: `${kutuNo}. kampanya kutusu kaldırıldı.` });
    });
});

// 🛡️ GENEL HATA YAKALAYICI (TÜM BEKLENMEYEN HATALAR İÇİN)
// İç hata detayları kullanıcıya gösterilmez, sadece sunucu loguna yazılır.
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const mesaj = err.code === 'LIMIT_FILE_SIZE'
            ? 'Dosya çok büyük! En fazla 15 MB yükleyebilirsiniz.'
            : 'Dosya yüklenirken bir sorun oluştu.';
        return res.status(400).json({ hata: mesaj });
    }
    if (err && typeof err.message === 'string' && err.message.startsWith('Sadece resim dosyası')) {
        return res.status(400).json({ hata: err.message });
    }
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ hata: 'Geçersiz istek formatı.' });
    }
    console.error("Yakalanamayan Sunucu Hatası:", err);
    res.status(500).json({ hata: "Sunucuda beklenmeyen bir hata oluştu." });
});

// Sunucuyu Çalıştırma
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Tezgahtar (Sunucu) hazır! http://localhost:${PORT} adresinden istekleri bekliyor...`);
});