/* ===============================
   CONFIG
=============================== */
await window.waitConfig();

/* ===============================
   SUPABASE
=============================== */
const SUPABASE_URL = "https://jarsxtpqzqzhlshpmgot.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphcnN4dHBxenF6aGxzaHBtZ290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyODExMTcsImV4cCI6MjA3Nzg1NzExN30.98oYONSkb8XSDrfGW2FxhFmt2BLB5ZRo3Ho50GhZYgE";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ===============================
   MARKA AYARLARI
=============================== */
const TABLE         = CONFIG.table;
const WH_KARGOLA    = CONFIG.webhooks.kargola;
const WH_BARKOD     = CONFIG.webhooks.barkod;
const WH_IPTAL      = CONFIG.webhooks.iptal;
const WH_SEHIR_ILCE = CONFIG.webhooks.sehir_ilce;

/* ===============================
   GLOBAL
=============================== */
let currentTab = "bekleyen";
let currentPage = 1;
const PAGE_SIZE = 10;
let selectedOrder = null;

/* ===============================
   TAB HEADERS
=============================== */
function renderTableHeader(){
  const head = document.getElementById("ordersHeadRow");

  head.innerHTML = `
    <th>No</th>
    <th>İsim</th>
    <th>Ürün</th>
    <th>Tutar</th>
    <th>Durum</th>
    <th>Kargo Kod</th>
    <th>Aç / Sorgula</th>
  `;
}

/* ===============================
   LISTELEME (YENİ)
=============================== */
async function loadOrders(reset=false){
  const tbody = document.getElementById("ordersBody");
  if(reset){
    currentPage = 1;
    tbody.innerHTML = "";
  }

  let q = db.from(TABLE).select("*", { count: "exact" });

  /* -----------------------------
      YENİ FİLTRE MANTIĞI
     -----------------------------*/

  if(currentTab === "bekleyen")       q = q.eq("kargo_durumu","Bekliyor");
  else if(currentTab === "hazirlandi") q = q.eq("kargo_durumu","Hazırlandı");
  else if(currentTab === "kargolandi") q = q.eq("kargo_durumu","Kargolandı");

  /* 🔥 SORUNLU = shipmentStatusCode 6 */
  else if(currentTab === "sorunlu")   q = q.eq("shipmentStatusCode", 6);

  /* 🔥 TAMAMLANANLAR = shipmentStatusCode 5 */
  else if(currentTab === "tamamlandi") q = q.eq("shipmentStatusCode", 5);

  else if(currentTab === "iptal")      q = q.eq("kargo_durumu","İptal");


  const start = (currentPage - 1) * PAGE_SIZE;
  const end   = start + PAGE_SIZE - 1;

  const { data, error, count } = await q
    .order("siparis_no", { ascending:false })
    .range(start, end);

  if(error){
    tbody.innerHTML = `<tr><td colspan="7">Hata: ${error.message}</td></tr>`;
    return;
  }

  renderRows(data);

  const hasMore = count > currentPage * PAGE_SIZE;
  document.getElementById("loadMoreBtn").style.display = hasMore ? "block" : "none";
}

/* ===============================
   SATIRLARI RENDER ET
=============================== */
function renderRows(rows){
  const tbody = document.getElementById("ordersBody");

  rows.forEach(o=>{
    const tr = document.createElement("tr");

    const durum =
      ["sorunlu","tamamlandi"].includes(currentTab)
        ? (o.shipmentStatus || "-")
        : o.kargo_durumu;

    const action =
      ["kargolandi","tamamlandi","sorunlu"].includes(currentTab)
        ? `<button class="btn-open" onclick="event.stopPropagation();openTrackingUrl('${o.kargo_takip_url ?? ""}')">Sorgula</button>`
        : `<button class="btn-open">Aç</button>`;

    tr.innerHTML = `
      <td>${o.siparis_no}</td>
      <td>${o.ad_soyad}</td>
      <td>${parseProduct(o.urun_bilgisi)}</td>
      <td>${o.toplam_tutar} TL</td>
      <td>${durum}</td>
      <td>${o.kargo_takip_kodu ?? "-"}</td>
      <td>${action}</td>
    `;

    tr.onclick = e=>{
      if(e.target.classList.contains("btn-open")) return;
      openOrder(o.siparis_no);
    };

    tbody.appendChild(tr);
  });
}

/* ===============================
   LOAD MORE (+10)
=============================== */
function loadMore(){
  currentPage++;
  loadOrders(false);
}

/* ===============================
   ARAMA (YENİ)
=============================== */
async function searchOrders(){
  const q = document.getElementById("searchInput").value.trim();
  if(!q) return loadOrders(true);

  const { data } = await db.from(TABLE).select("*").or(`
    ad_soyad.ilike.%${q}%,
    siparis_no.eq.${q},
    siparis_tel.ilike.%${q}%,
    musteri_tel.ilike.%${q}%
  `);

  document.getElementById("ordersBody").innerHTML = "";
  renderRows(data);
}

function clearSearch(){
  document.getElementById("searchInput").value = "";
  loadOrders(true);
}

/* ===============================
   TRACKING URL
=============================== */
function openTrackingUrl(url){
  if(!url) return;
  window.open(url,"_blank");
}

/* ===============================
   DETAY + BUTONLAR
=============================== */
async function openOrder(id){
  const { data } = await db.from(TABLE).select("*").eq("siparis_no", id).single();
  selectedOrder = data;
  renderDetails();
  document.getElementById("orderModal").style.display="flex";
}

function closeModal(){
  document.getElementById("orderModal").style.display="none";
}

/* (Senin eski renderDetails kodun tam bırakıldı — değiştirmedim) */

/* ===============================
   KARGOLA → LİSTE YENİLENSİN
=============================== */
async function sendToCargo(){

  const ok = confirm("Bu sipariş DHL'e gönderilecek. Emin misiniz?");
  if(!ok) return;

  await fetch(WH_KARGOLA,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(selectedOrder)
  });

  // 🔥 LİSTE ANINDA YENİLENİR
  closeModal();
  loadOrders(true);
}

/* ===============================
   TAB KONTROLÜ (YENİ)
=============================== */
function setTab(tab){
  currentTab = tab;

  document.querySelectorAll(".menu li").forEach(li=>li.classList.remove("active"));
  const el = document.getElementById("tab_"+tab);
  if(el) el.classList.add("active");

  loadOrders(true);
}

/* LocalStorage kalıcılık */
window.setTabAndSave = (tab)=>{
  localStorage.setItem("activeTab", tab);
  setTab(tab);
};

/* ===============================
   EXPORT
=============================== */
window.searchOrders = searchOrders;
window.clearSearch = clearSearch;
window.loadMore = loadMore;
window.setTab = setTab;
window.openOrder = openOrder;
window.closeModal = closeModal;
window.sendToCargo = sendToCargo;

/* ===============================
   BAŞLAT
=============================== */
document.addEventListener("DOMContentLoaded", ()=>{

  // ENTER ile arama
  document.getElementById("searchInput").addEventListener("keydown", e=>{
    if(e.key === "Enter") searchOrders();
  });

  // Sekmeyi geri yükle
  const saved = localStorage.getItem("activeTab") || "bekleyen";
  setTab(saved);
});
