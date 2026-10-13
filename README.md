# 📚 İrşad Kitapevi - Özel E-Ticaret Platformu & Yönetim Paneli

Gaziantep merkezli İrşad Kitapevi için özel olarak geliştirilmiş; yüksek performanslı, güvenli ve ölçeklenebilir e-ticaret web uygulaması ve yönetim (Admin) paneli.

![Node.js](https://img.shields.io/badge/Node.js-v18+-green?style=flat-square&logo=node.js)
![Express.js](https://img.shields.io/badge/Express.js-4.x-lightgrey?style=flat-square&logo=express)
![MySQL](https://img.shields.io/badge/MySQL-8.0-blue?style=flat-square&logo=mysql)
![Nginx](https://img.shields.io/badge/Nginx-Reverse%20Proxy-green?style=flat-square&logo=nginx)
![PM2](https://img.shields.io/badge/PM2-Cluster%20%26%20AutoRestart-blueviolet?style=flat-square)

---

## 🚀 Öne Çıkan Mühendislik Özellikleri

- **Güvenli Sipariş & Veri Yönetimi:** Fiyat manipülasyonlarını önlemek amacıyla tüm sepet hesaplamaları sunucu tarafında doğrulanır. Veri bütünlüğünü korumak adına **ACID uyumlu MySQL Transactions** kullanılır.
- **Performans & İstemci/Sunucu Optimizasyonu:**
  - `Sharp` kütüphanesi ile otomatik WebP görsel dönüşümü.
  - İstemci tarafında `HTML5 Canvas API` ile yükleme öncesi otomatik görsel küçültme (`resmiKucult`).
  - Gzip sıkıştırma ve In-Memory Caching mimarisi ile sunucu RAM kullanımı **~130 MB** seviyesinde tutulmuştur.
- **Güvenlik Mimarisi:** Role-Based Access Control (RBAC) ile JWT yetkilendirme, `Bcrypt` parola hash'leme, `express-rate-limit` ile Brute-Force/Spam koruması ve `Helmet` HTTP başlık güvenliği.
- **DevOps & Sunucu Mimarisi:** Linux (Ubuntu VPS) üzerinde **Nginx Reverse Proxy**, SSL/TLS sertifikasyonu ve **PM2** süreç yöneticisi ile sıfır kesintili güncelleme (**Zero-Downtime Deployment**).
- **SEO & Arama Motoru Entegrasyonu:** Schema.org (JSON-LD) yapısal veri entegrasyonu, Open Graph meta mimarisi ve dinamik URL SEO optimizasyonu.

---

## 🛠️ Teknoloji Yığını (Tech Stack)

- **Backend:** Node.js, Express.js, MySQL (mysql2 pool), JWT, Bcrypt, Sharp, Nodemailer
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 (Custom Responsive)
- **DevOps / Server:** Ubuntu VPS, Nginx, PM2, Git
