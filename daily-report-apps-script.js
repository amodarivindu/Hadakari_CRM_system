/**
 * Hedakari Clothing CRM — Daily email report.
 *
 * SETUP (one-time):
 * 1. Go to https://script.google.com, click "New project".
 * 2. Delete the placeholder code and paste this entire file in.
 * 3. Replace ADMIN_EMAIL below with the real recipient address.
 * 4. Run "authorizeAndTest" once from the toolbar (Google will ask you to
 *    authorize access to your Google account and to send email as you —
 *    this account MUST have at least Viewer access on the hadakari-crm-system
 *    Firebase/Google Cloud project, since that's how it's allowed to read Firestore).
 * 5. Check ADMIN_EMAIL's inbox for a test report to confirm it works.
 * 6. In the left sidebar click the clock icon ("Triggers") -> "Add Trigger":
 *      Function: sendDailyReport
 *      Event source: Time-driven
 *      Type: Day timer, choose a time (e.g. 7am-8am)
 *    Save. The report will now arrive automatically every day at that time.
 */

const PROJECT_ID = 'hadakari-crm-system';
const ADMIN_EMAIL = 'REPLACE_WITH_ADMIN_EMAIL@example.com';

function authorizeAndTest() {
  sendDailyReport();
}

function sendDailyReport() {
  const reps = fetchCollection('reps');
  const shops = fetchCollection('shops');
  const designs = fetchCollection('designs');
  const orders = fetchCollection('orders');

  const tz = Session.getScriptTimeZone();
  const yesterday = Utilities.formatDate(new Date(Date.now() - 86400000), tz, 'yyyy-MM-dd');
  const weekAgo = Utilities.formatDate(new Date(Date.now() - 7 * 86400000), tz, 'yyyy-MM-dd');

  const shopName = id => (shops.find(s => s.id === id) || {}).name || 'Unknown shop';
  const repName = id => (reps.find(r => r.id === id) || {}).name || 'Unknown rep';
  const designCode = id => { const d = designs.find(x => x.id === id); return d ? (d.code || d.name) : 'Unknown design'; };

  const ordersYesterday = orders.filter(o => o.date === yesterday);
  const visitOrdersYesterday = ordersYesterday.filter(o => o.source === 'visit');
  const waOrdersYesterday = ordersYesterday.filter(o => o.source === 'whatsapp');
  const totalYesterday = ordersYesterday.reduce((s, o) => s + (Number(o.total) || 0), 0);

  const newShopsThisWeek = shops.filter(s => s.createdAt >= weekAgo);
  const newDesignsThisWeek = designs.filter(d => d.uploadedAt >= weekAgo);

  const pendingCount = orders.filter(o => (o.status || 'pending') === 'pending').length;
  const processingCount = orders.filter(o => o.status === 'processing').length;

  const row = (a, b, c, d) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${a}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${b}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${c}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${d}</td></tr>`;

  const ordersRows = ordersYesterday.length
    ? ordersYesterday.map(o => row(
        shopName(o.shopId),
        repName(o.repId),
        o.source === 'visit' ? 'Visit' : 'WhatsApp',
        'Rs ' + Math.round(Number(o.total) || 0).toLocaleString('en-US')
      )).join('')
    : '<tr><td colspan="4" style="padding:10px;color:#777;">No orders logged yesterday.</td></tr>';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="margin-bottom:4px;">Hedakari Clothing — Daily Report</h2>
      <p style="color:#666;margin-top:0;">${yesterday}</p>

      <h3>Summary</h3>
      <ul>
        <li>Orders logged yesterday: <b>${ordersYesterday.length}</b> (${visitOrdersYesterday.length} visit, ${waOrdersYesterday.length} WhatsApp) — total value <b>Rs ${Math.round(totalYesterday).toLocaleString('en-US')}</b></li>
        <li>Orders currently Pending: <b>${pendingCount}</b> · Processing: <b>${processingCount}</b></li>
        <li>New shops this week: <b>${newShopsThisWeek.length}</b></li>
        <li>New designs this week: <b>${newDesignsThisWeek.length}</b></li>
        <li>Totals on record: ${shops.length} shops, ${reps.length} reps, ${designs.length} designs, ${orders.length} orders</li>
      </ul>

      <h3>Orders logged yesterday</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <tr style="background:#f4f4f4;"><th style="text-align:left;padding:6px 10px;">Shop</th><th style="text-align:left;padding:6px 10px;">Rep</th><th style="text-align:left;padding:6px 10px;">Source</th><th style="text-align:left;padding:6px 10px;">Total</th></tr>
        ${ordersRows}
      </table>

      <p style="color:#999;font-size:12px;margin-top:24px;">
        Automated daily report. Full data (including design images) is protected separately via Firestore's daily backup schedule —
        this email is a readable summary, not the full database.
      </p>
    </div>
  `;

  MailApp.sendEmail({
    to: ADMIN_EMAIL,
    subject: `Hedakari Clothing — Daily Report (${yesterday})`,
    htmlBody: html
  });
}

function fetchCollection(name) {
  const token = ScriptApp.getOAuthToken();
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${name}`;
  let docs = [];
  let pageToken = '';
  do {
    const url = base + (pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '');
    const resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    const json = JSON.parse(resp.getContentText());
    (json.documents || []).forEach(doc => docs.push(parseFirestoreDoc(doc)));
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return docs;
}

function parseFirestoreDoc(doc) {
  const fields = doc.fields || {};
  const obj = { id: doc.name.split('/').pop() };
  Object.keys(fields).forEach(key => { obj[key] = parseFirestoreValue(fields[key]); });
  return obj;
}

function parseFirestoreValue(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.mapValue) {
    const out = {};
    Object.keys(v.mapValue.fields || {}).forEach(k => { out[k] = parseFirestoreValue(v.mapValue.fields[k]); });
    return out;
  }
  if (v.arrayValue) return (v.arrayValue.values || []).map(parseFirestoreValue);
  return null;
}
