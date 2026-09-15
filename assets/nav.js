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
  if (Store.canManageUsers()) {
    links.push(['users.html', 'Users']);
  }

  const roleLabel = Store.currentUserProfile?.role ? Store.currentUserProfile.role.toUpperCase() : 'GUEST';
  const emailLabel = Store.currentUser?.email || 'Sign in';

  const nav = document.createElement('div');
  nav.className = 'topbar';
  nav.innerHTML = `
    <div class="brand"><img src="assets/logo.png" alt="" onerror="this.remove()">Hedakari Clothing<small>${Store.currentUser ? `${roleLabel} · ${emailLabel}` : 'Wholesale CRM'}</small></div>
    <button class="nav-toggle" id="navToggle" aria-label="Toggle menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-tools-wrap" id="navToolsWrap">
      <nav>${links.map(([href,label]) => `<a href="${href}" class="${activePage===href?'active':''}">${label}</a>`).join('')}</nav>
      <div class="tools">
        <button id="navAuthBtn" class="nav-auth-btn">${Store.currentUser ? 'Logout' : 'Login'}</button>
      </div>
    </div>
  `;
  document.body.prepend(nav);

  const toggleBtn = document.getElementById('navToggle');
  const toolsWrap = document.getElementById('navToolsWrap');
  const navAuthBtn = document.getElementById('navAuthBtn');
  if (toggleBtn && toolsWrap) {
    toggleBtn.addEventListener('click', () => {
      const open = toolsWrap.classList.toggle('open');
      toggleBtn.classList.toggle('active', open);
      toggleBtn.setAttribute('aria-expanded', String(open));
    });
  }

  if (navAuthBtn) {
    navAuthBtn.addEventListener('click', async () => {
      if (Store.currentUser) {
        try {
          await Store.logout();
          window.location.href = 'login.html';
        } catch (err) {
          alert('Could not sign out: ' + err.message);
        }
        return;
      }
      window.location.href = 'login.html';
    });
  }
}
