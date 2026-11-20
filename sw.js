// ============ SERVICE WORKER: UYGULAMANIN İNTERNETSİZ ÇALIŞMASINI SAĞLAR ============
// Tarayıcı bu dosyayı arka planda çalıştırır. Uygulamanın dosyalarını telefona kaydeder (önbellek),
// internet yokken de onları oradan açar.
//
// butce.html'i güncellediğinde bir şey yapmana gerek yok: telefon internete bağlanınca
// yeni hali kendiliğinden gelir.
// ⚠️ Simgeleri ya da manifest.json'ı değiştirirsen aşağıdaki SURUM numarasını bir artır
// (ör. "v1" → "v2"); böylece eski kopyalar silinir.
const SURUM = "v4"; // v2: adı CebimeGetir oldu · v3: yeni yeşil cep + ₺ simgesi · v4: gstatic.com (Firebase) önbelleği
const ONBELLEK = "butcem-" + SURUM;

// Uygulamanın kendi dosyaları: ilk açılışta hepsi telefona indirilir
const DOSYALAR = [
  "./",
  "./index.html",
  "./butce.html",
  "./manifest.json",
  "./ikon-192.png",
  "./ikon-512.png",
  "./ikon-maskable-512.png",
  "./apple-touch-icon.png"
];

// 1) YÜKLEME: dosyaları önbelleğe al
self.addEventListener("install", function (olay) {
  olay.waitUntil(
    caches.open(ONBELLEK)
      .then(function (onbellek) { return onbellek.addAll(DOSYALAR); })
      .then(function () { return self.skipWaiting(); }) // yeni sürüm beklemeden devreye girsin
  );
});

// 2) ETKİNLEŞTİRME: eski sürümlerin önbelleklerini sil
self.addEventListener("activate", function (olay) {
  olay.waitUntil(
    caches.keys()
      .then(function (adlar) {
        return Promise.all(adlar
          .filter(function (ad) { return ad.startsWith("butcem-") && ad !== ONBELLEK; })
          .map(function (ad) { return caches.delete(ad); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// 3) İSTEKLER: her dosya isteğinde ne yapılacağı
self.addEventListener("fetch", function (olay) {
  const istek = olay.request;
  if (istek.method !== "GET") return;
  const url = new URL(istek.url);

  // a) Sayfanın kendisi: önce internetten en yeni hali dene (güncellemeler gelsin),
  //    internet yoksa ya da çok yavaşsa telefondaki kopyayı aç.
  if (istek.mode === "navigate") {
    olay.respondWith(
      zamanAsimli(fetch(istek), 4000)
        .then(function (cevap) {
          if (cevap && cevap.ok && !cevap.redirected) {
            // Sayfayı kendi adresiyle sakla (adresin sonundaki ?… kısmı olmadan)
            const temizAdres = url.origin + url.pathname;
            const kopya = cevap.clone();
            caches.open(ONBELLEK).then(function (o) { o.put(temizAdres, kopya); });
          }
          return cevap;
        })
        .catch(function () {
          // İnternet yok: bu sayfanın kayıtlı kopyası, o da yoksa uygulamanın ana sayfası
          return caches.match(istek, { ignoreSearch: true }).then(function (kayitli) {
            return kayitli || caches.match("./butce.html");
          });
        })
    );
    return;
  }

  // b) Google yazı tipleri ve gstatic.com dosyaları (Firebase giriş kütüphanesi
  //    www.gstatic.com/firebasejs/… adresinden gelir): telefonda varsa oradan, yoksa indirip sakla.
  //    Bu dosyaların adında sürüm numarası olduğu için içerikleri hiç değişmez; önbellekten vermek güvenli.
  //    (Giriş isteklerinin kendisi — googleapis.com, firebaseapp.com — önbelleğe ALINMAZ.)
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "gstatic.com" || url.hostname.endsWith(".gstatic.com")) {
    olay.respondWith(
      caches.match(istek).then(function (kayitli) {
        return kayitli || fetch(istek).then(function (cevap) {
          if (cevap && cevap.ok) { // sadece başarılı cevapları sakla
            const kopya = cevap.clone();
            caches.open(ONBELLEK).then(function (o) { o.put(istek, kopya); });
          }
          return cevap;
        });
      })
    );
    return;
  }

  // c) Uygulamanın diğer dosyaları (simgeler, manifest): önce telefondaki kopya
  if (url.origin === self.location.origin) {
    olay.respondWith(
      caches.match(istek, { ignoreSearch: true }).then(function (kayitli) {
        return kayitli || fetch(istek);
      })
    );
  }
});

// İnternet çok yavaşsa (ör. tek çizgi) sonsuza kadar beklemesin
function zamanAsimli(soz, ms) {
  return new Promise(function (tamam, hata) {
    const sayac = setTimeout(function () { hata(new Error("zaman aşımı")); }, ms);
    soz.then(function (c) { clearTimeout(sayac); tamam(c); },
             function (h) { clearTimeout(sayac); hata(h); });
  });
}
