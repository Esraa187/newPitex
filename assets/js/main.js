/* =========================================================================
   PITEX — main.js
   Premium, physics-driven interaction layer built on GSAP + ScrollTrigger
   + Lenis. Modular initX() functions, each owning one concern, called
   once on DOMContentLoaded.
   ========================================================================= */

(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGSAP = typeof gsap !== 'undefined';
  const EASE = {
    out3: 'power3.out',
    out4: 'power4.out',
    expo: 'expo.out',
    back: 'back.out(1.7)',
    backStrong: 'back.out(2.2)',
    elastic: 'elastic.out(1, 0.5)',
  };

  // Mark document so animations.css can apply pre-animation states.
  // Skipped entirely for reduced-motion users so content is visible immediately.
  if (!prefersReducedMotion) {
    document.documentElement.classList.add('js-anim');
  }

  // Let the browser restore the scroll position on reload as it normally
  // would (default). We don't fight that — we just make sure everything
  // below is measured against the *final* layout before trusting it.
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'auto';
  }

  let lenisInstance = null;

  /**
   * Resolves once the page's real webfont (Manrope) has swapped in, or
   * after a 1.5s safety cap so a slow/failed font load can never block
   * the page from becoming interactive.
   *
   * This matters for two reasons: (1) splitWords()/splitLines() measure
   * offsetTop to group words into visual lines — if that runs against
   * fallback-font metrics, the line groupings are wrong and the split
   * text renders broken once Manrope swaps in; (2) every ScrollTrigger
   * `start`/`end` below the fold is measured from element offsets that
   * shift once the real font's line-height/character widths land, so
   * triggers created too early get the wrong pixel position.
   */
  function fontsReady() {
    if (!('fonts' in document)) return Promise.resolve();
    return Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  }

  /**
   * Resolves once every currently-known <img> has finished loading (or
   * errored), or after a 2.5s safety cap. Most images here reserve their
   * box via `aspect-ratio`/width+height so they shouldn't shift layout,
   * but a decoded image can still change *content* height in edge cases
   * (e.g. a slow/failed aspect-ratio fallback), and ScrollTrigger start/
   * end positions need to be measured against final geometry — same
   * reasoning as fontsReady() above, just for images instead of type.
   * `loading="lazy"` images far below the fold may never resolve before
   * the cap; that's fine, the cap exists precisely so we never hang.
   */
  function imagesReady() {
    const imgs = Array.from(document.images);
    if (!imgs.length) return Promise.resolve();
    const settle = (img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
    return Promise.race([
      Promise.all(imgs.map(settle)),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  }

  /**
   * The single source of truth for "make Lenis + ScrollTrigger agree with
   * reality." Reload-mid-page (and bfcache back/forward restores) can
   * leave Lenis's internal scroll position stale: Lenis caches scroll
   * state the instant it's constructed, but the browser's native scroll
   * restoration isn't guaranteed to have landed the page at its saved
   * position yet at that exact moment. `lenis.resize()` alone can't fix
   * this — it only re-measures content/viewport *dimensions*, never
   * re-anchors the scroll *position* itself. From that point on Lenis
   * feeds ScrollTrigger a position that doesn't match what's on screen,
   * so `ScrollTrigger.refresh()` recalculates correct start/end pixels
   * but checks them against the wrong current scroll — triggers whose
   * start has technically been crossed never fire, leaving sections
   * stuck at their hidden `gsap.set()` state until a real scroll/wheel
   * event forces Lenis to self-correct.
   *
   * The fix: explicitly re-anchor Lenis to `window.scrollY` (the
   * browser's real, authoritative position) with `immediate: true`
   * before ever calling `ScrollTrigger.refresh()`.
   */
  function refreshEverything() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (lenisInstance) {
          if (typeof lenisInstance.resize === 'function') lenisInstance.resize();
          if (typeof lenisInstance.scrollTo === 'function') {
            lenisInstance.scrollTo(window.scrollY, { immediate: true, force: true });
          }
        }
        if (!hasGSAP) return;

        ScrollTrigger.refresh();

        // Belt-and-suspenders on top of refresh(): walk every registered
        // ScrollTrigger and, for any whose start point sits at or above
        // the current scroll position (i.e. it should already have
        // "entered"), force it to its completed/entered state directly.
        // This guarantees a section is never left stuck at its hidden
        // `gsap.set()` state just because the crossing event that would
        // normally fire it was missed during a mid-page reload.
        //
        // NOTE: we intentionally do NOT gate this on `st.progress === 0`
        // the way an earlier version of this function did. `st.progress`
        // is ScrollTrigger's own scroll-position bookkeeping, and
        // `ScrollTrigger.refresh()` recalculates it from the fresh
        // start/end pixels vs. the current scroll offset — on a mid-page
        // reload that recalculation can jump straight to a non-zero (even
        // 1) value *without the tied animation or onEnter callback ever
        // actually having run*, because the "crossing" event that
        // normally drives both simply never occurred this session.
        // Trusting `st.progress === 0` as a "hasn't fired yet" guard is
        // therefore backwards: an already-passed, never-fired trigger
        // reads as progress > 0 and gets silently skipped, leaving its
        // elements stuck invisible forever. Instead we check the
        // *animation's own* playhead (`st.animation.progress()`) — the
        // actual source of truth for whether the reveal happened — and a
        // one-time `__pitexForced` flag for animation-less onEnter-only
        // triggers (e.g. the counters, the timeline "is-active" markers),
        // since those have no playhead to inspect.
        //
        // Sections that sit directly under the fixed header (always in
        // view at load, e.g. About) intentionally do NOT use ScrollTrigger
        // at all — see initAboutMasterTimeline — precisely so they never
        // enter this recalculation in the first place.
        ScrollTrigger.getAll().forEach((st) => {
          if (st.vars && st.vars.scrub) return; // scrub-driven: refresh()/scroll already keeps these correctly in sync
          if (st.start > window.scrollY) return; // genuinely still ahead — let it fire naturally on scroll

          const anim = st.animation;
          if (anim) {
            if (anim.progress() < 1) anim.progress(1);
            return;
          }
          if (!st.__pitexForced && typeof st.vars.onEnter === 'function') {
            st.__pitexForced = true;
            st.vars.onEnter(st);
          }
        });
      });
    });
  }

  /**
   * Runs `fn` in isolation. Sections are independent by design — one
   * section's setup throwing (a bad selector, a timing edge case, a
   * third-party quirk) must never stop every section *after* it in the
   * init list from running.
   *
   * `fallbackSelector`, if given, is force-revealed (opacity/transform/
   * filter reset to a neutral, fully-visible state) whenever `fn` throws.
   * This matters because most section-init functions hide their elements
   * (`gsap.set(el, {opacity: 0, ...})`) *before* wiring up the
   * ScrollTrigger that reveals them — if that later step throws, the
   * elements are left stuck invisible with nothing left to un-hide them.
   * The fallback guarantees a thrown error degrades a section to
   * "visible but not animated" rather than "blank gap where content
   * should be".
   */
  function safeInit(fn, fallbackSelector) {
    try {
      fn();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[PITEX] ${fn.name || 'init'} failed — forcing that section visible without animation:`, err);
      if (!fallbackSelector) return;
      if (hasGSAP) {
        gsap.set(fallbackSelector, {
          opacity: 1,
          x: 0,
          y: 0,
          scale: 1,
          scaleX: 1,
          scaleY: 1,
          rotate: 0,
          rotationX: 0,
          rotationY: 0,
          filter: 'none',
        });
      } else {
        document.querySelectorAll(fallbackSelector).forEach((el) => {
          el.style.opacity = '1';
          el.style.transform = 'none';
          el.style.filter = 'none';
        });
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    lenisInstance = initLenis();
    if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

    // Everything that follows reads element positions or text metrics
    // (word/line splitting, every entrance ScrollTrigger's start/end).
    // Doing that before layout is final is the root cause of the
    // "refresh mid-page = broken/blank section" bug: a `once` ScrollTrigger
    // only fires on a *crossing*, so if its start point was miscalculated
    // against pre-font/pre-image layout, a page that loads already
    // scrolled past it never gets a crossing event and stays stuck at its
    // hidden `gsap.set()` state until something (like a manual scroll)
    // forces a recalculation. We wait for both fonts AND images, then
    // reconcile via refreshEverything() (see above), which also re-syncs
    // Lenis to the real scroll position before ScrollTrigger measures it.
    Promise.all([fontsReady(), imagesReady()]).then(() => {
      // One extra paint-cycle settle before we measure anything and wire
      // up ScrollTriggers — cheap, and guards against any last-instant
      // layout shift right after fonts/images resolve.
      requestAnimationFrame(() => {
        safeInit(() => initParticles('aboutParticles'), '#aboutParticles');
        safeInit(() => initParticles('processParticles', { density: 0.5 }), '#processParticles');
        safeInit(() => initParticles('machineryParticles', { density: 0.85 }), '#machineryParticles');
        safeInit(() => initParticles('applicationsParticles', { density: 0.6 }), '#applicationsParticles');
        safeInit(() => initParticles('caseStudiesParticles', { density: 0.7 }), '#caseStudiesParticles');
        safeInit(() => initParticles('insightsParticles', { density: 0.6 }), '#insightsParticles');
        safeInit(() => initParticles('contactParticles', { density: 0.5 }), '#contactParticles');
        safeInit(() => initParticles('footerParticles', { density: 0.55 }), '#footerParticles');
        safeInit(
          initAboutMasterTimeline,
          '.about-section .about-media__frame, .about-section .about-media__glow, .about-section .cert-card, ' +
          '.about-section .about-content__badge, .about-section .feature-item, .about-section .about-content__cta, ' +
          '.about-section .split-word, .about-section .line-inner, .about-section .about-media'
        );
        safeInit(
          initFeatureCardsCascade,
          '.features-section .section-header, .features-section .feature-card'
        );
        safeInit(initCardTilt);
        safeInit(initImageInteraction);
        safeInit(initMagnetic);
        safeInit(initButtonPremium);
        safeInit(initSectionParallax);
        safeInit(
          initTimeline,
          '.process-section .section-header, .process-section .timeline-line__fill, .process-section .timeline-item, ' +
          '.process-section .timeline-icon, .process-section .timeline-number, .process-section .timeline-title, ' +
          '.process-section .process-cta'
        );
        safeInit(initTimelineInteractions);
        safeInit(
          initMachineryCards,
          '.machinery-section .section-header, .machinery-section .solution-card'
        );
        safeInit(
          initApplicationCards,
          '.applications-section .section-badge, .applications-section .application-card, ' +
          '.applications-section .split-word, .applications-section .line-inner'
        );
        safeInit(
          initCaseStudies,
          '.case-studies-section .section-header, .case-studies-section .case-studies-link, .case-studies-section .case-study-card'
        );
        safeInit(
          initInsightsSection,
          '.insights-section .section-header, .insights-section .insight-card'
        );
        safeInit(
          initContactSection,
          '.contact-section .contact-panel--info, .contact-section .contact-panel--form, ' +
          '.contact-section .form-group-custom, .contact-section .contact-submit-btn'
        );
        safeInit(
          initFooter,
          '.site-footer .footer-logo-link, .site-footer .footer-brand__desc, .site-footer .footer-social__item, ' +
          '.site-footer .footer-heading, .site-footer .footer-links__item, .site-footer .footer-contact-item, ' +
          '.site-footer .footer-badge, .site-footer .footer-cta, .site-footer .footer-bottom'
        );
        safeInit(initCounters, '[data-count-to]');

        refreshEverything();

        // Belt-and-suspenders: on slower devices/large pages, the browser's
        // native scroll restoration can land asynchronously even after the
        // `load` event below has already fired. One extra delayed pass
        // catches that case without adding any visible flash, since it's
        // just re-measuring — already-correct triggers are a fast no-op.
        setTimeout(refreshEverything, 400);
      });
    });
  });

  // Final safety net: guarantees correctness even if something outside
  // our control (a slow web font/image fallback, a browser extension,
  // late lazy-loaded assets) shifted layout after the pass above.
  window.addEventListener('load', refreshEverything);

  // bfcache restores (back/forward navigation) skip DOMContentLoaded and
  // `load` entirely, but GSAP's ticker and ScrollTrigger's cached
  // measurements can be stale from before the user navigated away.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) refreshEverything();
  });

  /* =======================================================================
     LENIS — buttery smooth scroll, wired into GSAP's ticker so
     ScrollTrigger and Lenis share one animation frame loop.
     ======================================================================= */
  function initLenis() {
    if (prefersReducedMotion || typeof Lenis === 'undefined') return null;

    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
    });

    if (hasGSAP) {
      lenis.on('scroll', () => ScrollTrigger.update());
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      requestAnimationFrame(function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
      });
    }

    return lenis;
  }

  /* =======================================================================
     TEXT SPLITTING HELPERS (custom — no paid SplitText plugin required)
     ======================================================================= */

  /**
   * Wraps each word of `el` in a mask span + inner span, so words can
   * animate individually (translateY, rotate, blur → opacity) while a
   * screen reader still gets the original, unsplit sentence via
   * aria-label on the parent.
   */
  function splitWords(el) {
    const text = el.textContent.trim();
    const words = text.split(/\s+/);
    el.innerHTML = words
      .map((w) => `<span class="split-mask"><span class="split-word">${w}</span></span>`)
      .join(' ');
    el.setAttribute('aria-label', text);
    // The words now own their own hidden/visible state; the parent must
    // not remain stuck at the CSS pre-animation opacity: 0.
    el.classList.remove('gsap-fade-up', 'gsap-stagger-item');
    el.style.opacity = '1';
    el.style.transform = 'none';
    return Array.from(el.querySelectorAll('.split-word'));
  }

  /**
   * Splits a paragraph into its rendered visual lines (measured via
   * offsetTop after an initial word-wrap pass), then wraps each line in
   * an overflow-hidden mask so it can reveal upward like a blind opening.
   */
  function splitLines(el) {
    const text = el.textContent.trim();
    const words = text.split(/\s+/);

    // First pass: lay out words to measure line breaks.
    el.innerHTML = words.map((w) => `<span class="line-word">${w}</span>`).join(' ');
    const wordEls = Array.from(el.querySelectorAll('.line-word'));

    const lines = [];
    let currentTop = null;
    let currentLine = [];
    wordEls.forEach((w) => {
      const top = w.offsetTop;
      if (currentTop === null) currentTop = top;
      if (Math.abs(top - currentTop) > 2) {
        lines.push(currentLine);
        currentLine = [];
        currentTop = top;
      }
      currentLine.push(w.textContent);
    });
    if (currentLine.length) lines.push(currentLine);

    // Second pass: rebuild as masked, animatable lines.
    el.innerHTML = lines
      .map((line) => `<span class="line-mask"><span class="line-inner">${line.join(' ')}</span></span>`)
      .join('');
    el.setAttribute('aria-label', text);
    el.classList.remove('gsap-fade-up', 'gsap-stagger-item');
    el.style.opacity = '1';
    el.style.transform = 'none';
    return Array.from(el.querySelectorAll('.line-inner'));
  }

  /* =======================================================================
     AMBIENT PARTICLES — tiny dots drifting slowly behind a section.
     Generalized so any section can host one via `<div class="particle-field"
     id="...">`; `density` scales the base count up/down per section.
     ======================================================================= */
  function initParticles(fieldId, options) {
    const field = document.getElementById(fieldId);
    if (!field) return;

    const density = (options && options.density) || 1;
    const base = window.innerWidth < 768 ? 7 : 14;
    const count = Math.max(4, Math.round(base * density));
    const frag = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'particle';
      p.style.left = `${Math.random() * 100}%`;
      p.style.top = `${Math.random() * 100}%`;
      p.style.opacity = (0.25 + Math.random() * 0.45).toFixed(2);
      p.style.transform = `scale(${(0.6 + Math.random() * 1.5).toFixed(2)})`;
      frag.appendChild(p);
    }
    field.appendChild(frag);

    if (prefersReducedMotion || !hasGSAP) {
      field.style.opacity = '1';
      return;
    }

    field.querySelectorAll('.particle').forEach((p) => {
      gsap.to(p, {
        y: `+=${(Math.random() * 50 - 25).toFixed(0)}`,
        x: `+=${(Math.random() * 36 - 18).toFixed(0)}`,
        duration: 5 + Math.random() * 4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    });
  }

  /* =======================================================================
     ABOUT SECTION — choreographed master timeline
     Order: background → image → floating card → badge → heading →
     paragraph → feature 1 → feature 2 → button
     ======================================================================= */
  let certFloatTween = null;

  function initAboutMasterTimeline() {
    const section = document.querySelector('.about-section');
    if (!section) return;

    const particles = document.getElementById('aboutParticles');
    const frame = section.querySelector('.about-media__frame');
    const glow = section.querySelector('.about-media__glow');
    const cert = section.querySelector('.cert-card');
    const badge = section.querySelector('.about-content__badge');
    const heading = document.getElementById('about-title');
    const paragraph = section.querySelector('.about-content__desc');
    const featureItems = section.querySelectorAll('.feature-item');
    const cta = section.querySelector('.about-content__cta');

    if (prefersReducedMotion || !hasGSAP) {
      if (particles) particles.style.opacity = '1';
      if (glow) glow.style.opacity = '0.55';
      startCertFloat(cert); // still fine at rest, reduced-motion CSS neutralizes it
      return;
    }

    const headingWords = heading ? splitWords(heading) : [];
    const paragraphLines = paragraph ? splitLines(paragraph) : [];

    const mediaFigure = section.querySelector('.about-media');
    if (mediaFigure) {
      mediaFigure.classList.remove('gsap-slide-left');
      gsap.set(mediaFigure, { opacity: 1, x: 0 });
    }

    gsap.set(frame, { opacity: 0, x: -70, scale: 0.94 });
    gsap.set(glow, { opacity: 0 });
    gsap.set(cert, { opacity: 0, y: 50, scale: 0.78, rotate: -8 });
    if (badge) gsap.set(badge, { opacity: 0, y: 22 });
    gsap.set(featureItems[0] || null, { opacity: 0, x: -55 });
    gsap.set(featureItems[1] || null, { opacity: 0, x: 55 });
    if (cta) gsap.set(cta, { opacity: 0, y: 26, scale: 0.9 });

    const tl = gsap.timeline({
      delay: 0.2,
      defaults: { ease: EASE.out3 },
    });

    tl.to(particles, { opacity: 1, duration: 1.4, ease: 'sine.out' }, 0)
      .to(frame, { opacity: 1, x: 0, scale: 1, duration: 1.5, ease: EASE.expo }, 0.2)
      .to(glow, { opacity: 0.55, duration: 1.3 }, '-=1.0')
      .to(cert, { opacity: 1, y: 0, scale: 1, rotate: 0, duration: 1.2, ease: EASE.back }, '-=0.75')
      .add(() => startCertFloat(cert));

    if (badge) tl.to(badge, { opacity: 1, y: 0, duration: 0.85 }, '-=0.55');

    if (headingWords.length) {
      tl.to(
        headingWords,
        { y: 0, rotate: 0, opacity: 1, filter: 'blur(0px)', duration: 1.05, ease: EASE.out4, stagger: 0.045 },
        '-=0.45'
      );
    }

    if (paragraphLines.length) {
      tl.to(
        paragraphLines,
        { y: 0, opacity: 1, duration: 0.95, ease: EASE.out3, stagger: 0.14 },
        '-=0.5'
      );
    }

    if (featureItems[0]) {
      tl.to(featureItems[0], { opacity: 1, x: 0, duration: 0.95 }, '-=0.25');
      const icon0 = featureItems[0].querySelector('.feature-item__icon');
      if (icon0) tl.fromTo(icon0, { rotate: -110, scale: 0.4 }, { rotate: 0, scale: 1, duration: 0.85, ease: EASE.backStrong }, '<');
    }

    if (featureItems[1]) {
      tl.to(featureItems[1], { opacity: 1, x: 0, duration: 0.95 }, '-=0.6');
      const icon1 = featureItems[1].querySelector('.feature-item__icon');
      if (icon1) tl.fromTo(icon1, { rotate: 110, scale: 0.4 }, { rotate: 0, scale: 1, duration: 0.85, ease: EASE.backStrong }, '<');
    }

    if (cta) {
      tl.to(cta, { opacity: 1, y: 0, scale: 1, duration: 1.05, ease: EASE.back }, '-=0.35');
    }
  }

  /**
   * Continuous, gentle up/down float for the certification card.
   * Paused during hover-lift and magnetic tracking, then restarted.
   */
  function startCertFloat(cert) {
    if (!cert || prefersReducedMotion || !hasGSAP) return;
    certFloatTween = gsap.to(cert, {
      y: '+=16',
      duration: 2.6,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /* =======================================================================
     FEATURES SECTION — cascading card entrance + icon bounce
     ======================================================================= */
  function initFeatureCardsCascade() {
    const header = document.querySelector('.features-section .section-header');
    const cards = document.querySelectorAll('.feature-cards .feature-card');
    if (!hasGSAP) return;

    if (prefersReducedMotion) return;

    if (header) {
      gsap.set(header, { opacity: 0, y: 36 });
      gsap.to(header, {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: EASE.out3,
        scrollTrigger: { trigger: header, start: 'top 82%', once: true },
      });
    }

    if (!cards.length) return;

    gsap.set(cards, { opacity: 0, y: 60, scale: 0.92 });
    gsap.to(cards, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 1.1,
      ease: EASE.expo,
      stagger: 0.16,
      scrollTrigger: { trigger: '.feature-cards', start: 'top 82%', once: true },
    });

    const icons = document.querySelectorAll('.feature-cards .card-icon');
    gsap.from(icons, {
      duration: 0.8,
      ease: EASE.backStrong,
      stagger: 0.16,
      scrollTrigger: { trigger: '.feature-cards', start: 'top 82%', once: true },
      delay: 0.25,
    });
  }

  /* =======================================================================
     3D CARD TILT — pointer-driven rotateX/rotateY + lift on feature cards
     ======================================================================= */
  function initCardTilt() {
    if (prefersReducedMotion || !hasGSAP) return;
    const cards = document.querySelectorAll('.feature-card');

    cards.forEach((card) => {
      gsap.set(card, { transformPerspective: 900, transformOrigin: 'center' });

      const rotateXTo = gsap.quickTo(card, 'rotationX', { duration: 0.9, ease: EASE.out3 });
      const rotateYTo = gsap.quickTo(card, 'rotationY', { duration: 0.9, ease: EASE.out3 });
      const yTo = gsap.quickTo(card, 'y', { duration: 0.9, ease: EASE.out3 });
      const scaleTo = gsap.quickTo(card, 'scale', { duration: 0.9, ease: EASE.out3 });

      card.addEventListener('mouseenter', () => {
        yTo(-15);
        scaleTo(1.03);
      });

      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        rotateYTo(px * 9);
        rotateXTo(-py * 9);
      });

      card.addEventListener('mouseleave', () => {
        rotateXTo(0);
        rotateYTo(0);
        yTo(0);
        scaleTo(1);
      });
    });
  }

  /* =======================================================================
     IMAGE + CERT CARD interaction on hover of the media block
     ======================================================================= */
  function initImageInteraction() {
    const media = document.querySelector('.about-media');
    if (!media || prefersReducedMotion || !hasGSAP) return;

    const img = media.querySelector('.about-media__frame img');
    const overlay = media.querySelector('.about-media__overlay');
    const glow = media.querySelector('.about-media__glow');
    const cert = media.querySelector('.cert-card');

    media.addEventListener('mouseenter', () => {
      gsap.to(img, {
        scale: 1.08,
        rotate: 1.4,
        filter: 'brightness(1.08) contrast(1.12)',
        duration: 1.4,
        ease: EASE.out3,
      });
      gsap.to(overlay, { opacity: 1, duration: 1.1, ease: 'sine.out' });
      gsap.to(glow, { opacity: 0.85, scale: 1.12, duration: 1.3, ease: EASE.out3 });

      if (certFloatTween) certFloatTween.pause();
      gsap.to(cert, {
        y: -18,
        scale: 1.05,
        rotate: 1.5,
        boxShadow: '0 34px 70px rgba(21,91,169,0.55)',
        duration: 1.1,
        ease: EASE.back,
      });
    });

    media.addEventListener('mouseleave', () => {
      gsap.to(img, {
        scale: 1,
        rotate: 0,
        filter: 'brightness(1) contrast(1)',
        duration: 1.4,
        ease: EASE.out3,
      });
      gsap.to(overlay, { opacity: 0, duration: 1.1, ease: 'sine.out' });
      gsap.to(glow, { opacity: 0.55, scale: 1, duration: 1.3, ease: EASE.out3 });

      gsap.to(cert, {
        y: 0,
        scale: 1,
        rotate: 0,
        boxShadow: '0 24px 50px rgba(21,91,169,0.4)',
        duration: 1.1,
        ease: EASE.out3,
        onComplete: () => {
          if (certFloatTween) certFloatTween.restart(true);
        },
      });
    });
  }

  /* =======================================================================
     MAGNETIC EFFECT — buttons follow the cursor slightly within their
     bounds; the certification card gets a subtle horizontal-only pull so
     it never fights its own vertical float tween.
     ======================================================================= */
  function magnetize(el, strength, axes) {
    if (!el || prefersReducedMotion || !hasGSAP) return;
    const xTo = axes.includes('x') ? gsap.quickTo(el, 'x', { duration: 0.7, ease: EASE.out3 }) : null;
    const yTo = axes.includes('y') ? gsap.quickTo(el, 'y', { duration: 0.7, ease: EASE.out3 }) : null;

    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const relX = e.clientX - (r.left + r.width / 2);
      const relY = e.clientY - (r.top + r.height / 2);
      if (xTo) xTo(relX * strength);
      if (yTo) yTo(relY * strength);
    });

    el.addEventListener('mouseleave', () => {
      if (xTo) xTo(0);
      if (yTo) yTo(0);
    });
  }

  function initMagnetic() {
    document.querySelectorAll('.btn-primary-custom, .btn-outline-custom, .btn-light-custom').forEach((btn) => {
      magnetize(btn, 0.32, ['x', 'y']);
    });

    const cert = document.querySelector('.cert-card');
    // Horizontal-only: vertical channel is owned by the idle float tween
    // plus the hover-lift tween above, so magnetism stays on the x axis.
    magnetize(cert, 0.1, ['x']);
  }

  /* =======================================================================
     BUTTON PREMIUM FEEDBACK — ripple + press bounce
     ======================================================================= */
  function initButtonPremium() {
    const buttons = document.querySelectorAll('.btn-primary-custom, .btn-outline-custom, .btn-light-custom');

    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const rect = btn.getBoundingClientRect();
        const ripple = document.createElement('span');
        const size = Math.max(rect.width, rect.height) * 1.4;

        ripple.className = 'ripple';
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
      });

      if (prefersReducedMotion || !hasGSAP) return;

      btn.addEventListener('mousedown', () => {
        gsap.to(btn, { scale: 0.96, duration: 0.18, ease: 'power2.out' });
      });
      btn.addEventListener('mouseup', () => {
        gsap.to(btn, { scale: 1, duration: 0.9, ease: EASE.elastic });
      });
      btn.addEventListener('mouseleave', () => {
        gsap.to(btn, { scale: 1, duration: 0.6, ease: EASE.out3 });
      });
    });
  }

  /* =======================================================================
     SECTION PARALLAX — subtle scroll-linked depth on the About section's
     ambient field, plus a very light pointer-parallax across image,
     floating card, and background decoration. All transform-only.
     ======================================================================= */
  function initSectionParallax() {
    if (prefersReducedMotion || !hasGSAP) return;

    const section = document.querySelector('.about-section');
    const field = document.getElementById('aboutParticles');
    const frame = section ? section.querySelector('.about-media__frame') : null;

    // Scroll-driven parallax for depth.
    if (field) {
      gsap.to(field, {
        y: -70,
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });
    }

    // Pointer parallax — very subtle, image + blobs drift opposite the
    // cursor while feature-card icons get a whisper of movement too.
    if (!section) return;

    const frameTo = frame ? { x: gsap.quickTo(frame, 'x', { duration: 1.1, ease: EASE.out3 }), y: gsap.quickTo(frame, 'y', { duration: 1.1, ease: EASE.out3 }) } : null;
    const blobs = section.querySelectorAll('.ambient-blob');
    const blobTos = Array.from(blobs).map((b) => ({
      x: gsap.quickTo(b, 'x', { duration: 1.6, ease: 'sine.out' }),
      y: gsap.quickTo(b, 'y', { duration: 1.6, ease: 'sine.out' }),
    }));

    section.addEventListener('mousemove', (e) => {
      const r = section.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;

      if (frameTo) {
        frameTo.x(px * 10);
        frameTo.y(py * 10);
      }
      blobTos.forEach((b, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        b.x(px * 22 * dir);
        b.y(py * 22 * dir);
      });
    });

    section.addEventListener('mouseleave', () => {
      if (frameTo) {
        frameTo.x(0);
        frameTo.y(0);
      }
      blobTos.forEach((b) => {
        b.x(0);
        b.y(0);
      });
    });
  }

  /* =======================================================================
     PROCESS SECTION — timeline entrance
     Sequence per the Awwvards-style choreography: line draws left → right,
     then each milestone's circle → icon → number → title lands in a tight
     stagger. A separate ScrollTrigger per item marks completed steps as
     the user scrolls past them, matching "line fills, steps stay lit".
     ======================================================================= */
  function initTimeline() {
    const section = document.querySelector('.process-section');
    if (!section) return;

    const particles = document.getElementById('processParticles');
    const header = section.querySelector('.section-header');
    const line = section.querySelector('.timeline-line__fill');
    const items = Array.from(section.querySelectorAll('.timeline-item'));
    const cta = section.querySelector('.process-cta');

    if (prefersReducedMotion || !hasGSAP) {
      if (particles) particles.style.opacity = '1';
      return;
    }

    if (particles) gsap.set(particles, { opacity: 0 });
    if (header) gsap.set(header, { opacity: 0, y: 34 });
    gsap.set(line, { scaleX: 0, scaleY: 0 });
    gsap.set(items, { opacity: 0, y: 28 });
    items.forEach((item) => {
      gsap.set(item.querySelector('.timeline-icon'), { scale: 0.4, rotate: -90 });
      gsap.set(item.querySelector('.timeline-number'), { scale: 0, y: 10 });
      gsap.set(item.querySelector('.timeline-title'), { opacity: 0, y: 10 });
    });
    if (cta) gsap.set(cta, { opacity: 0, y: 22, scale: 0.92 });

    const isMobileLayout = () => window.innerWidth < 768;

    const tl = gsap.timeline({
      scrollTrigger: { trigger: section, start: 'top 70%', once: true },
      defaults: { ease: EASE.out3 },
    });

    if (particles) tl.to(particles, { opacity: 1, duration: 1.2, ease: 'sine.out' }, 0);
    if (header) tl.to(header, { opacity: 1, y: 0, duration: 1, ease: EASE.out3 }, 0.1);

    tl.to(
      line,
      { [isMobileLayout() ? 'scaleY' : 'scaleX']: 1, duration: 1.1, ease: EASE.expo },
      header ? '-=0.35' : 0.2
    );

    items.forEach((item, i) => {
      const icon = item.querySelector('.timeline-icon');
      const number = item.querySelector('.timeline-number');
      const title = item.querySelector('.timeline-title');
      const pos = i === 0 ? '-=0.55' : '-=0.6';

      tl.to(item, { opacity: 1, y: 0, duration: 0.55 }, pos)
        .to(icon, { scale: 1, rotate: 0, duration: 0.6, ease: EASE.backStrong }, '<')
        .to(number, { scale: 1, y: 0, duration: 0.5, ease: EASE.back }, '-=0.35')
        .to(title, { opacity: 1, y: 0, duration: 0.5 }, '-=0.35');
    });

    if (cta) tl.to(cta, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: EASE.back }, '-=0.15');

    // Independently mark each milestone "active" as it crosses into view,
    // so steps stay highlighted on the way back up too (no `once`).
    items.forEach((item) => {
      ScrollTrigger.create({
        trigger: item,
        start: 'top 78%',
        onEnter: () => item.classList.add('is-active'),
      });
    });
  }

  /**
   * Hover-only motion for timeline circles: subtle pointer-driven tilt on
   * the icon, plus a quick number bounce — kept separate from the entrance
   * timeline above so replaying it never fights the scroll-triggered tween.
   */
  function initTimelineInteractions() {
    if (prefersReducedMotion || !hasGSAP) return;

    document.querySelectorAll('.timeline-item').forEach((item) => {
      const icon = item.querySelector('.timeline-icon');
      if (!icon) return;

      const rotateTo = gsap.quickTo(icon, 'rotate', { duration: 0.6, ease: EASE.out3 });
      const scaleTo = gsap.quickTo(icon, 'scale', { duration: 0.6, ease: EASE.out3 });
      const number = item.querySelector('.timeline-number');

      item.addEventListener('mouseenter', () => {
        scaleTo(1.12);
        if (number) gsap.to(number, { y: -6, duration: 0.4, ease: EASE.back, yoyo: true, repeat: 1 });
      });

      item.addEventListener('mousemove', (e) => {
        const r = icon.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        rotateTo(px * 14);
      });

      item.addEventListener('mouseleave', () => {
        scaleTo(1);
        rotateTo(0);
      });
    });
  }

  /* =======================================================================
     MACHINERY SECTION — solution card entrance, 3D tilt, and image/text
     hover choreography. Continuous background drift stays with the CSS
     `.ambient-blob` keyframes (see style.css); everything below is either
     a one-shot ScrollTrigger entrance or purely hover-driven, so it never
     competes with the idle blob loop for the same transform.
     ======================================================================= */
  function initMachineryCards() {
    const section = document.querySelector('.machinery-section');
    if (!section) return;

    const particles = document.getElementById('machineryParticles');
    const header = section.querySelector('.section-header');
    const cards = Array.from(section.querySelectorAll('.solution-card'));

    if (prefersReducedMotion || !hasGSAP) {
      if (particles) particles.style.opacity = '1';
      return;
    }

    if (particles) gsap.set(particles, { opacity: 0 });
    if (header) gsap.set(header, { opacity: 0, y: 34 });
    gsap.set(cards, { opacity: 0, y: 70, scale: 0.94 });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: section, start: 'top 75%', once: true },
      defaults: { ease: EASE.out3 },
    });

    if (particles) tl.to(particles, { opacity: 1, duration: 1.2, ease: 'sine.out' }, 0);
    if (header) tl.to(header, { opacity: 1, y: 0, duration: 1, ease: EASE.out3 }, 0.1);
    tl.to(
      cards,
      { opacity: 1, y: 0, scale: 1, duration: 1.1, ease: EASE.expo, stagger: 0.16 },
      header ? '-=0.5' : 0.3
    );

    cards.forEach((card) => {
      const img = card.querySelector('.solution-media img');
      const title = card.querySelector('.solution-title');
      const link = card.querySelector('.solution-link');

      gsap.set(card, { transformPerspective: 1000, transformOrigin: 'center' });

      const rotateXTo = gsap.quickTo(card, 'rotationX', { duration: 0.9, ease: EASE.out3 });
      const rotateYTo = gsap.quickTo(card, 'rotationY', { duration: 0.9, ease: EASE.out3 });
      const liftTo = gsap.quickTo(card, 'y', { duration: 0.9, ease: EASE.out3 });
      const imgScaleTo = gsap.quickTo(img, 'scale', { duration: 1.1, ease: EASE.out3 });
      const imgXTo = gsap.quickTo(img, 'x', { duration: 1, ease: EASE.out3 });
      const imgYTo = gsap.quickTo(img, 'y', { duration: 1, ease: EASE.out3 });

      card.addEventListener('mouseenter', () => {
        liftTo(-12);
        imgScaleTo(1.14);
        gsap.to(img, { filter: 'brightness(1.1) contrast(1.12)', duration: 1.1, ease: EASE.out3 });
        if (title) gsap.to(title, { y: -6, duration: 0.7, ease: EASE.out3 });
        if (link) gsap.to(link, { y: -2, duration: 0.7, ease: EASE.out3 });
      });

      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        rotateYTo(px * 10);
        rotateXTo(-py * 10);
        imgXTo(px * -16);
        imgYTo(py * -16);
      });

      card.addEventListener('mouseleave', () => {
        rotateXTo(0);
        rotateYTo(0);
        liftTo(0);
        imgScaleTo(1);
        imgXTo(0);
        imgYTo(0);
        gsap.to(img, { filter: 'brightness(1) contrast(1)', duration: 1.1, ease: EASE.out3 });
        if (title) gsap.to(title, { y: 0, duration: 0.7, ease: EASE.out3 });
        if (link) gsap.to(link, { y: 0, duration: 0.7, ease: EASE.out3 });
      });
    });
  }

  /* =======================================================================
     APPLICATIONS SECTION — "Beyond the Grove"
     Choreography: badge → heading (word-by-word) → subtitle (line-by-line)
     → cards (scale + blur-to-sharp + fade, staggered). Cards themselves
     are `.feature-card`s, so tilt/lift/border-glow/sweep already come
     free from initCardTilt() + the Features section CSS above — this
     function only owns the section's own entrance and the icon's
     rotate/scale + magnetic micro-interaction, which is new.
     ======================================================================= */
  function initApplicationCards() {
    const section = document.querySelector('.applications-section');
    if (!section) return;

    const particles = document.getElementById('applicationsParticles');
    const header = section.querySelector('.section-header');
    const badge = header ? header.querySelector('.section-badge') : null;
    const title = header ? header.querySelector('.section-title') : null;
    const subtitle = header ? header.querySelector('.section-subtitle') : null;
    const cards = Array.from(section.querySelectorAll('.application-card'));

    if (prefersReducedMotion || !hasGSAP) {
      if (particles) particles.style.opacity = '1';
      return;
    }

    const titleWords = title ? splitWords(title) : [];
    const subtitleLines = subtitle ? splitLines(subtitle) : [];

    if (particles) gsap.set(particles, { opacity: 0 });
    if (badge) gsap.set(badge, { opacity: 0, y: 16 });
    gsap.set(cards, { opacity: 0, y: 46, scale: 0.9, filter: 'blur(10px)' });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: section, start: 'top 72%', once: true },
      defaults: { ease: EASE.out3 },
    });

    if (particles) tl.to(particles, { opacity: 1, duration: 1.2, ease: 'sine.out' }, 0);
    if (badge) tl.to(badge, { opacity: 1, y: 0, duration: 0.8 }, 0.1);

    if (titleWords.length) {
      tl.to(
        titleWords,
        { y: 0, rotate: 0, opacity: 1, filter: 'blur(0px)', duration: 1, ease: EASE.out4, stagger: 0.04 },
        '-=0.35'
      );
    }

    if (subtitleLines.length) {
      tl.to(subtitleLines, { y: 0, opacity: 1, duration: 0.9, ease: EASE.out3, stagger: 0.12 }, '-=0.5');
    }

    tl.to(
      cards,
      { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 1, ease: EASE.expo, stagger: 0.14 },
      '-=0.35'
    );

    // Icon-only micro-interaction, layered on top of the card's own
    // tilt/lift (owned by initCardTilt via the shared `.feature-card`
    // class) so the two never compete for the card's transform.
    cards.forEach((card) => {
      const icon = card.querySelector('.card-icon');
      if (!icon) return;

      const scaleTo = gsap.quickTo(icon, 'scale', { duration: 0.6, ease: EASE.out3 });
      const rotateTo = gsap.quickTo(icon, 'rotate', { duration: 0.6, ease: EASE.out3 });
      magnetize(icon, 0.25, ['x', 'y']);

      card.addEventListener('mouseenter', () => {
        scaleTo(1.14);
        rotateTo(-10);
      });
      card.addEventListener('mouseleave', () => {
        scaleTo(1);
        rotateTo(0);
      });
    });
  }

  /* =======================================================================
     CASE STUDIES SECTION — "Success Stories in Efficiency"
     Same recipe as initMachineryCards (entrance timeline + per-card 3D
     tilt/lift + image zoom/parallax/filter on hover), adapted for the
     lighter, text-below-image card layout. `.card-sweep` markup/CSS is
     reused as-is from the Machinery section.
     ======================================================================= */
  function initCaseStudies() {
    const section = document.querySelector('.case-studies-section');
    if (!section) return;

    const particles = document.getElementById('caseStudiesParticles');
    const header = section.querySelector('.section-header');
    const link = section.querySelector('.case-studies-link');
    const cards = Array.from(section.querySelectorAll('.case-study-card'));

    if (prefersReducedMotion || !hasGSAP) {
      if (particles) particles.style.opacity = '1';
      return;
    }

    if (particles) gsap.set(particles, { opacity: 0 });
    if (header) gsap.set(header, { opacity: 0, y: 32 });
    if (link) gsap.set(link, { opacity: 0, x: 24 });
    gsap.set(cards, { opacity: 0, y: 70, scale: 0.94, filter: 'blur(8px)' });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: section, start: 'top 75%', once: true },
      defaults: { ease: EASE.out3 },
    });

    if (particles) tl.to(particles, { opacity: 1, duration: 1.2, ease: 'sine.out' }, 0);
    if (header) tl.to(header, { opacity: 1, y: 0, duration: 1, ease: EASE.out3 }, 0.1);
    if (link) tl.to(link, { opacity: 1, x: 0, duration: 0.9 }, '-=0.6');
    tl.to(
      cards,
      { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 1.1, ease: EASE.expo, stagger: 0.18 },
      header ? '-=0.5' : 0.3
    );

    cards.forEach((card) => {
      const img = card.querySelector('.case-study-media img');
      const title = card.querySelector('.case-study-title');
      if (!img) return;

      gsap.set(card, { transformPerspective: 1200, transformOrigin: 'center' });

      const rotateXTo = gsap.quickTo(card, 'rotationX', { duration: 0.9, ease: EASE.out3 });
      const rotateYTo = gsap.quickTo(card, 'rotationY', { duration: 0.9, ease: EASE.out3 });
      const liftTo = gsap.quickTo(card, 'y', { duration: 0.9, ease: EASE.out3 });
      const imgScaleTo = gsap.quickTo(img, 'scale', { duration: 1.1, ease: EASE.out3 });
      const imgXTo = gsap.quickTo(img, 'x', { duration: 1, ease: EASE.out3 });
      const imgYTo = gsap.quickTo(img, 'y', { duration: 1, ease: EASE.out3 });

      card.addEventListener('mouseenter', () => {
        liftTo(-10);
        imgScaleTo(1.1);
        gsap.to(img, { filter: 'brightness(1.08) contrast(1.1)', duration: 1.1, ease: EASE.out3 });
        if (title) gsap.to(title, { y: -4, duration: 0.7, ease: EASE.out3 });
      });

      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        rotateYTo(px * 6);
        rotateXTo(-py * 6);
        imgXTo(px * -14);
        imgYTo(py * -14);
      });

      card.addEventListener('mouseleave', () => {
        rotateXTo(0);
        rotateYTo(0);
        liftTo(0);
        imgScaleTo(1);
        imgXTo(0);
        imgYTo(0);
        gsap.to(img, { filter: 'brightness(1) contrast(1)', duration: 1.1, ease: EASE.out3 });
        if (title) gsap.to(title, { y: 0, duration: 0.7, ease: EASE.out3 });
      });
    });
  }

  /* =======================================================================
     INSIGHTS SECTION — "PITEX Insights"
     Choreography: badge/title/subtitle fade up, then cards stagger in
     (opacity + y + scale + blur, same recipe as the other card grids).
     Hover reuses the Case Studies/Machinery cards' pointer-driven 3D tilt
     + image zoom, scoped to the card's own title/link for the lift.
     ======================================================================= */
  function initInsightsSection() {
    const section = document.querySelector('.insights-section');
    if (!section) return;

    const particles = document.getElementById('insightsParticles');
    const header = section.querySelector('.section-header');
    const cards = Array.from(section.querySelectorAll('.insight-card'));

    if (prefersReducedMotion || !hasGSAP) {
      if (particles) particles.style.opacity = '1';
      return;
    }

    if (particles) gsap.set(particles, { opacity: 0 });
    if (header) gsap.set(header, { opacity: 0, y: 32 });
    gsap.set(cards, { opacity: 0, y: 56, scale: 0.94, filter: 'blur(8px)' });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: section, start: 'top 75%', once: true },
      defaults: { ease: EASE.out3 },
    });

    if (particles) tl.to(particles, { opacity: 1, duration: 1.2, ease: 'sine.out' }, 0);
    if (header) tl.to(header, { opacity: 1, y: 0, duration: 1, ease: EASE.out3 }, 0.1);
    tl.to(
      cards,
      { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 1, ease: EASE.expo, stagger: 0.15 },
      header ? '-=0.5' : 0.3
    );

    cards.forEach((card) => {
      const img = card.querySelector('.insight-media img');
      const title = card.querySelector('.insight-title');
      const link = card.querySelector('.insight-link');
      if (!img) return;

      gsap.set(card, { transformPerspective: 1000, transformOrigin: 'center' });

      const rotateXTo = gsap.quickTo(card, 'rotationX', { duration: 0.9, ease: EASE.out3 });
      const rotateYTo = gsap.quickTo(card, 'rotationY', { duration: 0.9, ease: EASE.out3 });
      const liftTo = gsap.quickTo(card, 'y', { duration: 0.9, ease: EASE.out3 });
      const imgScaleTo = gsap.quickTo(img, 'scale', { duration: 1.1, ease: EASE.out3 });

      card.addEventListener('mouseenter', () => {
        liftTo(-10);
        imgScaleTo(1.1);
        if (title) gsap.to(title, { y: -3, duration: 0.7, ease: EASE.out3 });
        if (link) gsap.to(link, { x: 4, duration: 0.7, ease: EASE.out3 });
      });

      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        rotateYTo(px * 6);
        rotateXTo(-py * 6);
      });

      card.addEventListener('mouseleave', () => {
        rotateXTo(0);
        rotateYTo(0);
        liftTo(0);
        imgScaleTo(1);
        if (title) gsap.to(title, { y: 0, duration: 0.7, ease: EASE.out3 });
        if (link) gsap.to(link, { x: 0, duration: 0.7, ease: EASE.out3 });
      });
    });
  }

  /* =======================================================================
     CONTACT SECTION
     Left info panel slides in from the left, right form panel slides in
     from the right, then fields/button stagger up — mirrors the About
     section's "background → media → content" choreography, just on two
     panels instead of one. Contact icons get a slow continuous float,
     same recipe as the About section's certification card.
     ======================================================================= */
  function initContactSection() {
    const section = document.querySelector('.contact-section');
    if (!section) return;

    const particles = document.getElementById('contactParticles');
    const infoPanel = section.querySelector('.contact-panel--info');
    const formPanel = section.querySelector('.contact-panel--form');
    const fields = Array.from(section.querySelectorAll('.form-group-custom, .contact-submit-btn'));
    const icons = Array.from(section.querySelectorAll('.contact-icon'));

    if (prefersReducedMotion || !hasGSAP) {
      if (particles) particles.style.opacity = '1';
      return;
    }

    if (particles) gsap.set(particles, { opacity: 0 });
    if (infoPanel) gsap.set(infoPanel, { opacity: 0, x: -70 });
    if (formPanel) gsap.set(formPanel, { opacity: 0, x: 70 });
    gsap.set(fields, { opacity: 0, y: 24 });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: section, start: 'top 75%', once: true },
      defaults: { ease: EASE.out3 },
    });

    if (particles) tl.to(particles, { opacity: 1, duration: 1.2, ease: 'sine.out' }, 0);
    if (infoPanel) tl.to(infoPanel, { opacity: 1, x: 0, duration: 1.2, ease: EASE.expo }, 0.1);
    if (formPanel) tl.to(formPanel, { opacity: 1, x: 0, duration: 1.2, ease: EASE.expo }, infoPanel ? '-=0.9' : 0.1);
    tl.to(fields, { opacity: 1, y: 0, duration: 0.8, ease: EASE.out3, stagger: 0.08 }, '-=0.55');

    // Gentle continuous float for the info panel's icon badges.
    icons.forEach((icon, i) => {
      gsap.to(icon, {
        y: '+=6',
        duration: 2.4 + i * 0.3,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        delay: i * 0.2,
      });
    });
  }

  /* =======================================================================
     FOOTER
     Choreography: logo → description/social → navigation → headquarters →
     industrial excellence (badge + CTA) → bottom bar. Each column's own
     items stagger internally on top of that outer sequence. Continuous
     idle motion: a very subtle logo float, plus the shared ambient-blob
     CSS drift (already animating via the `.footer-blob` classes). Hover-
     only: social icon scale/rotate/lift (GSAP quickTo) — link underline
     and button glow are CSS non-transform affordances.
     ======================================================================= */
  function initFooter() {
    const section = document.querySelector('.site-footer');
    if (!section) return;

    const particles = document.getElementById('footerParticles');
    const logo = section.querySelector('.footer-logo-link');
    const brandDesc = section.querySelector('.footer-brand .footer-brand__desc');
    const socialItems = Array.from(section.querySelectorAll('.footer-social__item'));
    const navHeading = section.querySelector('.footer-links')?.closest('.footer-col')?.querySelector('.footer-heading');
    const navItems = Array.from(section.querySelectorAll('.footer-links__item'));
    const contactHeading = section.querySelector('.footer-contact-list')?.closest('.footer-col')?.querySelector('.footer-heading');
    const contactItems = Array.from(section.querySelectorAll('.footer-contact-item'));
    const excellenceCol = section.querySelector('.footer-badge')?.closest('.footer-col');
    const excellenceHeading = excellenceCol ? excellenceCol.querySelector('.footer-heading') : null;
    const excellenceDesc = excellenceCol ? excellenceCol.querySelector('.footer-brand__desc') : null;
    const badge = section.querySelector('.footer-badge');
    const cta = section.querySelector('.footer-cta');
    const bottomBar = section.querySelector('.footer-bottom');

    if (prefersReducedMotion || !hasGSAP) {
      if (particles) particles.style.opacity = '1';
      return;
    }

    if (particles) gsap.set(particles, { opacity: 0 });
    const fadeBlur = { opacity: 0, y: 22, filter: 'blur(6px)' };

    if (logo) gsap.set(logo, fadeBlur);
    if (brandDesc) gsap.set(brandDesc, fadeBlur);
    gsap.set(socialItems, { opacity: 0, y: 16 });
    if (navHeading) gsap.set(navHeading, fadeBlur);
    gsap.set(navItems, { opacity: 0, y: 16 });
    if (contactHeading) gsap.set(contactHeading, fadeBlur);
    gsap.set(contactItems, { opacity: 0, y: 16 });
    if (excellenceHeading) gsap.set(excellenceHeading, fadeBlur);
    if (excellenceDesc) gsap.set(excellenceDesc, fadeBlur);
    if (badge) gsap.set(badge, { opacity: 0, y: 20, scale: 0.94 });
    if (cta) gsap.set(cta, { opacity: 0, y: 20 });
    if (bottomBar) gsap.set(bottomBar, { opacity: 0, y: 16 });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: section, start: 'top 85%', once: true },
      defaults: { ease: EASE.out4, duration: 0.8 },
    });

    if (particles) tl.to(particles, { opacity: 1, duration: 1.2, ease: 'sine.out' }, 0);
    if (logo) tl.to(logo, { opacity: 1, y: 0, filter: 'blur(0px)' }, 0.05);
    if (brandDesc) tl.to(brandDesc, { opacity: 1, y: 0, filter: 'blur(0px)' }, '-=0.55');
    if (socialItems.length) tl.to(socialItems, { opacity: 1, y: 0, stagger: 0.08 }, '-=0.5');

    if (navHeading) tl.to(navHeading, { opacity: 1, y: 0, filter: 'blur(0px)' }, '-=0.5');
    if (navItems.length) tl.to(navItems, { opacity: 1, y: 0, stagger: 0.07 }, '-=0.5');

    if (contactHeading) tl.to(contactHeading, { opacity: 1, y: 0, filter: 'blur(0px)' }, '-=0.5');
    if (contactItems.length) tl.to(contactItems, { opacity: 1, y: 0, stagger: 0.07 }, '-=0.5');

    if (excellenceHeading) tl.to(excellenceHeading, { opacity: 1, y: 0, filter: 'blur(0px)' }, '-=0.5');
    if (excellenceDesc) tl.to(excellenceDesc, { opacity: 1, y: 0, filter: 'blur(0px)' }, '-=0.55');
    if (badge) tl.to(badge, { opacity: 1, y: 0, scale: 1, ease: EASE.back }, '-=0.4');
    if (cta) tl.to(cta, { opacity: 1, y: 0 }, '-=0.35');

    if (bottomBar) tl.to(bottomBar, { opacity: 1, y: 0 }, '-=0.2');

    // Very subtle continuous logo float.
    if (logo) {
      gsap.to(logo, { y: '+=6', duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1 });
    }

    // Social icon micro-interaction: scale + slight rotate + lift.
    section.querySelectorAll('.footer-social__link').forEach((link) => {
      const scaleTo = gsap.quickTo(link, 'scale', { duration: 0.6, ease: EASE.out3 });
      const rotateTo = gsap.quickTo(link, 'rotate', { duration: 0.6, ease: EASE.out3 });
      const liftTo = gsap.quickTo(link, 'y', { duration: 0.6, ease: EASE.out3 });

      link.addEventListener('mouseenter', () => {
        scaleTo(1.12);
        rotateTo(-8);
        liftTo(-3);
      });
      link.addEventListener('mouseleave', () => {
        scaleTo(1);
        rotateTo(0);
        liftTo(0);
      });
    });
  }

  /* =======================================================================
     STAT COUNTERS — generic count-up for any `[data-count-to]` element.
     Supports negative values, decimals, and an optional +/- prefix/suffix
     so it can drive any future stat block, not just the case studies.
     Reuses the same "fade in, glow briefly, settle" language as the rest
     of the site's entrance choreography.
     ======================================================================= */
  function initCounters() {
    const els = document.querySelectorAll('[data-count-to]');
    if (!els.length) return;

    els.forEach((el) => {
      const to = parseFloat(el.getAttribute('data-count-to'));
      const decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
      const prefix = el.getAttribute('data-prefix') || '';
      const suffix = el.getAttribute('data-suffix') || '';
      const sign = to < 0 ? '-' : prefix;
      const target = Math.abs(to);

      if (prefersReducedMotion || !hasGSAP) {
        el.textContent = `${sign}${target.toFixed(decimals)}${suffix}`;
        return;
      }

      const counter = { val: 0 };
      gsap.set(el, { opacity: 0 });

      ScrollTrigger.create({
        trigger: el,
        start: 'top 90%',
        once: true,
        onEnter: () => {
          gsap.to(el, { opacity: 1, duration: 0.6, ease: EASE.out3 });
          gsap.to(counter, {
            val: target,
            duration: 1.4,
            ease: EASE.out3,
            onUpdate: () => {
              el.textContent = `${sign}${counter.val.toFixed(decimals)}${suffix}`;
            },
            onComplete: () => {
              el.classList.add('is-counted');
            },
          });
        },
      });
    });
  }
})();
