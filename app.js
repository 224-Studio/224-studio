/* ============================================================
   224 STUDIO — CITRINE Extrait de Parfum
   Scroll-Driven Canvas Animation Engine
   ============================================================ */

(function () {
  'use strict';

  // ---------- Configuration ----------
  const TOTAL_FRAMES = 240;
  const FRAME_PATH = (i) => `exploded view/ezgif-frame-${String(i).padStart(3, '0')}.jpg`;
  const LERP_FACTOR = 0.1;            // Smoothness of frame interpolation (lower = smoother)
  const NAVBAR_THRESHOLD = 80;         // px scrolled before navbar appears
  const SCROLL_INDICATOR_HIDE = 60;    // px scrolled before indicator hides

  // ---------- DOM References ----------
  const canvas = document.getElementById('productCanvas');
  const ctx = canvas.getContext('2d');
  const scrollContainer = document.getElementById('scrollContainer');
  const navbar = document.getElementById('navbar');
  const scrollIndicator = document.getElementById('scrollIndicator');
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loaderBar');
  const loaderPercent = document.getElementById('loaderPercent');

  // Overlay sections
  const overlays = Array.from(document.querySelectorAll('.overlay'));

  // ---------- State ----------
  const frames = new Array(TOTAL_FRAMES);
  let currentFrame = 0;
  let targetFrame = 0;
  let imagesLoaded = 0;
  let allLoaded = false;
  let rafId = null;

  // ---------- Canvas Sizing ----------
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Redraw current frame at new size
    if (allLoaded && frames[Math.round(currentFrame)]) {
      drawFrame(Math.round(currentFrame));
    }
  }

  // ---------- Image Preloading ----------
  function preloadImages() {
    let loaded = 0;

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const img = new Image();
      img.src = FRAME_PATH(i + 1);

      img.onload = () => {
        frames[i] = img;
        loaded++;
        const pct = Math.round((loaded / TOTAL_FRAMES) * 100);
        loaderBar.style.width = pct + '%';
        loaderPercent.textContent = pct + '%';

        if (loaded === TOTAL_FRAMES) {
          onAllImagesLoaded();
        }
      };

      img.onerror = () => {
        // Silently skip failed frames — fill with nearest neighbor later
        loaded++;
        const pct = Math.round((loaded / TOTAL_FRAMES) * 100);
        loaderBar.style.width = pct + '%';
        loaderPercent.textContent = pct + '%';

        if (loaded === TOTAL_FRAMES) {
          onAllImagesLoaded();
        }
      };
    }
  }

  function onAllImagesLoaded() {
    allLoaded = true;

    // Fill any missing frames with nearest neighbor
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      if (!frames[i]) {
        // Search forward then backward for nearest valid frame
        for (let j = 1; j < TOTAL_FRAMES; j++) {
          if (frames[i + j]) { frames[i] = frames[i + j]; break; }
          if (frames[i - j]) { frames[i] = frames[i - j]; break; }
        }
      }
    }

    // Hide loader
    requestAnimationFrame(() => {
      loader.classList.add('hidden');
    });

    // Initial draw
    resizeCanvas();
    drawFrame(0);

    // Initialize mist particles
    initParticles();

    // Start animation loop
    startLoop();

    // Activate first overlay
    updateOverlays(0);
  }

  // ---------- Frame Rendering & Premium Mist ----------

  // Spray overlay window (in frame indices).
  // The original frames 84-180 contain the actual spray/smoke from the 3D render.
  // We use ONLY frames 84-120 for the cap-lift sequence (which are clean),
  // then freeze at frame 120 during peak spray, and use frames 200+ for cap return.
  // Our custom particle mist replaces the ugly smoke in the middle.
  const CAP_LIFTED_FRAME = 120;   // Frame where cap is fully lifted, nozzle exposed, no smoke yet
  const SPRAY_OVERLAY_START = 84; // Frame where the spray phase begins (scroll ~35%)
  const SPRAY_OVERLAY_END = 168;  // Frame where spray overlay ends (~70% scroll) — mist fully gone
  
  // Convert frame index to a "spray progress" value (0 to 1)
  function getSprayIntensity(frameIndex) {
    if (frameIndex < SPRAY_OVERLAY_START || frameIndex > SPRAY_OVERLAY_END) return 0;
    
    const t = (frameIndex - SPRAY_OVERLAY_START) / (SPRAY_OVERLAY_END - SPRAY_OVERLAY_START);
    
    // Spray intensity curve:
    // 0.0–0.35: ramp up (cap lifting, first droplets)
    // 0.35–0.55: peak spray  
    // 0.55–1.0: dissipate aggressively (squared falloff)
    if (t < 0.35) return t / 0.35;
    if (t < 0.55) return 1.0;
    const fadeT = (t - 0.55) / 0.45;
    return Math.max(0, 1.0 - fadeT * fadeT);  // Squared curve = faster fade
  }

  function drawFrame(index) {
    // Determine which background frame to use.
    // During the spray phase, we want to use the real frames for cap movement
    // but suppress the ugly smoke by clamping to clean frames.
    let frameToDraw = index;
    
    // During the spray window, use the cap-lifted clean frame
    // to avoid showing the original ugly smoke/fog renders.
    // The original image sequence has smoke/fog from frame 120 through ~225.
    // We freeze on the clean cap-lifted frame 120 for this entire range.
    // Real frames resume at 225+ where the cap descends cleanly.
    const SMOKE_FREE_FRAME = 225;
    if (index > CAP_LIFTED_FRAME && index < SMOKE_FREE_FRAME) {
      frameToDraw = CAP_LIFTED_FRAME;
    }

    const img = frames[Math.floor(frameToDraw)];
    if (!img) return;

    const cw = window.innerWidth;
    const ch = window.innerHeight;

    // Clear
    ctx.clearRect(0, 0, cw, ch);

    // Draw with cover-fit (no distortion)
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const imgAspect = iw / ih;
    const canvasAspect = cw / ch;

    let drawW, drawH, drawX, drawY;

    if (canvasAspect > imgAspect) {
      drawW = cw;
      drawH = cw / imgAspect;
      drawX = 0;
      drawY = (ch - drawH) / 2;
    } else {
      drawH = ch;
      drawW = ch * imgAspect;
      drawX = (cw - drawW) / 2;
      drawY = 0;
    }

    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // Overlay the premium mist particles
    const sprayIntensity = getSprayIntensity(index);
    if (sprayIntensity > 0 && mistTextures.length > 0) {
      const sprayT = (index - SPRAY_OVERLAY_START) / (SPRAY_OVERLAY_END - SPRAY_OVERLAY_START);
      drawPremiumMist(sprayT, sprayIntensity, drawX, drawY, drawW, drawH);
    }
  }

  // ---------- Premium Fragrance Mist System ----------
  //
  // Architecture:
  // - 3 layers of pre-rendered soft radial gradient textures at different sizes
  // - 2000 ultra-fine particles in a tight cone from the nozzle
  // - Scroll-deterministic: position = f(scrollProgress), no real-time simulation
  // - "Lighter" composite mode for translucent glow instead of opaque fog

  const PARTICLE_COUNT = 800;
  const mistParticles = [];
  const mistTextures = [];

  function initParticles() {
    // Create 3 sizes of soft radial gradient texture for variety
    [32, 48, 24].forEach((size) => {
      const c = document.createElement('canvas');
      c.width = size * 2;
      c.height = size * 2;
      const pCtx = c.getContext('2d');

      const grad = pCtx.createRadialGradient(size, size, 0, size, size, size);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
      grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.06)');
      grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.015)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      pCtx.fillStyle = grad;
      pCtx.beginPath();
      pCtx.arc(size, size, size, 0, Math.PI * 2);
      pCtx.fill();

      mistTextures.push(c);
    });

    // Seed a deterministic random for reproducible particle positions
    function seededRandom(seed) {
      let s = seed;
      return function() {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
      };
    }
    const rand = seededRandom(42);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // When this particle "spawns" in scroll-progress space (0–1)
      const spawnT = rand() * 0.65;
      
      // How long it lives in scroll-progress units
      const life = 0.10 + rand() * 0.18;

      // Spray direction: tight cone shooting upper-left from nozzle
      // Center angle: ~210° (upper-left), spread: ±25°
      const centerAngle = (210 * Math.PI) / 180;
      const spread = ((rand() - 0.5) * 50 * Math.PI) / 180;
      const angle = centerAngle + spread;

      // Speed (distance traveled over lifetime) — normalized, scaled at render time
      const speed = 60 + rand() * 180;

      // Particle size (very small for fine mist — tiny dots, not clouds)
      const baseSize = 1 + rand() * 5;

      // Max opacity — EXTREMELY low for gossamer-thin mist, never opaque
      const maxOpacity = 0.006 + rand() * 0.012;

      // Slight vertical drift (gravity-like, but mist rises slightly)
      const drift = -20 + rand() * 40;

      // Which texture to use
      const texIdx = Math.floor(rand() * mistTextures.length);

      // Turbulence offset for organic motion
      const turbFreq = 2 + rand() * 4;
      const turbAmp = 5 + rand() * 15;

      mistParticles.push({
        spawnT, life, angle, speed, baseSize, maxOpacity, drift, texIdx, turbFreq, turbAmp
      });
    }
  }

  function drawPremiumMist(scrollT, intensity, drawX, drawY, drawW, drawH) {
    // Nozzle position: the atomizer nozzle tip.
    // Based on visual inspection of frame 120, the nozzle is at roughly:
    // X: 47% from left of the image (slightly left of center)
    // Y: 28% from top of the image
    const nozzleX = drawX + drawW * 0.47;
    const nozzleY = drawY + drawH * 0.28;

    // Scale particles relative to viewport for consistent look across screen sizes
    const scale = Math.min(drawW, drawH) / 800;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = mistParticles[i];

      // Is this particle alive at current scroll position?
      if (scrollT < p.spawnT) continue;
      const age = (scrollT - p.spawnT) / p.life;
      if (age > 1) continue;

      // Ease-out deceleration (particles slow as they travel)
      const easeAge = 1 - Math.pow(1 - age, 3);
      const dist = p.speed * easeAge * scale;

      // Base trajectory
      let x = nozzleX + Math.cos(p.angle) * dist;
      let y = nozzleY + Math.sin(p.angle) * dist;

      // Add slight drift (rises slightly)
      y += p.drift * age * scale;

      // Add organic turbulence (sine wave displacement)
      const turbOffset = Math.sin(age * p.turbFreq * Math.PI) * p.turbAmp * scale;
      x += turbOffset * 0.5;
      y += turbOffset;

      // Particle grows as it disperses
      const currentSize = p.baseSize * (1 + age * 2.5) * scale;

      // Opacity envelope: quick fade-in, sustained, smooth fade-out
      let opacity = p.maxOpacity;
      if (age < 0.15) {
        opacity *= age / 0.15;
      } else if (age > 0.5) {
        opacity *= 1 - ((age - 0.5) / 0.5);
      }

      // Apply overall spray intensity (handles ramp-up and dissipation)
      opacity *= intensity;

      // Skip invisible particles
      if (opacity < 0.002) continue;

      ctx.globalAlpha = opacity;

      const tex = mistTextures[p.texIdx];
      const halfSize = currentSize;
      ctx.drawImage(tex, x - halfSize, y - halfSize, halfSize * 2, halfSize * 2);
    }

    ctx.restore();
  }


  // ---------- Scroll Progress ----------
  function getScrollProgress() {
    const scrollTop = window.scrollY || window.pageYOffset;
    const containerTop = scrollContainer.offsetTop;
    const containerHeight = scrollContainer.offsetHeight;
    const viewportHeight = window.innerHeight;

    // Progress within the scroll container
    const scrollInContainer = scrollTop - containerTop;
    const maxScroll = containerHeight - viewportHeight;

    if (maxScroll <= 0) return 0;

    return Math.max(0, Math.min(1, scrollInContainer / maxScroll));
  }

  // ---------- Lerp Utility ----------
  function lerp(start, end, factor) {
    return start + (end - start) * factor;
  }

  // ---------- Overlay Controller ----------
  function updateOverlays(progress) {
    overlays.forEach((overlay) => {
      const start = parseFloat(overlay.dataset.start);
      const end = parseFloat(overlay.dataset.end);

      // Compute overlay opacity with smooth fade in/out margins
      const fadeDuration = 0.04;
      const fadeInStart = start;
      const fadeInEnd = start + fadeDuration;
      const fadeOutStart = end - fadeDuration;
      const fadeOutEnd = end;

      let opacity = 0;

      if (progress >= fadeInStart && progress <= fadeOutEnd) {
        if (start === 0 && progress < fadeInEnd) {
          // Hero section: fully visible from the start
          opacity = 1;
        } else if (progress < fadeInEnd) {
          // Fading in
          opacity = (progress - fadeInStart) / (fadeInEnd - fadeInStart);
        } else if (progress > fadeOutStart) {
          // Fading out
          opacity = 1 - (progress - fadeOutStart) / (fadeOutEnd - fadeOutStart);
        } else {
          // Fully visible
          opacity = 1;
        }
      }

      opacity = Math.max(0, Math.min(1, opacity));

      overlay.style.opacity = opacity;

      // Subtle parallax on text (slight Y shift based on progress within range)
      if (opacity > 0) {
        const rangeProgress = (progress - start) / (end - start);
        const yShift = (rangeProgress - 0.5) * -16; // -8px to +8px
        overlay.style.transform = `translateY(${yShift}px)`;
      } else {
        overlay.style.transform = 'translateY(0)';
      }
    });
  }

  // ---------- Navbar Controller ----------
  function updateNavbar() {
    const scrollTop = window.scrollY || window.pageYOffset;

    if (scrollTop > NAVBAR_THRESHOLD) {
      navbar.classList.add('visible');
    } else {
      navbar.classList.remove('visible');
    }
  }

  // ---------- Scroll Indicator Controller ----------
  function updateScrollIndicator() {
    const scrollTop = window.scrollY || window.pageYOffset;

    if (scrollTop > SCROLL_INDICATOR_HIDE) {
      scrollIndicator.classList.add('hidden');
    } else {
      scrollIndicator.classList.remove('hidden');
    }
  }

  // ---------- Main Animation Loop ----------
  function startLoop() {
    function tick() {
      if (!allLoaded) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      // Get scroll progress and target frame
      const progress = getScrollProgress();
      targetFrame = progress * (TOTAL_FRAMES - 1);

      // Lerp current frame toward target
      currentFrame = lerp(currentFrame, targetFrame, LERP_FACTOR);

      // Snap if very close
      if (Math.abs(currentFrame - targetFrame) < 0.1) {
        currentFrame = targetFrame;
      }

      // Draw
      const frameIndex = Math.round(currentFrame);
      const clampedIndex = Math.max(0, Math.min(TOTAL_FRAMES - 1, frameIndex));
      drawFrame(clampedIndex);

      // Update text overlays
      updateOverlays(progress);

      // Update navbar
      updateNavbar();

      // Update scroll indicator
      updateScrollIndicator();

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
  }

  // ---------- Event Listeners ----------
  window.addEventListener('resize', () => {
    resizeCanvas();
  });

  // ---------- Fragrance Catalogue Data ----------
  const fragrances = [
    // MEN'S COLLECTION
    {
      id: 'citrine',
      name: 'CITRINE',
      collection: "MEN'S COLLECTION",
      description: "Bright, fresh, and effortlessly magnetic. Citrine opens with an energetic burst of juicy fruits and crisp citrus before settling into a smooth aquatic heart and a warm woody-musky finish. It's made for the man who leaves a lasting impression without trying too hard.",
      topNotes: 'Apple, Bergamot, Lemon, Cinnamon',
      middleNotes: 'Watery Notes, Plum, Orange Blossom, Cardamom',
      baseNotes: 'Ambergris, Musk, Driftwood, Patchouli',
      image: 'images-perfume/Final/Citrine White BG.png'
    },
    {
      id: 'magnetic',
      name: 'MAGNETIC',
      collection: "MEN'S COLLECTION",
      description: "Bold from the very first spray, Magnetic is all about confidence and irresistible charm. A spicy opening melts into rich woods and warm amber, creating a powerful scent that feels modern, intense, and unforgettable—perfect for evenings and special occasions.",
      topNotes: 'Cardamom, Bergamot, Ginger',
      middleNotes: 'Caramel, Orange Blossom',
      baseNotes: 'Amberwood, Vanilla, Tonka Bean, Vetiver',
      image: 'images-perfume/Final/Magnetic White BG.png'
    },
    {
      id: 'bitter-sweet',
      name: 'BITTER SWEET',
      collection: "MEN'S COLLECTION",
      description: "A perfect balance of freshness and depth, Bitter Sweet is bold, sophisticated, and effortlessly timeless. Vibrant fruits meet smoky woods to create a scent that feels confident, refined, and made for every occasion.",
      topNotes: 'Pineapple, Bergamot, Black Currant, Apple',
      middleNotes: 'Birch, Patchouli, Moroccan Jasmine, Rose',
      baseNotes: 'Musk, Oakmoss, Ambergris, Vanilla',
      image: 'images-perfume/Final/Bittersweet White BG.png'
    },
    {
      id: 'skyline',
      name: 'SKYLINE',
      collection: "MEN'S COLLECTION",
      description: "Powerful, intense, and undeniably captivating. Skyline blends vibrant spices with rich lavender and deep woods, creating a bold signature scent that commands attention from day to night.",
      topNotes: 'Grapefruit, Cinnamon, Nutmeg, Cardamom',
      middleNotes: 'Lavender',
      baseNotes: 'Licorice, Sandalwood, Amber, Patchouli, Haitian Vetiver',
      image: 'images-perfume/Final/Eclipse White BG.png' // Mapped to Eclipse
    },
    // WOMEN'S COLLECTION
    {
      id: 'forbidden',
      name: 'FORBIDDEN',
      collection: "WOMEN'S COLLECTION",
      description: "Playful, juicy, and impossible to ignore. Forbidden bursts open with luscious fruits before blooming into delicate florals, finishing with a soft, sweet warmth.",
      topNotes: 'Red Apple, Black Currant, Lychee, Pink Grapefruit',
      middleNotes: 'Wild Berries, Raspberry Blossom, Jasmine, Rose Centifolia',
      baseNotes: 'Vanilla Flower, Amber Crystals, Musk, Moss',
      image: 'images-perfume/Final/Forbidden White BG.png'
    },
    {
      id: 'ash-vanilla',
      name: 'ASH & VANILLA',
      collection: "WOMEN'S COLLECTION",
      description: "Warm, cozy, and effortlessly addictive. Ash & Vanilla wraps rich vanilla in soft florals and creamy woods.",
      topNotes: 'Vanilla Orchid, Jasmine',
      middleNotes: 'Brown Sugar, Tonka Bean',
      baseNotes: 'Amber, Amberwood, Musk, Patchouli',
      image: 'images-perfume/Final/Ash & Vanilla White BG.png'
    },
    {
      id: 'muse',
      name: 'MUSE',
      collection: "WOMEN'S COLLECTION",
      description: "Fresh, confident, and full of energy. Muse combines sparkling fruits with soft florals and a clean musky finish.",
      topNotes: 'Passionfruit, Grapefruit, Pineapple, Strawberry, Tangerine',
      middleNotes: 'Peony, Jasmine, Lily-of-the-Valley, Vanilla Orchid, Red Berries',
      baseNotes: 'Musk, Woody Notes, Oakmoss',
      image: 'images-perfume/Final/Muse White BG.png'
    },
    {
      id: 'sweetheart',
      name: 'SWEETHEART',
      collection: "WOMEN'S COLLECTION",
      description: "Sweet, creamy, and irresistibly charming. Sweetheart blends juicy fruits with fluffy vanilla and soft candy-like accords.",
      topNotes: 'Green Mandarin, Black Currant',
      middleNotes: 'Strawberry Fizz Candy, Gardenia',
      baseNotes: 'Vanilla, Sandalwood, Musk, Amber',
      image: 'images-perfume/Final/Sugar Pop White BG.png' // Mapped to Sugar Pop
    }
  ];

  const pricing = {
    '30': '₹450',
    '50': '₹800',
    '100': '₹1,400'
  };

  // ---------- Catalogue Rendering ----------
  function renderCatalogue() {
    const mensGrid = document.getElementById('mensGrid');
    const womensGrid = document.getElementById('womensGrid');
    if (!mensGrid || !womensGrid) return;

    fragrances.forEach(frag => {
      const card = document.createElement('div');
      card.className = 'catalogue-card';
      card.innerHTML = `
        <div class="catalogue-card__image-wrapper">
          <img src="${frag.image}" alt="${frag.name}" loading="lazy" />
        </div>
        <div class="catalogue-card__info">
          <h3 class="catalogue-card__title">${frag.name}</h3>
          <p class="catalogue-card__notes">${frag.topNotes.split(',')[0]}, ${frag.middleNotes.split(',')[0]}...</p>
          <button class="catalogue-card__cta" data-id="${frag.id}">View Details</button>
        </div>
      `;
      
      card.querySelector('.catalogue-card__cta').addEventListener('click', () => openModal(frag));

      if (frag.collection === "MEN'S COLLECTION") {
        mensGrid.appendChild(card);
      } else {
        womensGrid.appendChild(card);
      }
    });
  }

  // ---------- Modal Controller ----------
  const productModal = document.getElementById('productModal');
  const modalClose = document.getElementById('modalClose');
  const sizeOptions = document.querySelectorAll('.size-option');
  const modalPrice = document.getElementById('modalPrice');

  function openModal(frag) {
    if (!productModal) return;
    
    // Populate Data
    document.getElementById('modalImage').src = frag.image;
    document.getElementById('modalName').textContent = frag.name;
    document.getElementById('modalCollection').textContent = frag.collection;
    document.getElementById('modalDesc').textContent = frag.description;
    document.getElementById('modalTop').textContent = frag.topNotes;
    document.getElementById('modalMid').textContent = frag.middleNotes;
    document.getElementById('modalBase').textContent = frag.baseNotes;

    // Reset size to 50ml default
    sizeOptions.forEach(opt => opt.classList.remove('active'));
    const defaultOption = document.querySelector('.size-option[data-size="50"]');
    if(defaultOption) {
      defaultOption.classList.add('active');
      modalPrice.textContent = pricing['50'];
    }

    productModal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  if (modalClose) {
    modalClose.addEventListener('click', () => {
      productModal.classList.remove('active');
      document.body.style.overflow = '';
    });
  }

  if (sizeOptions.length > 0) {
    sizeOptions.forEach(option => {
      option.addEventListener('click', (e) => {
        sizeOptions.forEach(opt => opt.classList.remove('active'));
        e.target.classList.add('active');
        const size = e.target.getAttribute('data-size');
        modalPrice.textContent = pricing[size];
      });
    });
  }

  // Prevent layout shifts during load
  window.addEventListener('load', () => {
    resizeCanvas();
    renderCatalogue();
    initEditorialTabs(); // Initialise the editorial nav tabs
  });

  // ---------- Editorial Tab Controller ----------
  function initEditorialTabs() {
    const tabs = document.querySelectorAll('.editorial__tab');
    const panels = document.querySelectorAll('.editorial__panel');
    if (!tabs.length || !panels.length) return;

    /**
     * Activates the tab matching `id` and fades in the corresponding panel.
     * All transitions are CSS-driven; JS only toggles classes + hidden attribute.
     */
    function activateTab(targetId) {
      tabs.forEach(tab => {
        const isTarget = tab.dataset.tab === targetId;
        tab.classList.toggle('editorial__tab--active', isTarget);
        tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
        tab.setAttribute('tabindex', isTarget ? '0' : '-1');
      });

      panels.forEach(panel => {
        const isTarget = panel.id === `panel-${targetId}`;

        if (isTarget) {
          // Remove hidden so CSS transition can work, then trigger active class
          panel.removeAttribute('hidden');
          // Force reflow so the initial state (opacity:0 translateY:16px) is painted
          // before we apply the active class.
          // eslint-disable-next-line no-unused-expressions
          panel.offsetHeight;
          panel.classList.add('editorial__panel--active');
          panel.removeAttribute('aria-hidden');
        } else {
          panel.classList.remove('editorial__panel--active');
          panel.setAttribute('aria-hidden', 'true');
          // Re-hide after the fade-out transition finishes (400 ms)
          // Only hide if not already hidden to avoid flash
          const delay = 420;
          const ref = panel;
          setTimeout(() => {
            if (!ref.classList.contains('editorial__panel--active')) {
              ref.setAttribute('hidden', '');
            }
          }, delay);
        }
      });
    }

    // Click listener
    tabs.forEach(tab => {
      tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    });

    // Keyboard: left/right arrow key navigation within the tab list
    tabs.forEach((tab, index) => {
      tab.addEventListener('keydown', (e) => {
        let next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          next = tabs[(index + 1) % tabs.length];
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          next = tabs[(index - 1 + tabs.length) % tabs.length];
        }
        if (next) {
          e.preventDefault();
          next.focus();
          activateTab(next.dataset.tab);
        }
      });
    });

    // Set initial tabindex: only the active tab is reachable via Tab key;
    // the others use arrow keys (ARIA tab pattern).
    tabs.forEach((tab, i) => {
      tab.setAttribute('tabindex', i === 0 ? '0' : '-1');
    });
  }

  // ---------- Init ----------
  resizeCanvas();
  preloadImages();

})();
