import { db } from './firebase.js';
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

export const FOLLOWUP_THRESHOLD_DAYS = 14;
export const STALE_CUSTOMER_DAYS = 30;
const COLLECTIONS = ['reps', 'shops', 'designs', 'visits', 'whatsappSends', 'orders'];

export function showConnectionError(err){
  const banner = document.createElement('div');
  banner.className = 'card error-banner';
  banner.innerHTML = `
    <strong>Could not load data from the database.</strong>
    <p>This usually means <code>assets/firebase.js</code> still has a placeholder API key, or Firestore hasn't been enabled/rules haven't been set for this project yet.</p>
    <p style="color:var(--text-muted);font-size:12px;">${err && err.message ? err.message : err}</p>
  `;
  document.querySelector('main').prepend(banner);
}

export function todayISO(){ return new Date().toISOString().slice(0,10); }

export function isoDaysAgo(n){
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0,10);
}

export function daysBetween(isoDate, refIso){
  const a = new Date(isoDate + 'T00:00:00');
  const b = new Date((refIso || todayISO()) + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

export function fmtMoney(n){
  const v = Number(n) || 0;
  return 'Rs ' + Math.round(v).toLocaleString('en-US');
}

export function resizeImageFile(file, maxDim, quality){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.onload = () => {
        let { width, height } = img;
        if(width > height && width > maxDim){ height *= maxDim / width; width = maxDim; }
        else if(height > maxDim){ width *= maxDim / height; height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality || 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export const Store = {
  cache: { reps: [], shops: [], designs: [], visits: [], whatsappSends: [], orders: [] },

  async refresh(){
    const snaps = await Promise.all(COLLECTIONS.map(name => getDocs(collection(db, name))));
    COLLECTIONS.forEach((name, i) => {
      this.cache[name] = snaps[i].docs.map(d => ({ id: d.id, ...d.data() }));
    });
    return this.cache;
  },

  async addRep(name, phone){
    const data = { name, phone: phone || '', createdAt: todayISO() };
    const ref = await addDoc(collection(db, 'reps'), data);
    const rep = { id: ref.id, ...data };
    this.cache.reps.push(rep);
    return rep;
  },
  async addShop(name, contactName, phone, area){
    const data = { name, contactName: contactName || '', phone: phone || '', area: area || '', createdAt: todayISO() };
    const ref = await addDoc(collection(db, 'shops'), data);
    const shop = { id: ref.id, ...data };
    this.cache.shops.push(shop);
    return shop;
  },
  async addDesign(name, code, category, imageDataUrl){
    const data = { name, code: code || '', category: category || '', uploadedAt: todayISO(), imageDataUrl: imageDataUrl || '' };
    const ref = await addDoc(collection(db, 'designs'), data);
    const design = { id: ref.id, ...data };
    this.cache.designs.push(design);
    return design;
  },
  async addVisit(shopId, repId, date, notes){
    const data = { shopId, repId, date: date || todayISO(), notes: notes || '' };
    const ref = await addDoc(collection(db, 'visits'), data);
    const visit = { id: ref.id, ...data };
    this.cache.visits.push(visit);
    return visit;
  },
  async addWhatsappSend(shopId, repId, designIds, date){
    const data = { shopId, repId, designIds: designIds || [], date: date || todayISO() };
    const ref = await addDoc(collection(db, 'whatsappSends'), data);
    const send = { id: ref.id, ...data };
    this.cache.whatsappSends.push(send);
    return send;
  },
  async addOrder(shopId, repId, source, date, items){
    const total = (items || []).reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
    const data = { shopId, repId, source, date: date || todayISO(), items: items || [], total, sent: false };
    const ref = await addDoc(collection(db, 'orders'), data);
    const order = { id: ref.id, ...data };
    this.cache.orders.push(order);
    return order;
  },
  async setOrderSent(orderId, sent){
    await updateDoc(doc(db, 'orders', orderId), { sent });
    const order = this.cache.orders.find(o => o.id === orderId);
    if(order) order.sent = sent;
  },

  shopName(id){ const s = this.cache.shops.find(x => x.id === id); return (s && s.name) || 'Unknown shop'; },
  repName(id){ const r = this.cache.reps.find(x => x.id === id); return (r && r.name) || 'Unknown rep'; },
  designName(id){ const d = this.cache.designs.find(x => x.id === id); return (d && d.name) || 'Unknown design'; },
  designCode(id){ const d = this.cache.designs.find(x => x.id === id); return (d && (d.code || d.name)) || 'Unknown design'; },

  async clearAll(){
    for(const name of COLLECTIONS){
      const snap = await getDocs(collection(db, name));
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, name, d.id))));
    }
    this.cache = { reps: [], shops: [], designs: [], visits: [], whatsappSends: [], orders: [] };
  },

  async loadSampleData(){
    if(this.cache.reps.length || this.cache.shops.length) return false;
    const reps = await Promise.all(['Nimal Perera', 'Kasun Silva', 'Ishara Fernando'].map(n => this.addRep(n, '07' + Math.floor(10000000 + Math.random()*89999999))));
    const shops = await Promise.all(['Kandy Fashion House', 'Galle Textile Mart', 'Colombo Trend Store', 'Negombo Garments', 'Matara Style Point', 'Jaffna Cloth Bazaar'].map(n => this.addShop(n, 'Manager', '07' + Math.floor(10000000 + Math.random()*89999999), n.split(' ')[0])));
    const designs = await Promise.all(['Summer Floral Kurta', 'Denim Wrap Dress', 'Classic Linen Shirt', 'Batik Print Saree', 'Kids Party Frock'].map(n => this.addDesign(n, 'D-' + Math.floor(1000+Math.random()*9000), 'Apparel')));

    for(let i=0;i<20;i++){
      const rep = reps[i % reps.length];
      const shop = shops[i % shops.length];
      const date = isoDaysAgo(Math.floor(Math.random()*10));
      await this.addVisit(shop.id, rep.id, date, '');
      if(Math.random() > 0.4){
        const items = [designs[Math.floor(Math.random()*designs.length)]].map(d => ({ designId: d.id, qty: 5 + Math.floor(Math.random()*20), price: 800 + Math.floor(Math.random()*1200) }));
        await this.addOrder(shop.id, rep.id, 'visit', date, items);
      }
    }
    for(let i=0;i<15;i++){
      const rep = reps[i % reps.length];
      const shop = shops[(i+1) % shops.length];
      const date = isoDaysAgo(Math.floor(Math.random()*10));
      await this.addWhatsappSend(shop.id, rep.id, [designs[Math.floor(Math.random()*designs.length)].id], date);
      if(Math.random() > 0.5){
        const items = [designs[Math.floor(Math.random()*designs.length)]].map(d => ({ designId: d.id, qty: 5 + Math.floor(Math.random()*15), price: 800 + Math.floor(Math.random()*1200) }));
        await this.addOrder(shop.id, rep.id, 'whatsapp', date, items);
      }
    }
    return true;
  }
};

export const Dashboard = {
  newDesignsThisWeek(){
    const list = Store.cache.designs.filter(d => daysBetween(d.uploadedAt) <= 7);
    return { count: list.length, list };
  },
  shopsVisitedYesterday(){
    const y = isoDaysAgo(1);
    const ids = [...new Set(Store.cache.visits.filter(v => v.date === y).map(v => v.shopId))];
    return { count: ids.length, list: ids.map(id => Store.shopName(id)) };
  },
  whatsappSentYesterday(){
    const y = isoDaysAgo(1);
    const sends = Store.cache.whatsappSends.filter(w => w.date === y);
    const shopCount = new Set(sends.map(s => s.shopId)).size;
    return { count: sends.length, shopCount };
  },
  ordersFromSourceYesterday(source){
    const y = isoDaysAgo(1);
    const orders = Store.cache.orders.filter(o => o.date === y && o.source === source);
    const total = orders.reduce((s,o) => s + o.total, 0);
    return { count: orders.length, total };
  },
  topReps(periodDays){
    const cutoff = periodDays || 7;
    const byRep = {};
    Store.cache.orders.filter(o => daysBetween(o.date) <= cutoff).forEach(o => {
      byRep[o.repId] = byRep[o.repId] || { repId: o.repId, total: 0, orders: 0 };
      byRep[o.repId].total += o.total;
      byRep[o.repId].orders += 1;
    });
    return Object.values(byRep).sort((a,b) => b.total - a.total).slice(0,5).map(r => ({ ...r, name: Store.repName(r.repId) }));
  },
  topDesigns(periodDays){
    const cutoff = periodDays || 7;
    const byDesign = {};
    Store.cache.orders.filter(o => daysBetween(o.date) <= cutoff).forEach(o => {
      o.items.forEach(it => {
        byDesign[it.designId] = byDesign[it.designId] || { designId: it.designId, units: 0 };
        byDesign[it.designId].units += Number(it.qty) || 0;
      });
    });
    return Object.values(byDesign).sort((a,b) => b.units - a.units).slice(0,5).map(d => ({ ...d, name: Store.designCode(d.designId) }));
  },
  shopLastActivity(shopId){
    const dates = [
      ...Store.cache.visits.filter(v => v.shopId === shopId).map(v => v.date),
      ...Store.cache.orders.filter(o => o.shopId === shopId).map(o => o.date),
      ...Store.cache.whatsappSends.filter(w => w.shopId === shopId).map(w => w.date)
    ];
    const shop = Store.cache.shops.find(s => s.id === shopId);
    if(!dates.length) return shop ? shop.createdAt : todayISO();
    return dates.sort().reverse()[0];
  },
  shopsNeedingFollowUp(){
    return Store.cache.shops.map(s => {
      const last = this.shopLastActivity(s.id);
      return { shop: s, lastActivity: last, daysSince: daysBetween(last) };
    }).filter(x => x.daysSince >= FOLLOWUP_THRESHOLD_DAYS).sort((a,b) => b.daysSince - a.daysSince);
  },
  shopLastOrderDate(shopId){
    const orders = Store.cache.orders.filter(o => o.shopId === shopId).map(o => o.date);
    return orders.length ? orders.sort().reverse()[0] : null;
  },
  customersStale(){
    return Store.cache.shops.map(s => {
      const last = this.shopLastOrderDate(s.id);
      const daysSince = last ? daysBetween(last) : null;
      return { shop: s, lastOrder: last, daysSince };
    }).filter(x => x.daysSince === null || x.daysSince >= STALE_CUSTOMER_DAYS)
      .sort((a,b) => (b.daysSince ?? 99999) - (a.daysSince ?? 99999));
  },
  shopsWithoutOrders(){
    const shopIdsWithOrders = new Set(Store.cache.orders.map(o => o.shopId));
    return Store.cache.shops.filter(s => !shopIdsWithOrders.has(s.id));
  }
};
