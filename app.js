/* ============================================================
   CONFIG
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
   MARKA AYARLARI
============================================================ */
const TABLE         = CONFIG.table;
const WH_KARGOLA    = CONFIG.webhooks.kargola;
const WH_BARKOD     = CONFIG.webhooks.barkod;
const WH_IPTAL      = CONFIG.webhooks.iptal;

/* ============================================================
   GLOBAL STATE
============================================================ */
let currentTab = "bekleyen";
let currentPage = 1;
const PAGE_SIZE = 10;
let selectedOrder = null;

function toast(msg, ms=2000){
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), ms);
}

function getColumnCount(){ return currentTab==="bekleyen" ? 6 : 7; }

function renderTableHeader(){
  const head = document.getElementById("ordersHeadRow");
  head.innerHTML = currentTab === "bekleyen"
  ? `<th>No</th><th>İsim</th><th>Ürün</th><th>Tutar</th><th>Durum</th><th>Sipariş Alan</th>`
  : `<th>No</th><th>İsim</th><th>Ürün</th><th>Tutar</th><th>Durum</th><th>Kargo Kod</th><th>Aç / Sorgula</th>`;
}

/* ==================== LIST ==================== */
async function loadOrders(reset=false){
  const tbody = document.getElementById("ordersBody");
  if(reset){ currentPage=1; tbody.innerHTML=""; }
  renderTableHeader();

  let q = db.from(TABLE).select("*", { count:"exact" });
  if(currentTab==="bekleyen")   q=q.eq("kargo_durumu","Bekliyor");
  if(currentTab==="hazirlandi") q=q.eq("kargo_durumu","Hazırlandı");
  if(currentTab==="kargolandi") q=q.eq("kargo_durumu","Kargolandı");
  if(currentTab==="iptal")      q=q.eq("kargo_durumu","İptal");
  if(currentTab==="sorunlu")    q=q.in("shipmentStatusCode",[6,7]); // 6: sorunlu, 7: iade
  if(currentTab==="tamamlandi") q=q.eq("shipmentStatusCode",5);

  const start=(currentPage-1)*PAGE_SIZE, end=start+PAGE_SIZE-1;
  const { data, error, count } = await q.order("siparis_no",{ascending:false}).range(start,end);
  if(error){ tbody.innerHTML = `<tr><td colspan="${getColumnCount()}">HATA: ${error.message}</td></tr>`; return; }
  if(!data || data.length===0){ tbody.innerHTML = `<tr><td colspan="${getColumnCount()}">Kayıt bulunamadı</td></tr>`; document.getElementById("loadMoreBtn").style.display="none"; return; }
  renderRows(data);
  document.getElementById("loadMoreBtn").style.display = count > currentPage*PAGE_SIZE ? "block":"none";
}

function parseProduct(v){ try{ if(v && v.startsWith("[") && v.endsWith("]")) return JSON.parse(v).join(", "); }catch{} return v || "-"; }

function renderRows(rows){
  const tbody = document.getElementById("ordersBody");
  rows.forEach(o=>{
    const tr=document.createElement("tr");
    const durum = ["kargolandi","tamamlandi","sorunlu"].includes(currentTab) ? (o.shipmentStatus||"-") : (o.kargo_durumu||"-");
    const isTrackingTab = ["kargolandi","tamamlandi","sorunlu"].includes(currentTab);
    const action = isTrackingTab ? `<button class="btn-open" onclick="event.stopPropagation(); openTrackingUrl('${o.kargo_takip_url||""}')">Sorgula</button>` : `<button class="btn-open">Aç</button>`;

    tr.innerHTML = currentTab==="bekleyen"
      ? `<td>${o.siparis_no}</td><td>${o.ad_soyad||"-"}</td><td>${parseProduct(o.urun_bilgisi)}</td><td>${o.toplam_tutar||"-"} TL</td><td>${durum}</td><td>${o.siparis_alan||"-"}</td>`
      : `<td>${o.siparis_no}</td><td>${o.ad_soyad||"-"}</td><td>${parseProduct(o.urun_bilgisi)}</td><td>${o.toplam_tutar||"-"} TL</td><td>${durum}</td><td>${o.kargo_takip_kodu||"-"}</td><td>${action}</td>`;

    tr.addEventListener("click", e=>{ if(e.target.classList.contains("btn-open")) return; openOrder(o.siparis_no); });
    tbody.appendChild(tr);
  });
}

function loadMore(){ currentPage++; loadOrders(false); }

/* ==================== SEARCH ==================== */
async function searchOrders(){
  const q = document.getElementById("searchInput").value.trim();
  if(!q) return loadOrders(true);
  const isNumber = !isNaN(Number(q));
  let parts = [
    `ad_soyad.ilike.%${q}%`,
    `siparis_tel.ilike.%${q}%`,
    `musteri_tel.ilike.%${q}%`,
    `adres.ilike.%${q}%`,
    `kargo_takip_kodu.ilike.%${q}%`
  ];
  if(isNumber) parts.unshift(`siparis_no.eq.${Number(q)}`);
  const { data, error } = await db.from(TABLE).select("*").or(parts.join(","));
  const tbody = document.getElementById("ordersBody");
  tbody.innerHTML = "";
  if(error || !data || data.length===0){ tbody.innerHTML = `<tr><td colspan="${getColumnCount()}">Kayıt bulunamadı</td></tr>`; document.getElementById("loadMoreBtn").style.display="none"; return; }
  renderRows(data);
  document.getElementById("loadMoreBtn").style.display="none";
}
function clearSearch(){ document.getElementById("searchInput").value=""; loadOrders(true); }
document.addEventListener("DOMContentLoaded", ()=>{
  const input=document.getElementById("searchInput");
  if(input) input.addEventListener("keydown", e=>{ if(e.key==="Enter") searchOrders(); });
});

/* ==================== DETAILS & BUTTON VISIBILITY ==================== */
async function openOrder(id){
  const { data } = await db.from(TABLE).select("*").eq("siparis_no", id).single();
  if(!data) return toast("Sipariş bulunamadı");
  selectedOrder = data;
  renderDetails();
  document.getElementById("orderModal").style.display="flex";
}
function closeModal(){ document.getElementById("orderModal").style.display="none"; }

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

  // Reset groups
  document.getElementById("actionButtons").style.display="flex";
  document.getElementById("editButtons").style.display="none";
  document.getElementById("restoreButtons").style.display="none";
  document.getElementById("cancelForm").style.display="none";

  // Button visibility by status
  const st = d.kargo_durumu || "";
  const btnPrepare = document.getElementById("btnPrepare");
  const btnCargo   = document.getElementById("btnCargo");
  const btnWaiting = document.getElementById("btnWaiting");
  const btnBarcode = document.getElementById("btnBarcode");
  const btnEdit    = document.querySelector("#actionButtons .btn-warning");
  const btnCancel  = document.querySelector("#actionButtons .btn-danger");

  // default
  [btnPrepare,btnCargo,btnWaiting,btnBarcode,btnEdit,btnCancel].forEach(b=>{ if(b) b.style.display="inline-block"; });

  if(st==="Bekliyor"){
    btnCargo.style.display="none";
    btnWaiting.style.display="none";
    btnBarcode.style.display="none";
  }else if(st==="Hazırlandı"){
    btnPrepare.style.display="none";
    btnBarcode.style.display="none";
  }else if(st==="Kargolandı"){
    btnPrepare.style.display="none";
    btnCargo.style.display="none";
    btnWaiting.style.display="none";
    btnEdit.style.display="none";
    btnCancel.style.display="none";
    // sadece barkod
  }else if(st==="Tamamlandı"){
    document.getElementById("actionButtons").style.display="none";
  }else if(st==="İptal"){
    document.getElementById("actionButtons").style.display="none";
    document.getElementById("restoreButtons").style.display="flex";
  }
}

/* ==================== ACTIONS ==================== */
async function markPrepared(){
  await db.from(TABLE).update({ kargo_durumu:"Hazırlandı" }).eq("siparis_no", selectedOrder.siparis_no);
  toast("Hazırlandı");
  closeModal(); loadOrders(true);
}
async function sendToCargo(){
  if(!confirm("Bu siparişi kargola?")) return;
  try{
    await fetch(WH_KARGOLA, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(selectedOrder) });
  }catch{}
  closeModal(); loadOrders(true);
}
async function setWaiting(){
  await db.from(TABLE).update({ kargo_durumu:"Bekliyor" }).eq("siparis_no", selectedOrder.siparis_no);
  toast("Bekleyenlere alındı");
  closeModal(); loadOrders(true);
}
async function printBarcode(){
  toast("Barkod isteği gönderildi");
}
function openCancelForm(){ document.getElementById("cancelForm").style.display="block"; document.getElementById("actionButtons").style.display="none"; }
function cancelCancelForm(){ document.getElementById("cancelForm").style.display="none"; document.getElementById("actionButtons").style.display="flex"; }
async function confirmCancel(){
  const reason = (document.getElementById("iptalInput").value||"").trim();
  if(!reason) return toast("İptal nedeni gerekli");
  await db.from(TABLE).update({ kargo_durumu:"İptal", iptal_nedeni:reason, iptal_tarihi:new Date().toISOString() }).eq("siparis_no", selectedOrder.siparis_no);
  toast("İptal edildi"); closeModal(); loadOrders(true);
}
async function restoreOrder(){
  await db.from(TABLE).update({ kargo_durumu:"Bekliyor", iptal_nedeni:null, iptal_tarihi:null }).eq("siparis_no", selectedOrder.siparis_no);
  toast("Geri alındı"); closeModal(); loadOrders(true);
}

/* ==================== TAB & INIT ==================== */
function setTab(tab){
  currentTab = tab;
  closeModal();
  document.querySelectorAll(".menu li").forEach(li=>li.classList.remove("active"));
  const el = document.getElementById("tab_"+tab); if(el) el.classList.add("active");
  localStorage.setItem("activeTab", tab);
  loadOrders(true);
}
document.addEventListener("DOMContentLoaded", ()=>{
  const saved = localStorage.getItem("activeTab") || "bekleyen";
  setTab(saved);
  // Modal dış tık kapatma
  document.addEventListener("click", (e)=>{
    const modal = document.getElementById("orderModal");
    const content = document.querySelector(".modal-content");
    if(modal && modal.style.display==="flex" && content && !content.contains(e.target)) modal.style.display="none";
  });
});

window.searchOrders = searchOrders;
window.clearSearch = clearSearch;
window.loadMore = loadMore;
window.setTab = setTab;
window.openOrder = openOrder;
window.closeModal = closeModal;
window.markPrepared = markPrepared;
window.sendToCargo = sendToCargo;
window.setWaiting = setWaiting;
window.printBarcode = printBarcode;
window.openCancelForm = openCancelForm;
window.cancelCancelForm = cancelCancelForm;
window.confirmCancel = confirmCancel;
window.restoreOrder = restoreOrder;
window.openTrackingUrl = (url)=>{ if(url) window.open(url,"_blank"); else toast("Link yok"); };