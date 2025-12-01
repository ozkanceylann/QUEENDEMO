# queen

## Siteyi Yayına Alma ("Nasıl yükleyeceğim?")

Bu proje tamamen statik dosyalardan oluşur (HTML, CSS, JS). Yayına almak için aşağıdaki adımları izleyebilirsiniz:

1. **Dosyaları hazırla:** Depodaki tüm dosyaları (örn. `index.html`, `style.css`, `app.js`, `rapor.html`, `config.js`, görseller) tek bir klasöre kopyalayın.
2. **Ortam değişkenlerini ayarla:** `config.js` içindeki Supabase URL/anahtar bilgilerini kendi ortamınıza göre güncellediğinizden emin olun.
3. **Sunucuya aktar:** Hazırladığınız klasörü bir statik barındırma servisine (Netlify, Vercel, GitHub Pages) veya herhangi bir HTTP sunucusuna (Apache/Nginx) yükleyin.
   - Netlify/Vercel: Depoyu bağlayın veya klasörü sürükleyip bırakın; özel build gerekmez.
   - Klasik sunucu: Dosyaları `/var/www/` altına kopyalayıp sunucu kökünü bu klasöre yönlendirin.
4. **SSL ve alan adı:** Alan adınızı barındırma servisine yönlendirin ve HTTPS/SSL sertifikasını etkinleştirin (Netlify/Vercel otomatik sağlar).
5. **Test edin:** Yayın adresinde oturum açıp sipariş listeleri, raporlar ve Supabase entegrasyonunun çalıştığını doğrulayın.

> İpucu: Yerelde test etmek için klasöre girip `npx serve` (veya `python -m http.server`) komutuyla basit bir statik sunucu başlatabilirsiniz.
