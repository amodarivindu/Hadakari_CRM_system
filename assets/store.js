import { db, auth, firebaseConfig, onAuthStateChanged, signInWithEmailAndPassword, signOut } from './firebase.js';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

export const FOLLOWUP_THRESHOLD_DAYS = 14;
export const STALE_CUSTOMER_DAYS = 30;
const COLLECTIONS = ['reps', 'shops', 'designs', 'visits', 'whatsappSends', 'orders'];
const ROLE_HIERARCHY = { viewer: 0, worker: 1, manager: 1, admin: 2 };
export const ORDER_STATUSES = ['pending', 'processing', 'completed'];

function normalizeText(value){
  return String(value ?? '').trim();
}

function validatePhone(value){
  return !value || /^[0-9+()\-\s]{7,20}$/.test(String(value).trim());
}

function cleanData(data){
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== null));
}

export function showConnectionError(err){
  const banner = document.createElement('div');
  banner.className = 'card error-banner';
  banner.innerHTML = `
    <strong>Could not load data from the database.</strong>
    <p>This usually means <code>assets/firebase.js</code> still has a placeholder API key, or Firestore hasn't been enabled/rules haven't been set for this project yet.</p>
    <p style="color:var(--text-muted);font-size:12px;">${err && err.message ? err.message : err}</p>
  `;
  if(document.querySelector('main')) document.querySelector('main').prepend(banner);
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

const STATUS_LABELS = { pending: 'Pending', processing: 'Processing', completed: 'Completed' };

export function orderTimestamp(order){
  if (typeof order.createdAt === 'number') return order.createdAt;
  if (order.date) {
    const t = new Date(order.date + 'T00:00:00').getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

export function orderStatusOf(order){
  if (order.status && ORDER_STATUSES.includes(order.status)) return order.status;
  return order.sent ? 'completed' : 'pending';
}

export function statusControlHtml(order, canChange){
  const status = orderStatusOf(order);
  if (!canChange) {
    return `<span class="status-badge ${status}">${STATUS_LABELS[status]}</span>`;
  }
  return `<select class="status-select ${status}" data-id="${order.id}">${ORDER_STATUSES.map(s => `<option value="${s}" ${s===status?'selected':''}>${STATUS_LABELS[s]}</option>`).join('')}</select>`;
}

export function deliveryPartHtml(order){
  if (order.deliveryPart === 'now') return `<span class="delivery-chip now">Delivering now</span>`;
  if (order.deliveryPart === 'remaining') return `<span class="delivery-chip remaining">To be made</span>`;
  return '<span class="empty" style="padding:0;">Full order</span>';
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

export function downloadCsv(filename, rows){
  const csv = rows.length ? [Object.keys(rows[0]), ...rows.map(r => Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n') : '';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const Store = {
  cache: { reps: [], shops: [], designs: [], visits: [], whatsappSends: [], orders: [] },
  currentUser: null,
  currentUserProfile: { role: 'viewer', email: '' },
  authReady: false,

  async initAuth(){
    if (this.authReady) return this.currentUser;
    this.authReady = true;
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        this.currentUser = user;
        this.currentUserProfile = { role: 'viewer', email: user?.email || '' };

        if (user) {
          try {
            const profileRef = doc(db, 'users', user.uid);
            const snap = await getDoc(profileRef);
            if (!snap.exists()) {
              const defaultRole = 'viewer';
              await setDoc(profileRef, { uid: user.uid, email: user.email, role: defaultRole, createdAt: todayISO() });
              this.currentUserProfile = { role: defaultRole, email: user.email };
            } else {
              this.currentUserProfile = { ...snap.data(), email: snap.data().email || user.email };
            }
          } catch (err) {
            console.error('Profile load failed:', err);
          }
        }
        resolve(user);
      });
    });
  },

  async login(email, password){
    const cleanEmail = normalizeText(email).toLowerCase();
    if (!cleanEmail || !password) throw new Error('Email and password are required.');
    const userCred = await signInWithEmailAndPassword(auth, cleanEmail, password);
    return userCred.user;
  },

  async logout(){
    await signOut(auth);
    this.currentUser = null;
    this.currentUserProfile = { role: 'viewer', email: '' };
  },

  async listUsers(){
    this.requirePermission('admin');
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async createUser(email, password, role){
    this.requirePermission('admin');
    const cleanEmail = normalizeText(email).toLowerCase();
    if (!cleanEmail || !password || password.length < 6) throw new Error('Use a valid email and a password of at least 6 characters.');
    if (!ROLE_HIERARCHY.hasOwnProperty(role)) throw new Error('Choose a valid role.');

    const { initializeApp, deleteApp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const { getAuth, createUserWithEmailAndPassword: createSecondaryUser, signOut: signOutSecondary } =
      await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');

    const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);
    try {
      const userCred = await createSecondaryUser(secondaryAuth, cleanEmail, password);
      const data = { uid: userCred.user.uid, email: cleanEmail, role, createdAt: todayISO() };
      await setDoc(doc(db, 'users', userCred.user.uid), data);
      await signOutSecondary(secondaryAuth);
      return data;
    } finally {
      await deleteApp(secondaryApp);
    }
  },

  async updateUserRole(uid, role){
    this.requirePermission('admin');
    if (!ROLE_HIERARCHY.hasOwnProperty(role)) throw new Error('Choose a valid role.');
    if (this.currentUser && uid === this.currentUser.uid) throw new Error('You cannot change your own role.');
    await updateDoc(doc(db, 'users', uid), { role });
  },

  currentUserRole(){
    return this.currentUserProfile?.role || 'viewer';
  },

  canManageRecords(){
    return ROLE_HIERARCHY[this.currentUserRole()] >= ROLE_HIERARCHY.manager;
  },

  canDeleteRecords(){
    return ['manager', 'admin'].includes(this.currentUserRole());
  },

  canManageUsers(){
    return this.currentUserRole() === 'admin';
  },

  canChangeOrderStatus(){
    return this.canManageRecords() && this.currentUserRole() !== 'worker';
  },

  requirePermission(minRole = 'viewer'){
    const role = this.currentUserRole();
    if (!this.currentUser) {
      throw new Error('Please sign in to continue.');
    }
    if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY[minRole]) {
      throw new Error('You do not have permission to do that.');
    }
  },

  requireDeletePermission(){
    if (!this.currentUser) throw new Error('Please sign in to continue.');
    if (!this.canDeleteRecords()) throw new Error('You do not have permission to do that.');
  },

  async refresh(){
    const snaps = await Promise.all(COLLECTIONS.map(name => getDocs(collection(db, name))));
    COLLECTIONS.forEach((name, i) => {
      this.cache[name] = snaps[i].docs.map(d => ({ id: d.id, ...d.data() }));
    });
    return this.cache;
  },

  async addRep(name, phone){
    this.requirePermission('manager');
    const cleanName = normalizeText(name);
    if (!cleanName) throw new Error('Rep name is required.');
    if (!validatePhone(phone)) throw new Error('Phone number is not valid.');
    const data = { name: cleanName, phone: normalizeText(phone), createdAt: todayISO() };
    const ref = await addDoc(collection(db, 'reps'), data);
    const rep = { id: ref.id, ...data };
    this.cache.reps.push(rep);
    return rep;
  },

  async updateRep(id, patch){
    this.requirePermission('manager');
    const data = cleanData({
      name: normalizeText(patch.name),
      phone: normalizeText(patch.phone)
    });
    if (!data.name) throw new Error('Rep name is required.');
    if (data.phone && !validatePhone(data.phone)) throw new Error('Phone number is not valid.');
    await updateDoc(doc(db, 'reps', id), data);
    const rep = this.cache.reps.find(item => item.id === id);
    if (rep) Object.assign(rep, data);
    return rep;
  },

  async deleteRep(id){
    this.requireDeletePermission();
    await deleteDoc(doc(db, 'reps', id));
    this.cache.reps = this.cache.reps.filter(item => item.id !== id);
  },

  async addShop(name, contactName, phone, area){
    this.requirePermission('manager');
    const cleanName = normalizeText(name);
    if (!cleanName) throw new Error('Shop name is required.');
    if (phone && !validatePhone(phone)) throw new Error('Phone number is not valid.');
    const data = { name: cleanName, contactName: normalizeText(contactName), phone: normalizeText(phone), area: normalizeText(area), createdAt: todayISO() };
    const ref = await addDoc(collection(db, 'shops'), data);
    const shop = { id: ref.id, ...data };
    this.cache.shops.push(shop);
    return shop;
  },

  async updateShop(id, patch){
    this.requirePermission('manager');
    const data = cleanData({
      name: normalizeText(patch.name),
      contactName: normalizeText(patch.contactName),
      phone: normalizeText(patch.phone),
      area: normalizeText(patch.area)
    });
    if (!data.name) throw new Error('Shop name is required.');
    if (data.phone && !validatePhone(data.phone)) throw new Error('Phone number is not valid.');
    await updateDoc(doc(db, 'shops', id), data);
    const shop = this.cache.shops.find(item => item.id === id);
    if (shop) Object.assign(shop, data);
    return shop;
  },

  async deleteShop(id){
    this.requireDeletePermission();
    await deleteDoc(doc(db, 'shops', id));
    this.cache.shops = this.cache.shops.filter(item => item.id !== id);
  },

  async addDesign(name, code, category, imageDataUrl){
    this.requirePermission('manager');
    const cleanName = normalizeText(name);
    if (!cleanName) throw new Error('Design name is required.');
    const data = { name: cleanName, code: normalizeText(code), category: normalizeText(category), uploadedAt: todayISO(), imageDataUrl: imageDataUrl || '' };
    const ref = await addDoc(collection(db, 'designs'), data);
    const design = { id: ref.id, ...data };
    this.cache.designs.push(design);
    return design;
  },

  async updateDesign(id, patch){
    this.requirePermission('manager');
    const data = cleanData({
      name: normalizeText(patch.name),
      code: normalizeText(patch.code),
      category: normalizeText(patch.category),
      imageDataUrl: patch.imageDataUrl || ''
    });
    if (!data.name) throw new Error('Design name is required.');
    await updateDoc(doc(db, 'designs', id), data);
    const design = this.cache.designs.find(item => item.id === id);
    if (design) Object.assign(design, data);
    return design;
  },

  async deleteDesign(id){
    this.requireDeletePermission();
    await deleteDoc(doc(db, 'designs', id));
    this.cache.designs = this.cache.designs.filter(item => item.id !== id);
  },

  async addVisit(shopId, repId, date, notes){
    this.requirePermission('manager');
    if (!shopId || !repId) throw new Error('Choose both a shop and a rep.');
    const data = { shopId, repId, date: date || todayISO(), notes: normalizeText(notes) };
    const ref = await addDoc(collection(db, 'visits'), data);
    const visit = { id: ref.id, ...data };
    this.cache.visits.push(visit);
    return visit;
  },

  async deleteVisit(id){
    this.requireDeletePermission();
    await deleteDoc(doc(db, 'visits', id));
    this.cache.visits = this.cache.visits.filter(item => item.id !== id);
  },

  async addWhatsappSend(shopId, repId, designIds, date){
    this.requirePermission('manager');
    const data = { shopId, repId, designIds: designIds || [], date: date || todayISO() };
    const ref = await addDoc(collection(db, 'whatsappSends'), data);
    const send = { id: ref.id, ...data };
    this.cache.whatsappSends.push(send);
    return send;
  },

  async addOrder(shopId, repId, source, date, items){
    this.requirePermission('manager');
    const cleanItems = (items || []).filter(it => it && it.designId && Number(it.qty) > 0);
    if (!shopId || !repId || !source || !cleanItems.length) throw new Error('Order data is incomplete.');
    const total = cleanItems.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
    const data = { shopId, repId, source, date: date || todayISO(), items: cleanItems, total, status: 'pending', createdAt: Date.now() };
    const ref = await addDoc(collection(db, 'orders'), data);
    const order = { id: ref.id, ...data };
    this.cache.orders.push(order);
    return order;
  },

  async addSplitOrder(shopId, repId, source, date, nowItems, remainingItems){
    this.requirePermission('manager');
    const cleanNow = (nowItems || []).filter(it => it && it.designId && Number(it.qty) > 0);
    const cleanRemaining = (remainingItems || []).filter(it => it && it.designId && Number(it.qty) > 0);
    if (!shopId || !repId || !source) throw new Error('Order data is incomplete.');
    if (!cleanNow.length && !cleanRemaining.length) throw new Error('Add at least one item.');

    const baseDate = date || todayISO();
    let nowOrder = null;
    let remainingOrder = null;

    if (cleanNow.length) {
      const total = cleanNow.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
      const data = { shopId, repId, source, date: baseDate, items: cleanNow, total, status: 'pending', deliveryPart: 'now', createdAt: Date.now() };
      const ref = await addDoc(collection(db, 'orders'), data);
      nowOrder = { id: ref.id, ...data };
      this.cache.orders.push(nowOrder);
    }
    if (cleanRemaining.length) {
      const total = cleanRemaining.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
      const data = { shopId, repId, source, date: baseDate, items: cleanRemaining, total, status: 'pending', deliveryPart: 'remaining', createdAt: Date.now() };
      const ref = await addDoc(collection(db, 'orders'), data);
      remainingOrder = { id: ref.id, ...data };
      this.cache.orders.push(remainingOrder);
    }
    if (nowOrder && remainingOrder) {
      await updateDoc(doc(db, 'orders', nowOrder.id), { partnerOrderId: remainingOrder.id });
      await updateDoc(doc(db, 'orders', remainingOrder.id), { partnerOrderId: nowOrder.id });
      nowOrder.partnerOrderId = remainingOrder.id;
      remainingOrder.partnerOrderId = nowOrder.id;
    }
    return { nowOrder, remainingOrder };
  },

  async updateOrder(id, patch){
    this.requirePermission('manager');
    if (this.currentUserRole() === 'worker') throw new Error('Workers cannot change order records.');
    const data = cleanData({
      status: ORDER_STATUSES.includes(patch.status) ? patch.status : undefined,
      source: normalizeText(patch.source),
      date: normalizeText(patch.date),
      total: Number(patch.total) || 0,
      items: Array.isArray(patch.items) ? patch.items : []
    });
    await updateDoc(doc(db, 'orders', id), data);
    const order = this.cache.orders.find(item => item.id === id);
    if (order) Object.assign(order, data);
    return order;
  },

  async deleteOrder(id){
    this.requireDeletePermission();
    await deleteDoc(doc(db, 'orders', id));
    this.cache.orders = this.cache.orders.filter(item => item.id !== id);
  },

  async setOrderStatus(orderId, status){
    this.requirePermission('manager');
    if (this.currentUserRole() === 'worker') throw new Error('Workers cannot change order status.');
    if (!ORDER_STATUSES.includes(status)) throw new Error('Choose a valid status.');
    await updateDoc(doc(db, 'orders', orderId), { status });
    const order = this.cache.orders.find(o => o.id === orderId);
    if(order) order.status = status;
  },

  shopName(id){ const s = this.cache.shops.find(x => x.id === id); return (s && s.name) || 'Unknown shop'; },
  repName(id){ const r = this.cache.reps.find(x => x.id === id); return (r && r.name) || 'Unknown rep'; },
  designName(id){ const d = this.cache.designs.find(x => x.id === id); return (d && d.name) || 'Unknown design'; },
  designCode(id){ const d = this.cache.designs.find(x => x.id === id); return (d && (d.code || d.name)) || 'Unknown design'; },

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
