let overlay, imgEl, captionEl;

function ensureLightbox(){
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `
    <button type="button" class="lightbox-close" aria-label="Close">✕</button>
    <img class="lightbox-img" alt="">
    <div class="lightbox-caption"></div>
  `;
  document.body.appendChild(overlay);
  imgEl = overlay.querySelector('.lightbox-img');
  captionEl = overlay.querySelector('.lightbox-caption');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLightbox(); });
  overlay.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
}

function closeLightbox(){
  if (overlay) overlay.classList.remove('open');
}

export function openLightbox(src, caption){
  ensureLightbox();
  imgEl.src = src;
  captionEl.textContent = caption || '';
  overlay.classList.add('open');
}

export function enableImageLightbox(container, selector){
  ensureLightbox();
  container.addEventListener('click', (e) => {
    const img = e.target.closest(selector);
    if (img && img.tagName === 'IMG' && img.src) openLightbox(img.src, img.alt);
  });
}
