/* =========================================================================
   PITEX — production-lines.js
   Owns the homepage "Production Lines" preview grid and the full
   production-lines.html catalog (filter bar, load-more, hero + stats
   entrances). Card markup itself lives in products-data.js and is never
   duplicated here — this file only renders it into the right container
   and choreographs it, using the same GSAP/easing language as main.js.
   Safe to include on any page: every entry point checks its container
   exists before doing anything.
   ========================================================================= */

(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGSAP = typeof gsap !== 'undefined';
  const EASE = { out3: 'power3.out', out4: 'power4.out', expo: 'expo.out' };
  const PAGE_SIZE = 8;

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.PitexProducts) return;
    initHomePreview();
    initCatalogPage();
  });

  function cardsMarkup(products) {
    return products.map((p) => window.PitexProducts.renderProductCard(p)).join('');
  }

  /* =======================================================================
     HOMEPAGE PREVIEW — first N cards (default 8), same card component,
     entrance choreography modeled on initMachineryCards/initApplicationCards
     in main.js: header fade-up, cards blur/scale/stagger in on scroll.
     ======================================================================= */
  function initHomePreview() {
    const grid = document.getElementById('homeProductsGrid');
    if (!grid) return;

    const count = parseInt(grid.getAttribute('data-preview-count'), 10) || PAGE_SIZE;
    grid.innerHTML = cardsMarkup(window.PitexProducts.data.slice(0, count));
    wireCardInteractions(grid);
    animateSectionEntrance(grid.closest('.production-preview-section'), grid);
  }

  function animateSectionEntrance(section, grid) {
    if (!section || prefersReducedMotion || !hasGSAP) return;

    const header = section.querySelector('.section-header');
    const cta = section.querySelector('.production-preview-cta');
    const cards = Array.from(grid.querySelectorAll('.product-card'));

    if (header) gsap.set(header, { opacity: 0, y: 30 });
    gsap.set(cards, { opacity: 0, y: 46, scale: 0.94, filter: 'blur(8px)' });
    if (cta) gsap.set(cta, { opacity: 0, y: 20 });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: section, start: 'top 72%', once: true },
      defaults: { ease: EASE.out3 },
    });

    if (header) tl.to(header, { opacity: 1, y: 0, duration: 1 }, 0);
    tl.to(
      cards,
      { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 1, ease: EASE.expo, stagger: 0.08 },
      header ? '-=0.4' : 0
    );
    if (cta) tl.to(cta, { opacity: 1, y: 0, duration: 0.8 }, '-=0.3');
  }

  /* =======================================================================
     CATALOG PAGE — filter bar, incremental "Load More", hero + stats.
     ======================================================================= */
  function initCatalogPage() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    const all = window.PitexProducts.data;
    const filterBar = document.getElementById('filterBar');
    const loadMoreBtn = document.querySelector('[data-load-more]');
    const loadMoreWrap = document.querySelector('[data-load-more-wrap]');
    const countLabel = document.querySelector('[data-load-more-count]');

    let activeFilter = 'all';
    let visibleCount = PAGE_SIZE;

    function filteredList() {
      return activeFilter === 'all' ? all : all.filter((p) => p.category === activeFilter);
    }

    function render() {
      const list = filteredList();
      const slice = list.slice(0, visibleCount);

      grid.innerHTML = cardsMarkup(slice);
      wireCardInteractions(grid);

      const newCards = Array.from(grid.querySelectorAll('.product-card'));
      if (hasGSAP && !prefersReducedMotion) {
        gsap.set(newCards, { opacity: 0, y: 36, scale: 0.94, filter: 'blur(6px)' });
        gsap.to(newCards, {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          duration: 0.9,
          ease: EASE.expo,
          stagger: 0.06,
        });
      }

      if (loadMoreWrap) loadMoreWrap.style.display = visibleCount >= list.length ? 'none' : '';
      if (countLabel) {
        countLabel.textContent = `Showing ${slice.length} of ${list.length} production lines`;
      }
      if (hasGSAP && window.ScrollTrigger) ScrollTrigger.refresh();
    }

    if (filterBar) {
      filterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-filter]');
        if (!btn) return;

        filterBar.querySelectorAll('.filter-btn').forEach((b) => {
          b.classList.remove('is-active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-selected', 'true');

        activeFilter = btn.getAttribute('data-filter');
        visibleCount = PAGE_SIZE;
        render();
      });
    }

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        visibleCount += PAGE_SIZE;
        render();
      });
    }

    render();
    initHeroEntrance();
    initFilterBarEntrance();
    initScrollIndicator();
  }

  /* =======================================================================
     PER-CARD INTERACTIONS — favorite toggle (all users) + hover lift/zoom
     (GSAP quickTo, same recipe as initMachineryCards). Re-run after every
     render() since filtering/pagination replaces the DOM nodes.
     ======================================================================= */
  function wireCardInteractions(grid) {
    grid.querySelectorAll('[data-favorite]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const active = btn.classList.toggle('is-active');
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    });

    if (prefersReducedMotion || !hasGSAP) return;

    grid.querySelectorAll('.product-card').forEach((card) => {
      const img = card.querySelector('.product-card__media img');
      gsap.set(card, { transformPerspective: 1000, transformOrigin: 'center' });

      const liftTo = gsap.quickTo(card, 'y', { duration: 0.8, ease: EASE.out3 });
      const imgScaleTo = img ? gsap.quickTo(img, 'scale', { duration: 1, ease: EASE.out3 }) : null;

      card.addEventListener('mouseenter', () => {
        liftTo(-10);
        if (imgScaleTo) imgScaleTo(1.1);
      });
      card.addEventListener('mouseleave', () => {
        liftTo(0);
        if (imgScaleTo) imgScaleTo(1);
      });
    });
  }

  /* =======================================================================
     HERO ENTRANCE — badge/breadcrumb/title/desc fade-blur-up, same
     "fadeBlur" language header.js uses for its own load reveal.
     ======================================================================= */
  function initHeroEntrance() {
    const hero = document.querySelector('.page-hero');
    if (!hero) return;

    const particles = document.getElementById('heroParticles');
    const els = hero.querySelectorAll('.gsap-fade-up');

    if (prefersReducedMotion || !hasGSAP) {
      if (particles) particles.style.opacity = '1';
      return;
    }

    gsap.set(els, { opacity: 0, y: 34 });
    if (particles) gsap.set(particles, { opacity: 0 });

    const tl = gsap.timeline({ defaults: { ease: EASE.out3 }, delay: 0.2 });
    if (particles) tl.to(particles, { opacity: 1, duration: 1.2, ease: 'sine.out' }, 0);
    tl.to(els, { opacity: 1, y: 0, duration: 1, stagger: 0.12 }, 0.1);
  }

  function initFilterBarEntrance() {
    const bar = document.getElementById('filterBar');
    if (!bar || prefersReducedMotion || !hasGSAP) return;

    gsap.set(bar, { opacity: 0, y: -16 });
    gsap.to(bar, { opacity: 1, y: 0, duration: 0.9, ease: EASE.out3, delay: 0.55 });
  }

  function initScrollIndicator() {
    const btn = document.querySelector('[data-scroll-indicator]');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const target = document.getElementById('catalog');
      if (target) target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  }
})();
