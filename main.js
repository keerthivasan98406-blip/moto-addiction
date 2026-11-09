/* =============================================
   MOTOFORCE — main.js
   Interactive functionality for the website
   ============================================= */

// ========== PRELOADER RACE TRACK ANIMATION ==========
document.addEventListener('DOMContentLoaded', () => {
  const preloader = document.getElementById('preloader');

  // Skip preloader on navigation (only show on very first page load per session)
  if (sessionStorage.getItem('mps_visited')) {
    if (preloader) preloader.classList.add('hidden');
    return;
  }
  sessionStorage.setItem('mps_visited', '1');

  const speedLinesContainer = document.getElementById('speed-lines-container');
  if (speedLinesContainer) {
    // Generate horizontal particle speed lines
    for (let i = 0; i < 18; i++) {
      const line = document.createElement('div');
      line.className = 'speed-line';
      line.style.top = Math.random() * 100 + 'vh';
      line.style.width = (60 + Math.random() * 200) + 'px';
      line.style.animationDelay = (Math.random() * 2) + 's';
      line.style.animationDuration = (0.5 + Math.random() * 1.5) + 's';
      speedLinesContainer.appendChild(line);
    }
  }

  const speedValEl = document.getElementById('speed-value');
  const speedometerFill = document.getElementById('speedometer-fill');
  const raceFill = document.getElementById('preloader-race-fill');
  const motorcycle = document.getElementById('preloader-motorcycle');

  let currentSpeed = 0;
  const targetSpeed = 299; // Top speed in km/h
  const duration = 2000; // 2 seconds speed-up
  const steps = 100;
  const stepTime = duration / steps;
  const speedStep = targetSpeed / steps;

  const timer = setInterval(() => {
    currentSpeed += speedStep;
    const progress = (currentSpeed / targetSpeed) * 100;

    if (currentSpeed >= targetSpeed) {
      clearInterval(timer);
      if (speedValEl) speedValEl.textContent = targetSpeed;
      if (speedometerFill) speedometerFill.style.strokeDashoffset = 0;
      if (raceFill) raceFill.style.width = '100%';
      if (motorcycle) motorcycle.style.left = '98%';

      setTimeout(() => {
        if (preloader) preloader.classList.add('hidden');
      }, 300);
    } else {
      if (speedValEl) speedValEl.textContent = Math.floor(currentSpeed);
      if (speedometerFill) {
        const offset = 502.65 - (progress * 502.65 / 100);
        speedometerFill.style.strokeDashoffset = offset;
      }
      if (raceFill) raceFill.style.width = progress + '%';
      if (motorcycle) motorcycle.style.left = Math.min(progress, 98) + '%';
    }
  }, stepTime);
});

// ========== NAVBAR SCROLL BEHAVIOR ==========
const navbar = document.getElementById('navbar');
const isHomePage = !!document.querySelector('.hero');

const updateNavbarScroll = () => {
  if (!navbar) return;
  if (!isHomePage || window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
};
window.addEventListener('scroll', () => {
  updateNavbarScroll();

  // Active nav link highlight (Only on home page with section anchors)
  if (isHomePage) {
    const sections = document.querySelectorAll('section[id]');
    let current = '';
    sections.forEach(section => {
      const sectionTop = section.offsetTop - 100;
      if (window.scrollY >= sectionTop) current = section.getAttribute('id');
    });
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${current}`) link.classList.add('active');
    });
  }

  // Back to top visibility
  const backBtn = document.getElementById('back-to-top');
  if (window.scrollY > 400) backBtn.classList.add('visible');
  else backBtn.classList.remove('visible');
});

// Run once on initial load
updateNavbarScroll();

// ========== HAMBURGER MENU (RESPONSIVE MOBILE NAVIGATION) ==========
function setupMobileNav() {
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('nav-links');
  if (!hamburger || !navLinks) return;

  if (hamburger.dataset.bound) return;
  hamburger.dataset.bound = 'true';

  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = hamburger.classList.toggle('open');
    navLinks.classList.toggle('open', isOpen);
    document.body.classList.toggle('nav-menu-open', isOpen);
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
      document.body.classList.remove('nav-menu-open');
    });
  });

  document.addEventListener('click', (e) => {
    if (navLinks.classList.contains('open') && !navLinks.contains(e.target) && !hamburger.contains(e.target)) {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
      document.body.classList.remove('nav-menu-open');
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
      document.body.classList.remove('nav-menu-open');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupMobileNav);
} else {
  setupMobileNav();
}

// ========== SEARCH OVERLAY ==========
const searchBtn = document.getElementById('search-btn');
const searchOverlay = document.getElementById('search-overlay');
const searchClose = document.getElementById('search-close');
const searchInput = document.getElementById('search-input');

if (searchBtn && searchOverlay) {
  searchBtn.addEventListener('click', () => {
    searchOverlay.classList.add('active');
    if (searchInput) setTimeout(() => searchInput.focus(), 300);
  });
}
if (searchClose && searchOverlay) {
  searchClose.addEventListener('click', () => searchOverlay.classList.remove('active'));
}
if (searchOverlay) {
  searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) searchOverlay.classList.remove('active');
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && searchOverlay) searchOverlay.classList.remove('active');
});

// ========== HERO CAROUSEL ==========
let currentSlide = 0;
const slides = document.querySelectorAll('.carousel-slide');
const dots = document.querySelectorAll('.dot');
const totalSlides = slides.length;
let carouselTimer = null;

function goToSlide(index) {
  slides[currentSlide].classList.remove('active');
  dots[currentSlide].classList.remove('active');
  currentSlide = (index + totalSlides) % totalSlides;
  slides[currentSlide].classList.add('active');
  dots[currentSlide].classList.add('active');
}

function nextSlide() { goToSlide(currentSlide + 1); }
function prevSlide() { goToSlide(currentSlide - 1); }

function startCarouselTimer() {
  carouselTimer = setInterval(nextSlide, 5000);
}
function resetCarouselTimer() {
  clearInterval(carouselTimer);
  startCarouselTimer();
}

const nextBtn = document.getElementById('carousel-next');
const prevBtn = document.getElementById('carousel-prev');
if (nextBtn) nextBtn.addEventListener('click', () => { nextSlide(); resetCarouselTimer(); });
if (prevBtn) prevBtn.addEventListener('click', () => { prevSlide(); resetCarouselTimer(); });
dots.forEach((dot, i) => {
  dot.addEventListener('click', () => { goToSlide(i); resetCarouselTimer(); });
});

// Touch swipe support
let touchStartX = 0;
const carousel = document.getElementById('carousel');
if (carousel) {
  carousel.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; });
  carousel.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? nextSlide() : prevSlide();
      resetCarouselTimer();
    }
  });
  startCarouselTimer();
}

// Function to limit the number of visible products to 8 (2 rows) on the home page
function applyProductDisplayLimit() {
  const cards = document.querySelectorAll('.product-card');
  let visibleCount = 0;
  cards.forEach(card => {
    if (card.style.display !== 'none') {
      if (visibleCount < 8) {
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    }
  });
}

// ========== DYNAMIC PRODUCTS FROM DATABASE ==========
async function loadProductsFromAPI() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('Failed to load products');
    const data = await res.json();
    const products = (data.products || []).filter(p => p.status === 'ACTIVE' && !p.is_archived);

    const loadingEl = document.getElementById('products-loading');
    if (loadingEl) loadingEl.remove();

    if (products.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:50px 20px; color:#A1A1AA;"><div style="font-size:2rem; margin-bottom:10px;">🏍️</div><p style="font-size:1.1rem; font-weight:600; color:#fff;">No products listed yet</p><p style="font-size:0.9rem; margin-top:6px;">Add products from the Owner Portal to display them here.</p></div>';
      return;
    }

    // Determine if on homepage
    const isHomePage = window.location.pathname === '/' || window.location.pathname === '/index.html' || window.location.pathname === '';
    const displayProducts = isHomePage ? products.slice(0, 8) : products;

    grid.innerHTML = displayProducts.map(p => {
      const price = p.price || 0;
      const oldPrice = p.old_price;
      const discount = p.discount || 0;
      const rating = p.rating || 5.0;
      const ratingCount = p.rating_count || 1;
      const stars = '★'.repeat(Math.round(rating)) + '☆'.repeat(Math.max(0, 5 - Math.round(rating)));
      const brandName = p.brand_name || '';
      const catSlug = (p.category_slug || p.category_name || 'all').toLowerCase();
      
      // Parse 3 images array from images_json or fallback to primary_image
      let images = [];
      try {
        images = typeof p.images_json === 'string' ? JSON.parse(p.images_json || '[]') : (p.images_json || []);
      } catch (e) { images = []; }
      
      if (!Array.isArray(images) || images.length === 0) {
        if (p.primary_image) images = [p.primary_image];
      }
      if (images.length === 0) images = ['hero1.png'];

      // Format image URLs
      images = images.map(img => {
        if (!img.startsWith('data:') && !img.startsWith('http://') && !img.startsWith('https://') && !img.startsWith('/')) {
          return '/' + img;
        }
        return img;
      });

      const badges = p.is_bestseller ? '<span class="badge badge-hot">BESTSELLER</span>' :
                     (p.is_featured ? '<span class="badge badge-new">FEATURED</span>' : '');

      return `
        <div class="product-card" id="prod-${p.id}" data-category="${catSlug}" data-id="${p.id}">
          <!-- Product Image Slider (Multi-Image Slide Option) -->
          <div class="product-img-wrap product-slider-wrap" data-current-slide="0" data-total-slides="${images.length}">
            <div class="slider-track">
              ${images.map((img, idx) => `
                <img src="${img}" alt="${p.name} - view ${idx + 1}" class="product-img slide-img" loading="lazy" onerror="this.src='/hero1.png'" />
              `).join('')}
            </div>
            ${badges ? `<div class="product-badges">${badges}</div>` : ''}
            <button class="overlay-wish" aria-label="Wishlist" data-id="${p.id}">♡</button>

            ${images.length > 1 ? `
              <button type="button" class="slide-nav-btn prev-btn" aria-label="Previous image" onclick="event.stopPropagation(); changeCardSlide(this, -1)">‹</button>
              <button type="button" class="slide-nav-btn next-btn" aria-label="Next image" onclick="event.stopPropagation(); changeCardSlide(this, 1)">›</button>
              <div class="slide-dots">
                ${images.map((_, idx) => `
                  <span class="slide-dot ${idx === 0 ? 'active' : ''}" onclick="event.stopPropagation(); setCardSlide(this, ${idx})"></span>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <div class="product-info">
            ${brandName ? `<span class="product-brand">${brandName}</span>` : ''}
            <h3 class="product-name">${p.name}</h3>
            <div class="product-rating">
              <span class="stars">${stars}</span>
              <span class="rating-count">(${ratingCount})</span>
            </div>
            <div class="product-pricing">
              <span class="price-current">₹${price.toLocaleString('en-IN')}</span>
              ${oldPrice ? `<span class="price-old">₹${oldPrice.toLocaleString('en-IN')}</span>` : ''}
              ${discount > 0 ? `<span class="price-discount">${discount}% OFF</span>` : ''}
            </div>
            <div class="product-actions">
              <button class="btn-buy buy-btn" data-id="${p.id}" data-name="${p.name}" data-price="${price}">Buy Now</button>
              <button class="btn-cart add-cart-btn" data-id="${p.id}" data-name="${p.name}" data-price="${price}">Add to Cart</button>
            </div>
          </div>
        </div>`;
    }).join('');

    // Bind cart & wishlist buttons
    grid.querySelectorAll('.add-cart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        addToCart(btn.dataset.id, btn.dataset.name, parseInt(btn.dataset.price));
        btn.textContent = '✓ Added!';
        btn.style.background = 'linear-gradient(135deg, #4ade80, #16a34a)';
        setTimeout(() => { btn.textContent = 'Add to Cart'; btn.style.background = ''; }, 1500);
      });
    });

    grid.querySelectorAll('.overlay-wish').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.classList.toggle('active');
        btn.textContent = btn.classList.contains('active') ? '♥' : '♡';
        btn.style.color = btn.classList.contains('active') ? '#ff4d00' : '';
        showToast(btn.classList.contains('active') ? '❤️ Added to wishlist!' : 'Removed from wishlist');
      });
    });

    // Setup Touch and Swipe on Card Image Sliders
    setupCardSliderTouchEvents();

    // Initialize category filters on newly rendered cards
    initDynamicProductFilters();

  } catch (err) {
    console.error('Failed to load products:', err);
    const grid2 = document.getElementById('products-grid');
    if (grid2) grid2.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#A1A1AA;"><p>Products currently unavailable.</p></div>';
  }
}

// Card Slider Navigation Functions
function changeCardSlide(btn, direction) {
  const sliderWrap = btn.closest('.product-slider-wrap');
  if (!sliderWrap) return;
  const total = parseInt(sliderWrap.dataset.totalSlides, 10) || 1;
  let current = parseInt(sliderWrap.dataset.currentSlide, 10) || 0;
  current = (current + direction + total) % total;
  applySliderIndex(sliderWrap, current);
}

function setCardSlide(dot, index) {
  const sliderWrap = dot.closest('.product-slider-wrap');
  if (!sliderWrap) return;
  applySliderIndex(sliderWrap, index);
}

function applySliderIndex(sliderWrap, index) {
  sliderWrap.dataset.currentSlide = index;
  const track = sliderWrap.querySelector('.slider-track');
  if (track) {
    track.style.transform = 'translateX(-' + (index * 100) + '%)';
  }
  const dots = sliderWrap.querySelectorAll('.slide-dot');
  dots.forEach((d, i) => {
    d.classList.toggle('active', i === index);
  });
}

// Touch swipe support for card sliders
function setupCardSliderTouchEvents() {
  document.querySelectorAll('.product-slider-wrap').forEach(wrap => {
    if (wrap.dataset.touchBound) return;
    wrap.dataset.touchBound = 'true';
    const total = parseInt(wrap.dataset.totalSlides, 10) || 1;
    if (total <= 1) return;

    let startX = 0;
    let startY = 0;

    wrap.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    wrap.addEventListener('touchend', (e) => {
      const diffX = startX - e.changedTouches[0].clientX;
      const diffY = startY - e.changedTouches[0].clientY;
      if (Math.abs(diffX) > 30 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX > 0) {
          // Swiped left -> Next
          changeCardSlide(wrap.querySelector('.next-btn') || wrap, 1);
        } else {
          // Swiped right -> Previous
          changeCardSlide(wrap.querySelector('.prev-btn') || wrap, -1);
        }
      }
    }, { passive: true });
  });
}

// Filter Tabs Handler for dynamically loaded cards
function initDynamicProductFilters() {
  const filterTabs = document.querySelectorAll('.filter-tab');
  if (!filterTabs.length) return;

  filterTabs.forEach(tab => {
    if (tab.dataset.bound) return;
    tab.dataset.bound = 'true';
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const filter = (tab.getAttribute('data-filter') || 'all').toLowerCase();
      const productCards = document.querySelectorAll('.product-card');

      productCards.forEach(card => {
        const cardCat = (card.getAttribute('data-category') || '').toLowerCase();
        if (filter === 'all' || cardCat === filter || cardCat.includes(filter)) {
          card.style.display = '';
          card.style.animation = 'fadeInUp 0.4s ease forwards';
        } else {
          card.style.display = 'none';
        }
      });
      if (typeof applyProductDisplayLimit === 'function') applyProductDisplayLimit();
    });
  });

  // Check URL category parameter (e.g. ?category=helmets)
  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get('category');
  if (catParam) {
    const matchingTab = Array.from(filterTabs).find(t => t.getAttribute('data-filter')?.toLowerCase() === catParam.toLowerCase());
    if (matchingTab) matchingTab.click();
  }
}

// Load products on page load
if (document.getElementById('products-grid')) {
  loadProductsFromAPI();
}

// ========== CART FUNCTIONALITY ==========
let cart = [];
const cartCountEl = document.getElementById('cart-count');
const cartSidebar = document.getElementById('cart-sidebar');
const cartOverlay = document.getElementById('cart-overlay');
const cartItemsEl = document.getElementById('cart-items');
const cartFooterEl = document.getElementById('cart-footer');
const cartEmpty = document.getElementById('cart-empty');
const cartTotalEl = document.getElementById('cart-total-amount');

function openCart() {
  cartSidebar.classList.add('open');
  cartOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  cartSidebar.classList.remove('open');
  cartOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

document.getElementById('cart-btn')?.addEventListener('click', openCart);
document.getElementById('cart-close-btn')?.addEventListener('click', closeCart);
if (cartOverlay) cartOverlay.addEventListener('click', closeCart);

function updateCartUI() {
  const count = cart.reduce((acc, item) => acc + item.qty, 0);
  cartCountEl.textContent = count;
  if (count > 0) cartCountEl.classList.add('visible');
  else cartCountEl.classList.remove('visible');

  const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  cartTotalEl.textContent = `₹${total.toLocaleString('en-IN')}`;

  if (cart.length === 0) {
    cartEmpty.style.display = '';
    cartFooterEl.style.display = 'none';
    cartItemsEl.innerHTML = '';
    cartItemsEl.appendChild(cartEmpty);
  } else {
    cartEmpty.style.display = 'none';
    cartFooterEl.style.display = '';
    // Render cart items
    const existingItems = cartItemsEl.querySelectorAll('.cart-item');
    existingItems.forEach(el => el.remove());
    cart.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'cart-item';
      el.innerHTML = `
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">₹${(item.price * item.qty).toLocaleString('en-IN')}</div>
        <span>×${item.qty}</span>
        <button class="cart-item-remove" data-idx="${idx}" aria-label="Remove">✕</button>
      `;
      cartItemsEl.appendChild(el);
    });
    cartItemsEl.querySelectorAll('.cart-item-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        cart.splice(idx, 1);
        updateCartUI();
      });
    });
  }
}

function addToCart(id, name, price) {
  const existing = cart.find(item => item.id === id);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ id, name, price, qty: 1 });
  }
  updateCartUI();
  showToast(`🛒 ${name} added to cart!`);
}

document.querySelectorAll('.add-cart-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = btn.getAttribute('data-id');
    const name = btn.getAttribute('data-name');
    const price = parseInt(btn.getAttribute('data-price'));
    addToCart(id, name, price);

    // Button animation
    btn.textContent = '✓ Added!';
    btn.style.background = 'linear-gradient(135deg, #4ade80, #16a34a)';
    setTimeout(() => {
      btn.textContent = 'Add to Cart';
      btn.style.background = '';
    }, 1500);
  });
});

// ========== 2-STEP CHECKOUT FLOW ==========
const checkoutModal = document.getElementById('checkout-modal');
const checkoutForm = document.getElementById('checkout-form');
const custScreenshotInput = document.getElementById('cust-screenshot');
const checkoutSubmitBtn = document.getElementById('checkout-submit-btn');

const UPI_ID = '9894703254@upi'; // Store UPI ID
let activeCheckoutItem = null;
let checkoutDeliveryData = null;

function openCheckout(directItem = null) {
  if (directItem) {
    activeCheckoutItem = directItem;
  } else {
    activeCheckoutItem = null;
    if (cart.length === 0) { showToast('🛒 Your cart is empty!'); return; }
  }
  closeCart();
  showCheckoutStep1();
  checkoutModal.classList.add('active');
}

function closeCheckout() {
  checkoutModal.classList.remove('active');
  activeCheckoutItem = null;
  checkoutDeliveryData = null;
  showCheckoutStep1();
}

function showCheckoutStep1() {
  const s1 = document.getElementById('checkout-step-1');
  const s2 = document.getElementById('checkout-step-2');
  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
  updateStep1Summary();
}

function showCheckoutStep2() {
  const s1 = document.getElementById('checkout-step-1');
  const s2 = document.getElementById('checkout-step-2');
  if (s1) s1.style.display = 'none';
  if (s2) s2.style.display = 'block';
  updatePaymentStep();
}

function updateStep1Summary() {
  let items = [], total = 0;
  if (activeCheckoutItem) {
    items = [activeCheckoutItem];
    total = activeCheckoutItem.price;
  } else {
    items = cart;
    total = cart.reduce((a, i) => a + i.price * i.qty, 0);
  }
  const previewEl = document.getElementById('checkout-items-preview');
  const totalEl = document.getElementById('summary-total-amount');
  if (previewEl) {
    previewEl.innerHTML = items.map(i => `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>${i.name}${i.qty > 1 ? ' x' + i.qty : ''}</span><span>₹${(i.price * (i.qty || 1)).toLocaleString('en-IN')}</span></div>`).join('') + `<div style="display:flex;justify-content:space-between;color:#4ade80;font-size:0.8rem;"><span>Shipping</span><span>FREE</span></div>`;
  }
  if (totalEl) totalEl.textContent = `₹${total.toLocaleString('en-IN')}`;
}

function updatePaymentStep() {
  let items = [], total = 0;
  if (activeCheckoutItem) {
    items = [{ name: activeCheckoutItem.name, price: activeCheckoutItem.price, qty: 1 }];
    total = activeCheckoutItem.price;
  } else {
    items = cart.map(i => ({ name: i.name, price: i.price, qty: i.qty }));
    total = cart.reduce((a, i) => a + i.price * i.qty, 0);
  }

  const totalFmt = `₹${total.toLocaleString('en-IN')}`;
  document.getElementById('payment-total').textContent = totalFmt;
  document.getElementById('qr-amount-label').textContent = totalFmt;
  document.getElementById('instr-amount').textContent = totalFmt;
  document.getElementById('payment-items-count').textContent = `${items.reduce((a,i)=>a+(i.qty||1),0)} item(s)`;
  document.getElementById('qr-upi-label').textContent = UPI_ID;
  document.getElementById('instr-upi').textContent = UPI_ID;

  // List items
  const listEl = document.getElementById('payment-items-list');
  if (listEl) listEl.innerHTML = items.map(i => `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>${i.name}${i.qty>1?' x'+i.qty:''}</span><span>₹${(i.price*(i.qty||1)).toLocaleString('en-IN')}</span></div>`).join('');

  // Generate QR code using Google Charts API (UPI deep link)
  const upiUrl = `upi://pay?pa=${UPI_ID}&pn=MOTO+PIT&am=${total}&cu=INR&tn=MotoOrder`;
  const qrUrl = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(upiUrl)}&choe=UTF-8`;
  const qrImg = document.getElementById('payment-qr-img');
  if (qrImg) { qrImg.src = qrUrl; qrImg.onerror = () => { qrImg.style.display='none'; }; }

  // Update WhatsApp link
  const waBtn = document.getElementById('whatsapp-help-btn');
  if (waBtn) waBtn.href = `https://wa.me/919894703254?text=Hi%2C+I+need+help+with+my+Moto+Pit+order.+Total%3A+${totalFmt}`;

  // Reset screenshot
  document.getElementById('screenshot-preview').style.display = 'none';
  if (checkoutSubmitBtn) checkoutSubmitBtn.style.display = 'none';
  if (custScreenshotInput) custScreenshotInput.value = '';
}

function openUPIApp(app) {
  let items = activeCheckoutItem ? [activeCheckoutItem] : cart;
  const total = activeCheckoutItem ? activeCheckoutItem.price : cart.reduce((a,i)=>a+i.price*i.qty,0);
  const note = encodeURIComponent('Moto Pit Order');
  let url = '';
  if (app === 'gpay') url = `tez://upi/pay?pa=${UPI_ID}&pn=MotoPit&am=${total}&cu=INR&tn=${note}`;
  else if (app === 'phonepe') url = `phonepe://pay?pa=${UPI_ID}&pn=MotoPit&am=${total}&cu=INR&tn=${note}`;
  else if (app === 'paytm') url = `paytmmp://pay?pa=${UPI_ID}&pn=MotoPit&am=${total}&cu=INR&tn=${note}`;
  window.location.href = url;
  setTimeout(() => showToast('If the app didn\'t open, please scan the QR code'), 2000);
}

// Close buttons
document.getElementById('checkout-close')?.addEventListener('click', closeCheckout);
document.getElementById('checkout-close-2')?.addEventListener('click', closeCheckout);
document.getElementById('btn-back-to-delivery')?.addEventListener('click', showCheckoutStep1);
checkoutModal?.addEventListener('click', (e) => { if (e.target === checkoutModal) closeCheckout(); });

// Checkout button from cart
document.getElementById('checkout-btn')?.addEventListener('click', () => openCheckout());

// Step 1 form submit → go to payment step
if (checkoutForm) {
  checkoutForm.addEventListener('submit', (e) => {
    e.preventDefault();
    checkoutDeliveryData = {
      name: document.getElementById('cust-name').value.trim(),
      email: document.getElementById('cust-email').value.trim(),
      phone: document.getElementById('cust-phone').value.trim(),
      address: document.getElementById('cust-address').value.trim(),
      city: document.getElementById('cust-city').value.trim(),
      pincode: document.getElementById('cust-pincode').value.trim(),
    };
    showCheckoutStep2();
  });
}

// Buy Now click (event delegation)
document.addEventListener('click', (e) => {
  const buyBtn = e.target.closest('.buy-btn');
  if (buyBtn) {
    e.stopPropagation();
    const id = buyBtn.getAttribute('data-id');
    const name = buyBtn.getAttribute('data-name');
    const price = parseInt(buyBtn.getAttribute('data-price'), 10);
    const img = buyBtn.closest('.product-card')?.querySelector('.product-img')?.src || '';
    openCheckout({ id, name, price, qty: 1, image: img });
  }
});

// Screenshot upload
if (custScreenshotInput) {
  custScreenshotInput.addEventListener('change', () => {
    const file = custScreenshotInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = document.getElementById('screenshot-preview');
        const imgEl = document.getElementById('screenshot-img-preview');
        if (preview && imgEl) { imgEl.src = ev.target.result; preview.style.display = 'block'; }
        if (checkoutSubmitBtn) checkoutSubmitBtn.style.display = 'block';
        showToast('📸 Screenshot uploaded!');
      };
      reader.readAsDataURL(file);
    }
  });
}

// Confirm Order button
if (checkoutSubmitBtn) {
  checkoutSubmitBtn.addEventListener('click', async () => {
    if (!checkoutDeliveryData) return showToast('Please fill delivery details first');
    const screenshotFile = custScreenshotInput?.files[0];
    if (!screenshotFile) return showToast('Please upload payment screenshot first');

    checkoutSubmitBtn.disabled = true;
    checkoutSubmitBtn.textContent = 'Placing Order...';

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const screenshotDataUrl = ev.target.result;

      let itemsList = [], total = 0;
      if (activeCheckoutItem) {
        itemsList = [{ product_id: activeCheckoutItem.id, name: activeCheckoutItem.name, price: activeCheckoutItem.price, quantity: 1, image: activeCheckoutItem.image || '' }];
        total = activeCheckoutItem.price;
      } else {
        itemsList = cart.map(i => ({ product_id: i.id, name: i.name, price: i.price, quantity: i.qty, image: i.image || '' }));
        total = cart.reduce((a, i) => a + i.price * i.qty, 0);
      }

      const fullAddress = `${checkoutDeliveryData.address}, ${checkoutDeliveryData.city} - ${checkoutDeliveryData.pincode}`;

      const payload = {
        customer: {
          name: checkoutDeliveryData.name,
          email: checkoutDeliveryData.email,
          phone: checkoutDeliveryData.phone,
          address: { line1: checkoutDeliveryData.address, city: checkoutDeliveryData.city, pincode: checkoutDeliveryData.pincode, full: fullAddress },
          payment: 'UPI',
          screenshot: screenshotDataUrl
        },
        items: itemsList,
        payment: { status: 'SUCCESS', method: 'UPI', transactionRef: `UPI-${Date.now()}` }
      };

      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Order failed');

        const orderNum = data.orderNumber || ('MPS-' + Date.now());

        if (!activeCheckoutItem) { cart = []; updateCartUI(); }

        closeCheckout();
        showToast(`🏁 Order Placed! #${orderNum} — We'll confirm via WhatsApp/Email`);

      } catch (err) {
        showToast(`❌ Error: ${err.message}`);
        checkoutSubmitBtn.disabled = false;
        checkoutSubmitBtn.textContent = '✅ Confirm Order';
      }
    };
    reader.readAsDataURL(screenshotFile);
  });
}

// Legacy checkout functions removed - handled by 2-step flow above

// ========== AUTHENTICATION & USER ACCOUNT SYSTEM ==========
const accountBtn = document.getElementById('account-btn');
const accountBtnLabel = document.getElementById('account-btn-label');
const accountWrap = document.getElementById('nav-account-wrap');
const dropdownMenu = document.getElementById('account-dropdown-menu');
const dropdownUserName = document.getElementById('dropdown-user-name');
const dropdownUserEmail = document.getElementById('dropdown-user-email');
const dropdownAvatarInitials = document.getElementById('dropdown-avatar-initials');
const dropdownLogoutBtn = document.getElementById('dropdown-logout-btn');

const wishlistBtn = document.getElementById('wishlist-btn');

let loggedInUser = null;

async function checkAuthStatus() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      loggedInUser = (data.authenticated && data.user) ? data.user : null;
    } else {
      loggedInUser = null;
    }
  } catch (err) {
    loggedInUser = null;
  }
  updateAuthUI();
  updateNavbarActiveState();
}

function updateAuthUI() {
  if (loggedInUser) {
    const displayName = loggedInUser.full_name || loggedInUser.email;
    const parts = displayName.trim().split(' ');
    const initials = parts.length >= 2 
      ? (parts[0][0] + parts[1][0]).toUpperCase() 
      : parts[0].substring(0, 2).toUpperCase();

    if (accountBtnLabel) {
      accountBtnLabel.textContent = parts[0];
      accountBtnLabel.style.display = 'inline-block';
    }

    if (dropdownUserName) dropdownUserName.textContent = displayName;
    if (dropdownUserEmail) dropdownUserEmail.textContent = loggedInUser.email;
    if (dropdownAvatarInitials) dropdownAvatarInitials.textContent = initials;
  } else {
    if (accountBtnLabel) {
      accountBtnLabel.textContent = 'Account';
      accountBtnLabel.style.display = 'none';
    }
    if (dropdownUserName) dropdownUserName.textContent = 'Guest';
    if (dropdownUserEmail) dropdownUserEmail.textContent = 'Sign in to your account';
    if (dropdownAvatarInitials) dropdownAvatarInitials.textContent = 'MP';
  }
}

// Navbar Active State
function updateNavbarActiveState() {
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-link');

  navLinks.forEach(link => link.classList.remove('active'));

  if (currentPath === '/' || currentPath === '/index.html') {
    const homeLink = document.getElementById('nav-home');
    if (homeLink) homeLink.classList.add('active');
  } else if (currentPath.includes('/products') || currentPath.includes('/shop')) {
    const shopLink = document.getElementById('nav-shop');
    if (shopLink) shopLink.classList.add('active');
  } else if (currentPath.includes('/track-order')) {
    const trackLink = document.getElementById('nav-track');
    if (trackLink) trackLink.classList.add('active');
  } else if (currentPath.includes('/account')) {
    const accBtn = document.getElementById('account-btn');
    if (accBtn) accBtn.classList.add('active');
  }
}

// Account Button Click Logic
if (accountBtn) {
  accountBtn.addEventListener('click', (e) => {
    // Mobile touch toggle or direct click
    if (window.innerWidth <= 768 && dropdownMenu) {
      dropdownMenu.classList.toggle('active');
    } else {
      if (loggedInUser) {
        window.location.href = '/account';
      } else {
        window.location.href = '/login';
      }
    }
  });
}

// Wishlist Button Click Logic
if (wishlistBtn) {
  wishlistBtn.addEventListener('click', () => {
    if (loggedInUser) {
      window.location.href = '/account?tab=wishlist';
    } else {
      window.location.href = '/login?redirect=/account?tab=wishlist';
    }
  });
}

// Dropdown Logout Handler
if (dropdownLogoutBtn) {
  dropdownLogoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      loggedInUser = null;
      updateAuthUI();
      showToast('Logged out successfully');
      setTimeout(() => { window.location.href = '/'; }, 400);
    } catch (e) {
      window.location.href = '/';
    }
  });
}

// Search Input Keyboard Navigation
const searchInputEl = document.getElementById('search-input');
if (searchInputEl) {
  searchInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const term = searchInputEl.value.trim();
      if (term) {
        window.location.href = `/products?search=${encodeURIComponent(term)}`;
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', checkAuthStatus);

// Cart shop link
document.getElementById('cart-shop-link')?.addEventListener('click', closeCart);

// ========== WISHLIST ==========
document.querySelectorAll('.overlay-wish').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    btn.classList.toggle('active');
    if (btn.classList.contains('active')) {
      btn.textContent = '♥';
      btn.style.color = '#ff4d00';
      showToast('❤️ Added to wishlist!');
    } else {
      btn.textContent = '♡';
      btn.style.color = '';
      showToast('Removed from wishlist');
    }
  });
});

// ========== TOAST NOTIFICATIONS ==========
function showToast(message, duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ========== NEWSLETTER FORM ==========
document.getElementById('newsletter-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const emailInput = document.getElementById('newsletter-email');
  const email = emailInput ? emailInput.value : '';
  showToast(`🎉 Subscribed with ${email}! ₹500 coupon sent to your email.`);
  if (emailInput) emailInput.value = '';
});

// ========== CONTACT FORM ==========
const contactForm = document.getElementById('contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameEl = document.getElementById('contact-name');
    const name = nameEl ? nameEl.value : 'Rider';
    showToast(`✅ Thanks ${name}! We'll get back to you within 24 hours.`);
    e.target.reset();
  });
}

// ========== BACK TO TOP ==========
document.getElementById('back-to-top')?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ========== SCROLL REVEAL ANIMATION ==========
function revealOnScroll() {
  const elements = document.querySelectorAll(
    '.product-card, .why-card, .testimonial-card, .contact-detail, .footer-links-col'
  );
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }, i * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  elements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}
revealOnScroll();

// ========== SMOOTH SCROLL FOR ALL ANCHOR LINKS ==========
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const targetId = this.getAttribute('href').slice(1);
    const target = document.getElementById(targetId);
    if (target) {
      e.preventDefault();
      const offset = target.getBoundingClientRect().top + window.scrollY - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'));
      window.scrollTo({ top: offset, behavior: 'smooth' });
    }
  });
});

// ========== RATING BARS ANIMATION ==========
const ratingBarsObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const fills = entry.target.querySelectorAll('.bar-fill');
      fills.forEach(fill => {
        const width = fill.style.width;
        fill.style.width = '0';
        setTimeout(() => { fill.style.width = width; }, 200);
      });
      ratingBarsObserver.unobserve(entry.target);
    }
  });
});
const ratingBars = document.getElementById('rating-bars');
if (ratingBars) ratingBarsObserver.observe(ratingBars);

// ========== PRODUCT IMAGE MODAL (LIGHTBOX) ==========
const imageModal = document.getElementById('image-modal');
const modalImg = document.getElementById('modal-img');
const modalClose = document.getElementById('modal-close');
const modalPrev = document.getElementById('modal-prev');
const modalNext = document.getElementById('modal-next');

let currentGallery = [];
let currentImageIndex = 0;

function openImageModal(images) {
  currentGallery = images.filter(Boolean); // remove empty images
  currentImageIndex = 0;
  
  const dotsContainer = document.getElementById('modal-dots');
  
  if (currentGallery.length <= 1) {
    if (modalPrev) modalPrev.style.display = 'none';
    if (modalNext) modalNext.style.display = 'none';
    if (dotsContainer) dotsContainer.style.display = 'none';
  } else {
    if (modalPrev) modalPrev.style.display = 'flex';
    if (modalNext) modalNext.style.display = 'flex';
    if (dotsContainer) {
      dotsContainer.style.display = 'flex';
      dotsContainer.innerHTML = '';
      currentGallery.forEach((_, idx) => {
        const dot = document.createElement('span');
        dot.className = 'modal-dot' + (idx === 0 ? ' active' : '');
        dot.setAttribute('data-index', idx);
        dot.addEventListener('click', () => {
          currentImageIndex = idx;
          updateModalImage();
        });
        dotsContainer.appendChild(dot);
      });
    }
  }
  
  updateModalImage();
  imageModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeImageModal() {
  imageModal.classList.remove('active');
  document.body.style.overflow = '';
}

function updateModalImage() {
  if (currentGallery.length === 0) return;
  modalImg.src = currentGallery[currentImageIndex];
  
  // Animation reset
  modalImg.style.animation = 'none';
  modalImg.offsetHeight; // trigger reflow
  modalImg.style.animation = 'zoomIn 0.3s ease forwards';

  const dots = document.querySelectorAll('.modal-dot');
  dots.forEach((dot, idx) => {
    if (idx === currentImageIndex) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

function nextModalImage() {
  if (currentGallery.length <= 1) return;
  currentImageIndex = (currentImageIndex + 1) % currentGallery.length;
  updateModalImage();
}

function prevModalImage() {
  if (currentGallery.length <= 1) return;
  currentImageIndex = (currentImageIndex - 1 + currentGallery.length) % currentGallery.length;
  updateModalImage();
}

// Delegate click event for product images (works for dynamically added owner products too)
document.addEventListener('click', (e) => {
  const card = e.target.closest('.product-card');
  if (card) {
    const imgWrap = e.target.closest('.product-img-wrap');
    if (imgWrap) {
      // If the click was directly on a button inside the wrap, don't open the modal
      if (e.target.closest('button')) return;
      
      const imgEl = imgWrap.querySelector('.product-img');
      if (imgEl) {
        const src = imgEl.getAttribute('src');
        const src2 = card.getAttribute('data-image2');
        
        const gallery = [src];
        if (src2 && src2 !== src) {
          gallery.push(src2);
        }
        openImageModal(gallery);
      }
    }
  }
});

if (modalClose) {
  modalClose.addEventListener('click', closeImageModal);
  imageModal.addEventListener('click', (e) => {
    if (e.target === imageModal) closeImageModal();
  });
  modalNext.addEventListener('click', nextModalImage);
  modalPrev.addEventListener('click', prevModalImage);
  
  document.addEventListener('keydown', (e) => {
    if (!imageModal.classList.contains('active')) return;
    if (e.key === 'Escape') closeImageModal();
    if (e.key === 'ArrowRight') nextModalImage();
    if (e.key === 'ArrowLeft') prevModalImage();
  });
}

console.log('%cMotoForce Website Loaded Successfully!', 'color: #ff4d00; font-size: 18px; font-weight: bold;');
