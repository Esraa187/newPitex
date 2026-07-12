/* =========================================================================
   PITEX — products-data.js
   Single source of truth for every production line/machine shown across
   the site. index.html (preview) and production-lines.html (full
   catalog) both read from `data` and render through the *same*
   `renderProductCard()` function — one component, one place the markup
   is defined, no duplicated card HTML between pages.
   ========================================================================= */

window.PitexProducts = (function () {
  'use strict';

  const data = [
    {
      id: 'olive-receiving-washing',
      title: 'Olive Receiving & Washing Line',
      category: 'equipment',
      categoryLabel: 'Equipment',
      featured: true,
      image: 'assets/images/machine-washing.jpg',
      alt: 'PITEX olive receiving and washing line on the production floor',
      description: 'High-capacity automated reception, leaf removal, and double-stage washing system.',
      icons: ['bi-speedometer2', 'bi-droplet-half', 'bi-shield-check'],
    },
    {
      id: 'sorting-inspection',
      title: 'Sorting & Inspection System',
      category: 'automation',
      categoryLabel: 'Automation',
      image: 'assets/images/machine-milling.jpg',
      alt: 'Optical sorting and inspection belts for olives',
      description: 'Precision optical and manual inspection belts for optimal olive quality control.',
      icons: ['bi-eye', 'bi-cpu-fill', 'bi-shield-check'],
    },
    {
      id: 'crushing-milling',
      title: 'Crushing & Milling Machine',
      category: 'processing',
      categoryLabel: 'Processing',
      image: 'assets/images/machine-decanting.jpg',
      alt: 'Stainless steel hammer mill crushing olives',
      description: 'Stainless steel hammer mills designed for efficient cellular breakage of olives.',
      icons: ['bi-gear-wide-connected', 'bi-lightning-charge', 'bi-shield-check'],
    },
    {
      id: 'malaxing-system',
      title: 'Malaxing System',
      category: 'processing',
      categoryLabel: 'Processing',
      featured: true,
      image: 'assets/images/case-andalusia.jpg',
      alt: 'Horizontal thermal-controlled malaxing units',
      description: 'Horizontal thermal-controlled kneading units to facilitate oil drop aggregation.',
      icons: ['bi-thermometer-half', 'bi-arrow-repeat', 'bi-shield-check'],
    },
    {
      id: 'extraction-decanter',
      title: 'Olive Oil Extraction (Decanter)',
      category: 'processing',
      categoryLabel: 'Processing',
      image: 'assets/images/case-florence.jpg',
      alt: 'High-speed centrifugal decanter for olive oil extraction',
      description: 'High-speed centrifugal horizontal extraction for maximum yield and oil purity.',
      icons: ['bi-droplet', 'bi-speedometer2', 'bi-shield-check'],
    },
    {
      id: 'vertical-separator',
      title: 'Vertical Separator',
      category: 'processing',
      categoryLabel: 'Processing',
      image: 'assets/images/insight-ai-pressing.jpg',
      alt: 'Vertical separator tower for final oil clarification',
      description: 'High-precision final clarification of olive oil from remaining moisture.',
      icons: ['bi-funnel', 'bi-droplet-half', 'bi-shield-check'],
    },
    {
      id: 'filtration-system',
      title: 'Filtration System',
      category: 'processing',
      categoryLabel: 'Processing',
      image: 'assets/images/insight-modular-series.jpg',
      alt: 'Plate filter press filtration system',
      description: 'Advanced paper and plate filter presses for a bright, crystal-clear final product.',
      icons: ['bi-filter', 'bi-droplet', 'bi-shield-check'],
    },
    {
      id: 'storage-tanks',
      title: 'Olive Oil Storage Tanks',
      category: 'storage',
      categoryLabel: 'Storage',
      image: 'assets/images/insight-waste-recovery.jpg',
      alt: 'Stainless steel olive oil storage tanks',
      description: 'Nitrogen-inertized stainless steel tanks for premium long-term preservation.',
      icons: ['bi-archive', 'bi-thermometer-half', 'bi-shield-check'],
    },
    {
      id: 'filling-line',
      title: 'Automatic Filling Line',
      category: 'automation',
      categoryLabel: 'Automation',
      featured: true,
      image: 'assets/images/machine-washing.jpg',
      alt: 'Automatic volumetric filling line for bottles and tins',
      description: 'Volumetric and weight-based filling systems for glass and tin containers.',
      icons: ['bi-speedometer2', 'bi-cpu-fill', 'bi-shield-check'],
    },
    {
      id: 'capping-machine',
      title: 'Bottle Capping Machine',
      category: 'automation',
      categoryLabel: 'Automation',
      image: 'assets/images/machine-milling.jpg',
      alt: 'Multi-head bottle capping machine',
      description: 'Multi-head capping stations for screw-caps, T-corks, and pressure caps.',
      icons: ['bi-gear', 'bi-cpu-fill', 'bi-shield-check'],
    },
    {
      id: 'labeling-machine',
      title: 'Labeling Machine',
      category: 'automation',
      categoryLabel: 'Automation',
      image: 'assets/images/machine-decanting.jpg',
      alt: 'High-speed adhesive labeling machine with vision check',
      description: 'High-speed adhesive labeling with precise orientation and vision check.',
      icons: ['bi-tag', 'bi-eye', 'bi-shield-check'],
    },
    {
      id: 'packaging-line',
      title: 'Packaging Line',
      category: 'packaging',
      categoryLabel: 'Packaging',
      image: 'assets/images/case-andalusia.jpg',
      alt: 'End-of-line case packing and palletizing system',
      description: 'End-of-line case packing and palletizing for global distribution logistics.',
      icons: ['bi-box-seam', 'bi-truck', 'bi-shield-check'],
    },
    {
      id: 'conveyor-systems',
      title: 'Conveyor Systems',
      category: 'equipment',
      categoryLabel: 'Equipment',
      image: 'assets/images/case-florence.jpg',
      alt: 'Modular conveyor systems synchronizing plant flow',
      description: 'Custom modular belt and roller solutions for synchronized plant flow.',
      icons: ['bi-arrow-left-right', 'bi-gear', 'bi-shield-check'],
    },
    {
      id: 'turnkey-line',
      title: 'Complete Turnkey Production Line',
      category: 'complete',
      categoryLabel: 'Complete Lines',
      featured: true,
      image: 'assets/images/insight-ai-pressing.jpg',
      alt: 'Complete turnkey olive oil production line installation',
      description: 'Fully integrated end-to-end solution from raw olive reception to palletized oil.',
      icons: ['bi-diagram-3', 'bi-cpu-fill', 'bi-shield-check'],
    },
  ];

  /**
   * The one place product-card HTML is authored. index.html and
   * production-lines.html both call this — never write out card markup
   * by hand in either page.
   */
  function renderProductCard(p) {
    const featuredBadge = p.featured
      ? '<span class="product-badge product-badge--featured">Featured</span>'
      : '';
    const icons = (p.icons || [])
      .map((ic) => `<span class="product-icon" aria-hidden="true"><i class="bi ${ic}"></i></span>`)
      .join('');

    return `
      <div class="col-12 col-sm-6 col-lg-3">
        <article class="product-card gsap-stagger-item" data-category="${p.category}">
          <div class="product-card__media">
            <img src="${p.image}" alt="${p.alt}" loading="lazy" width="600" height="450" />
            <div class="product-overlay" aria-hidden="true"></div>
            <div class="card-sweep" aria-hidden="true"></div>
            ${featuredBadge}
            <button type="button" class="product-favorite" data-favorite aria-pressed="false" aria-label="Save ${p.title} to favorites">
              <i class="bi bi-heart" aria-hidden="true"></i>
            </button>
          </div>
          <div class="product-card__body">
            <span class="eyebrow product-category">${p.categoryLabel}</span>
            <h3 class="product-title">${p.title}</h3>
            <p class="product-text">${p.description}</p>
            <div class="product-card__footer">
              <div class="product-icons" aria-hidden="true">${icons}</div>
              <a href="#" class="link-arrow product-link">
                Learn More
                <i class="bi bi-arrow-right" aria-hidden="true"></i>
              </a>
            </div>
          </div>
        </article>
      </div>`;
  }

  return { data, renderProductCard };
})();
