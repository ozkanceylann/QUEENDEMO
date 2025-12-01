await window.waitConfig();

const SUPABASE_URL = "https://jarsxtpqzqzhlshpmgot.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphcnN4dHBxenF6aGxzaHBtZ290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyODExMTcsImV4cCI6MjA3Nzg1NzExN30.98oYONSkb8XSDrfGW2FxhFmt2BLB5ZRo3Ho50GhZYgE";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* MARKA */
const TABLE         = CONFIG.table;
const WH_KARGOLA    = CONFIG.webhooks.kargola;
const WH_BARKOD     = CONFIG.webhooks.barkod;
const WH_IPTAL      = CONFIG.webhooks.iptal;
const WH_SEHIR_ILCE = CONFIG.webhooks.sehir_ilce;

/* STATE */
let currentTab = "bekleyen";
let currentPage = 1;
const PAGE_SIZE = 10;
let selectedOrder = null;

/* HELPERS */
function toast(msg, ms=2500){
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/* HEADER */
function renderTableHeader(){
  const head = document.getElementById("ordersHeadRow");
  if(!head) return;
  head.innerHTML = `
    <th>No</th>
    <th>İsim</th>
    <th>Ürün</th>
    <th>Tutar</th>
    <th>Durum</th>
    <th>Kargo Kod</th>
    <th>Aç / Sorgula</th>`;
}

/* LIST */
async function loadOrders(reset=false){
  const tbody = document.getElementById("ordersBody");
  if(reset){
    currentPage = 1;
    tbody.innerHTML = "";
  }

  renderTableHeader();

  let q = db.from(TABLE).select("*", { count: "exact" });

  if(currentTab==="bekleyen")   q = q.eq("kargo_durumu","Bekliyor");
  else if(currentTab==="hazirlandi") q = q.eq("kargo_durumu","Hazırlandı");
  else if(currentTab==="kargolandi") q = q.eq("kargo_durumu","Kargolandı");
  else if(currentTab==="iptal")      q = q.eq("kargo_durumu","İptal");

  // Yeni istekler
  else if(currentTab==="sorunlu")    q = q.eq("shipmentStatusCode", 6);
  else if(currentTab==="tamamlandi") q = q.eq("shipmentStatusCode", 5);

  const start = (currentPage - 1) * PAGE_SIZE;
  const end   = currentPage * PAGE_SIZE - 1;

  const { data, error, count } = await q.order("siparis_no", { ascending:false }).range(start, end);

  if(error){
    tbody.innerHTML = `<tr><td colspan="7">HATA: ${error.message}</td></tr>`;
    document.getElementById("loadMoreBtn").style.display = "none";
    return;
  }

  if(!data || data.length === 0){
    tbody.innerHTML = `<tr><td colspan="7">Kayıt bulunamadı</td></tr>`;
    document.getElementById("loadMoreBtn").style.display = "none";
    return;
  }

  renderRows(data);

  const hasMore = typeof count === "number" ? count > currentPage * PAGE_SIZE : (data.length === PAGE_SIZE);
  document.getElementById("loadMoreBtn").style.display = hasMore ? "block" : "none";
}

function parseProduct(v){
  if(!v) return "-";
  try{
    if(v.startsWith("[") && v.endsWith("]")) return JSON.parse(v).join(", ");
  }catch{}
  return v;
}

function renderRows(rows){
  const tbody = document.getElementById("ordersBody");
  rows.forEach(o=>{
    const tr = document.createElement("tr");

    const durum = (currentTab==="sorunlu" || currentTab==="tamamlandi")
      ? (o.shipmentStatus || "-")
      : (o.kargo_durumu || "-");

    const action = ["kargolandi","tamamlandi","sorunlu"].includes(currentTab)
      ? `<button class="btn-open" onclick="event.stopPropagation(); openTrackingUrl('${o.kargo_takip_url ?? ""}')">Sorgula</button>`
      : `<button class="btn-open">Aç</button>`;

    tr.innerHTML = `
      <td>${o.siparis_no}</td>
      <td>${o.ad_soyad ?? "-"}</td>
      <td>${parseProduct(o.urun_bilgisi)}</td>
      <td>${o.toplam_tutar ?? "-"} TL</td>
      <td>${durum}</td>
      <td>${o.kargo_takip_kodu ?? "-"}</td>
      <td>${action}</td>`;

    tr.addEventListener("click", e=>{
      if(e.target.classList.contains("btn-open")) return;
      openOrder(o.siparis_no);
    });

    tbody.appendChild(tr);
  });
}

/* LOAD MORE */
function loadMore(){
  currentPage++;
  loadOrders(false);
}

/* SEARCH */
async function searchOrders(){
  const q = document.getElementById("searchInput").value.trim();
  if(!q) return loadOrders(true);

  const { data, error } = await db.from(TABLE).select("*").or(`
    ad_soyad.ilike.%${q}%,
    siparis_no.eq.${q},
    siparis_tel.ilike.%${q}%,
    musteri_tel.ilike.%${q}%
  `).order("siparis_no",{ascending:false});

  const tbody = document.getElementById("ordersBody");
  tbody.innerHTML = "";
  if(error || !data || data.length===0){
    tbody.innerHTML = `<tr><td colspan="7">Kayıt bulunamadı</td></tr>`;
    document.getElementById("loadMoreBtn").style.display = "none";
    return;
  }
  renderRows(data);
  document.getElementById("loadMoreBtn").style.display = "none";
}

function clearSearch(){
  document.getElementById("searchInput").value="";
  loadOrders(true);
}

/* TRACKING */
function openTrackingUrl(url){
  if(!url){ toast("Kargo sorgulama linki yok."); return; }
  window.open(url, "_blank");
}

/* MODAL */
async function openOrder(id){
  const { data } = await db.from(TABLE).select("*").eq("siparis_no", id).single();
  if(!data) return toast("Sipariş bulunamadı!");
  selectedOrder = data;
  renderDetails();
  document.getElementById("orderModal").style.display = "flex";
}
function closeModal(){ document.getElementById("orderModal").style.display = "none"; }

/* Basit detay render: mevcut tasarıma dokunmuyoruz */
function renderDetails(){
  const d = selectedOrder;
  document.getElementById("orderDetails").innerHTML = `
    <p><b>No:</b> ${d.siparis_no}</p>
    <p><b>İsim:</b> ${d.ad_soyad}</p>
    <p><b>Sipariş Alan:</b> ${d.siparis_alan ?? "-"}</p>
    <p><b>Sipariş Tel:</b> ${d.siparis_tel ?? "-"}</p>
    <p><b>Müşteri Tel:</b> ${d.musteri_tel ?? "-"}</p>
    <p><b>Adres:</b> ${d.adres ?? "-"}</p>
    <p><b>Ürün:</b> ${parseProduct(d.urun_bilgisi)}</p>
    <p><b>Tutar:</b> ${d.toplam_tutar ?? "-"} TL</p>
    <p><b>Durum:</b> ${d.kargo_durumu ?? d.shipmentStatus ?? "-"}</p>
  `;
}

/* KARGO */
async function sendToCargo(){
  const ok = confirm("Bu siparişi kargola?");
  if(!ok) return;
  try{
    await fetch(WH_KARGOLA, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(selectedOrder) });
    toast("Kargoya gönderildi.");
  }catch(e){
    toast("Gönderim hatası");
  }finally{
    closeModal();
    loadOrders(true); // anında yenile
  }
}

/* TAB */
function setTab(tab){
  currentTab = tab;
  // modal açık kaldıysa kapat
  closeModal();

  document.querySelectorAll(".menu li").forEach(li=>li.classList.remove("active"));
  const el = document.getElementById("tab_"+tab);
  if(el) el.classList.add("active");
  loadOrders(true);
}

window.loadMore = loadMore;
window.searchOrders = searchOrders;
window.clearSearch = clearSearch;
window.setTab = setTab;
window.openOrder = openOrder;
window.closeModal = closeModal;
window.sendToCargo = sendToCargo;
window.openTrackingUrl = openTrackingUrl;

/* INIT */
document.addEventListener("DOMContentLoaded", ()=>{
  const saved = localStorage.getItem("activeTab") || "bekleyen";
  setTab(saved);

  document.getElementById("searchInput").addEventListener("keydown", e=>{
    if(e.key === "Enter") searchOrders();
  });
});