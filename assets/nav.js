import { Store } from './store.js';

export function renderNav(activePage){
  const links = [
    ['index.html', 'Dashboard'],
    ['shops.html', 'Shops'],
    ['reps.html', 'Reps'],
    ['designs.html', 'Designs'],
    ['orders-visit.html', 'Visit Orders'],
    ['orders-whatsapp.html', 'WhatsApp Orders'],
    ['orders-all.html', 'All Orders']
  ];
  const nav = document.createElement('div');
  nav.className = 'topbar';
  nav.innerHTML = `
    <div class="brand"><img src="assets/logo.png" alt="" onerror="this.remove()">Hedakari Clothing<small>Wholesale CRM</small></div>
    <button class="nav-toggle" id="navToggle" aria-label="Toggle menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-tools-wrap" id="navToolsWrap">
      <nav>${links.map(([href,label]) => `<a href="${href}" class="${activePage===href?'active':''}">${label}</a>`).join('')}</nav>
      <div class="tools">
        <button id="navSeedBtn">Load sample data</button>
        <button id="navResetBtn">Reset all data</button>
      </div>
    </div>
  `;
  document.body.prepend(nav);

  const toggleBtn = document.getElementById('navToggle');
  const toolsWrap = document.getElementById('navToolsWrap');
  toggleBtn.addEventListener('click', () => {
    const open = toolsWrap.classList.toggle('open');
    toggleBtn.classList.toggle('active', open);
    toggleBtn.setAttribute('aria-expanded', String(open));
  });

  const seedBtn = document.getElementById('navSeedBtn');
  const resetBtn = document.getElementById('navResetBtn');

  seedBtn.addEventListener('click', async () => {
    seedBtn.disabled = true; seedBtn.textContent = 'Loading…';
    try{
      const added = await Store.loadSampleData();
      alert(added ? 'Sample data loaded.' : 'Sample data only loads into an empty system — you already have reps/shops entered.');
      location.reload();
    }catch(err){
      alert('Could not load sample data: ' + err.message);
      seedBtn.disabled = false; seedBtn.textContent = 'Load sample data';
    }
  });

  resetBtn.addEventListener('click', async () => {
    if(!confirm('This deletes ALL data (shops, reps, designs, visits, orders, WhatsApp sends). Continue?')) return;
    resetBtn.disabled = true; resetBtn.textContent = 'Deleting…';
    try{
      await Store.clearAll();
      location.reload();
    }catch(err){
      alert('Could not reset data: ' + err.message);
      resetBtn.disabled = false; resetBtn.textContent = 'Reset all data';
    }
  });
}
