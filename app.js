/* ============================================================
   CONFIG YÜKLENENE KADAR BEKLE
============================================================ */
await window.waitConfig();

/* ============================================================
   SUPABASE
============================================================ */
const SUPABASE_URL = "https://jarsxtpqzqzhlshpmgot.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphcnN4dHBxenF6aGxzaHBtZ290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyODExMTcsImV4cCI6MjA3Nzg1NzExN30.98oYONSkb8XSDrfGW2FxhFmt2BLB5ZRo3Ho50GhZYgE";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ============================================================
   REFERANS VERİLER (ŞEHİR / İLÇE)
============================================================ */
const cityCache = [];
const districtCache = new Map();

/* ============================================================
   MARKA AYARLARI
============================================================ */
const TABLE         = CONFIG.table;
const WH_KARGOLA    = CONFIG.webhooks.kargola;
const WH_BARKOD     = CONFIG.webhooks.barkod;
const WH_IPTAL      = CONFIG.webhooks.iptal;
const WH_SEHIR_ILCE = CONFIG.webhooks.sehir_ilce;

/* ============================================================
   GLOBAL STATE
============================================================ */
let currentTab = "bekleyen";
let currentPage = 1;
const PAGE_SIZE = 10;
let selectedOrder = null;

const busy = { kargola: new Set(), barkod: new Set() };

/* ============================================================
   UI HELPERS
============================================================ */
function getColumnCount(){
  return currentTab === "bekleyen" ? 6 : 7;
}

function renderTableHeader(){
  const head = document.getElementById("ordersHeadRow");
  if(!head) return;

  head.innerHTML = currentTab === "bekleyen"
    ? `
      <th>No</th>
      <th>İsim</th>
      <th>Ürün</th>
      <th>Tutar</th>
      <th>Durum</th>
      <th>Sipariş Alan</th>
    `
    : `
      <th>No</th>
      <th>İsim</th>
      <th>Ürün</th>
      <th>Tutar</th>
      <th>Durum</th>
      <th>Kargo Kod</th>
      <th>Aç / Sorgula</th>
    `;
}

function toast(msg, ms=2500){
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function toggleLoadMore(visible){
  const btn = document.getElementById("loadMoreBtn");
  if(!btn) return;
  btn.style.display = visible ? "block" : "none";
}

document.querySelectorAll(".sidebar .menu li").forEach(item => {
  item.addEventListener("click", () => {
    const sidebar = document.querySelector(".sidebar");
    if (sidebar.classList.contains("open")) {
      sidebar.classList.remove("open");
    }
  });
});

function confirmModal({title, text, confirmText="Onayla", cancelText="Vazgeç"}){
  return new Promise(res=>{
    const root = document.getElementById("alertRoot");
    const wrap = document.createElement("div");
    wrap.className = "alert-backdrop";
    wrap.innerHTML = `
      <div class="alert-card">
        <div class="alert-title">${title}</div>
        <div class="alert-text">${(text||"").replace(/\n/g,"<br>")}</div>
        <div class="alert-actions">
          <button class="btn-ghost" id="cCancel">${cancelText}</button>
          <button class="btn-brand" id="cOk">${confirmText}</button>
        </div>
      </div>`;
    root.appendChild(wrap);
    wrap.querySelector("#cCancel").onclick = ()=>{ wrap.remove(); res(false); };
    wrap.querySelector("#cOk").onclick     = ()=>{ wrap.remove(); res(true); };
  });
}

function logout(){
  localStorage.clear();
  location.href = "login.html";
}

/* ============================================================
   LİSTELEME
============================================================ */
async function loadOrders(reset=false){
  const tbody = document.getElementById("ordersBody");
  if(reset){
    currentPage = 1;
    tbody.innerHTML = "";
  }

  renderTableHeader();

  let q = db.from(TABLE).select("*", { count: "exact" });

  if(currentTab==="bekleyen")   q = q.eq("kargo_durumu","Bekliyor");
  if(currentTab==="hazirlandi") q = q.eq("kargo_durumu","Hazırlandı");
  if(currentTab==="kargolandi") q = q.eq("kargo_durumu","Kargolandı");
  if(currentTab==="tamamlandi") q = q.eq("shipmentStatusCode",5);
  if(currentTab==="sorunlu")    q = q.in("shipmentStatusCode",[6,7]);
  if(currentTab==="iptal")      q = q.eq("kargo_durumu","İptal");

  const start = (currentPage - 1) * PAGE_SIZE;
  const end   = currentPage * PAGE_SIZE - 1;

  q = q.order("siparis_no", { ascending:false })
       .range(start, end);

  const { data, error, count } = await q;
  if(error){
    tbody.innerHTML = `<tr><td colspan="${getColumnCount()}">HATA: ${error.message}</td></tr>`;
    toggleLoadMore(false);
    return;
  }

  const hasMore = typeof count === "number"
    ? count > currentPage * PAGE_SIZE
    : (data?.length === PAGE_SIZE);

  if(!reset && (!data || data.length === 0)){
    toggleLoadMore(false);
    return toast("Gösterilecek başka kayıt yok.");
  }

  renderTable(data, { append: !reset, hasMore });
}

function renderTable(rows, { append=false, hasMore } = {}){
  const tbody = document.getElementById("ordersBody");
  if(!tbody) return;

  if(!append) tbody.innerHTML = "";

  if(!rows || rows.length===0){
    if(!append) tbody.innerHTML = `<tr><td colspan="${getColumnCount()}">Kayıt bulunamadı</td></tr>`;
    toggleLoadMore(false);
    return;
  }

  rows.forEach(o=>{
    const tr = document.createElement("tr");

    const durumText = ["kargolandi", "tamamlandi", "sorunlu"].includes(currentTab)
      ? (o.shipmentStatus ?? "—")
      : o.kargo_durumu;

    const isTrackingTab = ["kargolandi", "tamamlandi", "sorunlu"].includes(currentTab);
    const isPendingTab = currentTab === "bekleyen";
    const isPreparedTab = currentTab === "hazirlandi";

    const actionBtn = isTrackingTab
      ? `<button class="btn-open" onclick="event.stopPropagation(); openTrackingUrl('${o.kargo_takip_url ?? ""}')">Sorgula</button>`
      : `<button class="btn-open">Aç</button>`;

    const errorPreview = isPreparedTab
      ? `<button class="error-chip" onclick="event.stopPropagation(); showErrorDetail(${JSON.stringify(o.gonder_hata_bilgisi ?? "")})" title="Detayı görmek için tıkla">
           <span class="error-chip__label">Hata</span>
           <span class="error-chip__text">${escapeHtml(shortenError(o.gonder_hata_bilgisi))}</span>
         </button>`
      : actionBtn;


    tr.innerHTML = isPendingTab
      ? `
        <td>${o.siparis_no}</td>
        <td>${o.ad_soyad}</td>
        <td>${parseProduct(o.urun_bilgisi)}</td>
        <td>${o.toplam_tutar} TL</td>
        <td>${durumText}</td>
        <td>${o.siparis_alan ?? "-"}</td>
      `
      : `
        <td>${o.siparis_no}</td>
        <td>${o.ad_soyad}</td>
        <td>${parseProduct(o.urun_bilgisi)}</td>
        <td>${o.toplam_tutar} TL</td>
        <td>${durumText}</td>
        <td>${o.kargo_takip_kodu ?? "-"}</td>
        <td>${errorPreview}</td>
      `;

    tr.addEventListener("click", (e)=>{
      if(e.target.classList.contains("btn-open") || e.target.closest(".error-chip")) return;
      openOrder(o.siparis_no);
    });

    tbody.appendChild(tr);
  });

  if(typeof hasMore === "boolean") toggleLoadMore(hasMore);
}

function parseProduct(v){
  if(!v) return "-";
  try{
    if(v.startsWith("[") && v.endsWith("]")) return JSON.parse(v).join(", ");
  }catch{}
  return v;
}

function shortenError(text, max=55){
  if(!text) return "Hata bilgisi yok";
  if(text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function escapeHtml(str=""){
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ============================================================
   KARGO SORGULAMA
============================================================ */
function openTrackingUrl(url){
  if(!url) return toast("Kargo sorgulama linki yok.");
  window.open(url, "_blank");
}

/* ============================================================
   İPTALDEN SİLME
============================================================ */
async function deleteCanceledOrder() {

  const ok = await confirmModal({
    title: "Siparişi Sil",
    text: "Bu sipariş tamamen listelerden kaldırılacaktır. İşlem geri alınamaz.\nOnaylıyor musunuz?",
    confirmText: "Sil",
    cancelText: "Vazgeç"
  });

  if (!ok) return;

  await db.from(TABLE)
    .update({ 
      kargo_durumu: "Silindi",
      iptal_nedeni: null,
      iptal_tarihi: new Date().toISOString()
    })
    .eq("siparis_no", selectedOrder.siparis_no);

  toast("Sipariş silindi");
  closeModal();

  setTimeout(() => loadOrders(true), 1000);
}

/* ============================================================
   HATA DETAY
============================================================ */
function showErrorDetail(message=""){
  const root = document.getElementById("alertRoot");
  const wrap = document.createElement("div");
  wrap.className = "alert-backdrop";

  const safeMessage = message || "Gönderim hatası kaydı bulunamadı.";

  wrap.innerHTML = `
    <div class="alert-card error-detail-card">
      <div class="alert-title">Gönderim Hata Bilgisi</div>
      <div class="alert-text">
        <textarea class="error-detail-text" readonly>${escapeHtml(safeMessage)}</textarea>
      </div>
      <div class="alert-actions">
        <button class="btn-brand" id="errorClose">Kapat</button>
      </div>
    </div>`;

  root.appendChild(wrap);

  wrap.querySelector("#errorClose").onclick = () => wrap.remove();
}

/* ============================================================
   API ÖNİZLEME
============================================================ */
function showApiResult(content) {
  const root = document.getElementById("alertRoot");
  root.querySelectorAll(".alert-backdrop").forEach(n => n.remove());

  const wrap = document.createElement("div");
  wrap.className = "alert-backdrop";

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) wrap.remove();
  });

  const isString = typeof content === "string";
  const html = isString && content.trim().startsWith("<img")
    ? content
    : `<textarea class="error-detail-text" readonly>${
        isString ? content : JSON.stringify(content, null, 2)
      }</textarea>`;

  wrap.innerHTML = `
    <div class="alert-card" style="pointer-events:auto">
      <div class="alert-title">API Yanıtı</div>
      <div class="alert-text">${html}</div>
      <div class="alert-actions">
        <button class="btn-brand" id="apiOkBtn">Kapat</button>
      </div>
    </div>
  `;
  root.appendChild(wrap);

  wrap.querySelector("#apiOkBtn").onclick = () => wrap.remove();
}

/* ============================================================
   DETAY MODAL
============================================================ */
async function openOrder(id){
  const { data } = await db.from(TABLE).select("*").eq("siparis_no", id).single();
  if(!data) return toast("Sipariş bulunamadı!");
  selectedOrder = data;
  renderDetails();
  document.getElementById("orderModal").style.display = "flex";
}

function closeModal(){ 
  document.getElementById("orderModal").style.display = "none"; 
}


function renderDetails() {
  const d = selectedOrder;

  // TÜM BUTONLARI RESETLE
  document.querySelectorAll("#actionButtons button").forEach(btn => {
    btn.style.display = "inline-block";
  });

  // DETAY HTML
  document.getElementById("orderDetails").innerHTML = `
    <p><b>No:</b> ${d.siparis_no}</p>
    <p><b>İsim:</b> ${d.ad_soyad}</p>
    <p><b>Sipariş Alan:</b> ${d.siparis_alan ?? "-"}</p>
    <p><b>Sipariş Alan Tel:</b> ${d.siparis_tel}</p>
    <p><b>Müşteri Tel:</b> ${d.musteri_tel}</p>
    <p><b>Adres:</b> ${d.adres}</p>

    <p>
      <b>Şehir / İlçe:</b> ${d.sehir} / ${d.ilce}
      <button class="btn-mini" onclick="queryCityDistrictCodes()">Sor</button>
      <br><small>Kodlar: ${d.sehir_kodu ?? "-"} / ${d.ilce_kodu ?? "-"}</small>
    </p>

    <p><b>Ürün:</b> ${parseProduct(d.urun_bilgisi)}</p>
    <p><b>Adet:</b> ${d.kargo_adet ?? "-"}</p>
    <p><b>KG:</b> ${d.kargo_kg ?? "-"}</p>
    <p><b>Tutar:</b> ${d.toplam_tutar} TL</p>
    <p><b>Ödeme:</b> ${d.odeme_sekli}</p>
    <p><b>Not:</b> ${d.notlar ?? "-"}</p>
  `;

  const iptal = d.kargo_durumu === "İptal";
  const kargo = d.kargo_durumu === "Kargolandı";
  const tamam = d.kargo_durumu === "Tamamlandı";

  document.getElementById("btnPrepare").style.display =
    d.kargo_durumu === "Bekliyor" ? "inline-block" : "none";

  document.getElementById("btnCargo").style.display =
    d.kargo_durumu === "Hazırlandı" ? "inline-block" : "none";

  // *** BARKOD BAS BUTONU ***
  document.getElementById("btnBarcode").style.display =
    kargo ? "inline-block" : "none";

  if (tamam) {
    document.querySelectorAll("#actionButtons button").forEach(btn => {
      btn.style.display = "none";
    });
    document.querySelector("#actionButtons .btn-close").style.display = "inline-block";
  }

  document.getElementById("actionButtons").style.display = iptal ? "none" : "flex";
  document.getElementById("restoreButtons").style.display = iptal ? "flex" : "none";

  document.getElementById("editButtons").style.display = "none";
  document.getElementById("cancelForm").style.display = "none";
}

/* ============================================================
   DÜZENLEME
============================================================ */
async function enterEditMode(){
  const d = selectedOrder;
  const cities = await loadCities();
  const selectedCityId = findCityIdForOrder(d, cities);
  const districts = selectedCityId ? await loadDistricts(selectedCityId) : [];
  const selectedDistrictId = findDistrictIdForOrder(d, districts);

  document.getElementById("orderDetails").innerHTML = `
    <div class="edit-card">
      <div class="edit-card__header">
        <div>
          <p class="eyebrow">Sipariş No</p>
          <p class="title">${d.siparis_no}</p>
        </div>
        <div class="pill">Durum: ${d.kargo_durumu}</div>
      </div>

      <div class="edit-grid">
        <div class="form-field"><label>Ad Soyad</label><input id="ad_soyad" value="${d.ad_soyad??""}"></div>
        <div class="form-field"><label>Sipariş Tel</label><input id="siparis_tel" value="${d.siparis_tel??""}"></div>
        <div class="form-field"><label>Müşteri Tel</label><input id="musteri_tel" value="${d.musteri_tel??""}"></div>

        <div class="form-field full-row"><label>Adres</label><textarea id="adres">${d.adres??""}</textarea></div>

        <div class="form-field">
          <label>Şehir</label>
          <select id="sehir_select"></select>
          <input id="sehir" type="hidden" value="${d.sehir ?? ""}">
        </div>

        <div class="form-field">
          <label>İlçe</label>
          <select id="ilce_select"></select>
          <input id="ilce" type="hidden" value="${d.ilce ?? ""}">
        </div>

        <div class="form-field"><label>Kargo Adet</label><input id="kargo_adet" value="${d.kargo_adet??""}"></div>
        <div class="form-field"><label>Kargo KG</label><input id="kargo_kg" value="${d.kargo_kg??""}"></div>

        <div class="form-field full-row"><label>Ürün</label><textarea id="urun_bilgisi">${d.urun_bilgisi??""}</textarea></div>
        <div class="form-field"><label>Tutar</label><input id="toplam_tutar" value="${d.toplam_tutar??""}"></div>
        <div class="form-field"><label>Ödeme</label><input id="odeme_sekli" value="${d.odeme_sekli??""}"></div>
        <div class="form-field full-row"><label>Not</label><textarea id="notlar">${d.notlar??""}</textarea></div>
      </div>
    </div>`;

  renderOptions(document.getElementById("sehir_select"), cities, {
    placeholder: "Şehir seçiniz",
    selectedValue: selectedCityId,
  });

  await populateDistrictSelect(selectedCityId, selectedDistrictId);

  document.getElementById("actionButtons").style.display = "none";
  document.getElementById("editButtons").style.display = "flex";
}

/* ============================================================
   DURUM GÜNCELLEME
============================================================ */
async function setWaiting(){
  await db.from(TABLE)
    .update({ kargo_durumu: "Bekliyor" })
    .eq("siparis_no", selectedOrder.siparis_no);

  toast("Sipariş Bekliyor olarak güncellendi");
  closeModal();
  setTimeout(() => loadOrders(true), 1000);
}

async function markPrepared(){
  await db.from(TABLE)
    .update({ kargo_durumu:"Hazırlandı" })
    .eq("siparis_no", selectedOrder.siparis_no);

  printSiparis(selectedOrder);
  toast("Sipariş Hazırlandı");
  closeModal();
  setTimeout(() => loadOrders(true), 1000);
}

async function sendToCargo(){

  const ok = await confirmModal({
    title: "Kargoya Gönder",
    text: `Bu sipariş KARGOLANDI olarak işaretlenecek ve DHL'e iletilecektir.
İşlem geri alınamaz.`,
    confirmText: "Evet, Kargola",
    cancelText: "Vazgeç"
  });

  if(!ok) return;

  const key = selectedOrder.siparis_no;
  if(busy.kargola.has(key)) return toast("Bu sipariş zaten işleniyor.");
  busy.kargola.add(key);

  try{
    const res = await fetch(WH_KARGOLA, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(selectedOrder)
    });

    let payload = {};
    try { payload = await res.json(); } catch {}

    toast(payload?.message || "Kargoya gönderildi.");

    if (payload?.png) {
      showApiResult(`<img src="${payload.png}" style="max-width:360px;border:1px solid #ccc;border-radius:8px">`);
    }
    else if (payload?.apiResult || payload?.zpl || payload?.result) {
      showApiResult(payload.apiResult || payload.zpl || payload.result);
    }

    setTimeout(()=>loadOrders(true), 1000);

  }catch(e){
    toast("Gönderim hatası");
  }finally{
    setTimeout(()=>busy.kargola.delete(key), 20000);
  }
}

/* ============================================================
   BARKOD PDF MERGE & OTOMATİK YAZDIRMA
============================================================ */
async function mergePdfs(base64List){
  const { PDFDocument } = PDFLib;
  const merged = await PDFDocument.create();

  for (const b64 of base64List){
    const pdfBytes = Uint8Array.from(atob(b64), x=>x.charCodeAt(0));
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }

  const mergedBytes = await merged.save();
  return btoa(String.fromCharCode(...mergedBytes));
}

async function barkodBas(siparisNo){

  const { data, error } = await db
    .from(TABLE)
    .select("zpl_base64")
    .eq("siparis_no", siparisNo)
    .single();

  if(error || !data){
    return toast("PDF kaydı bulunamadı");
  }

  let list = [];

  try{
    const arr = JSON.parse(data.zpl_base64);
    list = arr.map(x => x.data);
  }catch(e){
    return toast("PDF formatı okunamadı");
  }

  if(!list.length){
    return toast("PDF listesi boş");
  }

  const merged = await mergePdfs(list);

  const win = window.open("barkod_print.html", "_blank");
  const timer = setInterval(()=>{
    if(win && win.showPdf){
      clearInterval(timer);
      win.showPdf(merged);
    }
  }, 200);
}

/* ============================================================
   GLOBAL EXPORT (module olmadığı için artık ÇALIŞIR)
============================================================ */
window.logout               = logout;
window.loadOrders           = loadOrders;
window.loadMore             = loadMore;
window.setTab               = setTab;
window.searchOrders         = searchOrders;
window.clearSearch          = clearSearch;

window.openOrder            = openOrder;
window.closeModal           = closeModal;

window.openTrackingUrl      = openTrackingUrl;
window.showErrorDetail      = showErrorDetail;

window.setWaiting           = setWaiting;
window.markPrepared         = markPrepared;
window.sendToCargo          = sendToCargo;

window.enterEditMode        = enterEditMode;
window.saveEdit             = saveEdit;
window.cancelEdit           = cancelEdit;

window.openCancelForm       = openCancelForm;
window.cancelCancelForm     = cancelCancelForm;
window.confirmCancel        = confirmCancel;
window.restoreOrder         = restoreOrder;

window.queryCityDistrictCodes = queryCityDistrictCodes;
window.deleteCanceledOrder    = deleteCanceledOrder;

window.printSiparis         = printSiparis;
window.barkodBas            = barkodBas;

/* ============================================================
   BAŞLAT
============================================================ */
loadOrders(true);
