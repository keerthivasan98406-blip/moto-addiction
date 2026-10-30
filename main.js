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
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }

  // Active nav link highlight
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

  // Back to top visibility
  const backBtn = document.getElementById('back-to-top');
  if (window.scrollY > 400) backBtn.classList.add('visible');
  else backBtn.classList.remove('visible');
});

// ========== HAMBURGER MENU ==========
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('nav-links');
if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
    });
  });
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

// ========== DYNAMIC OWNER PRODUCTS ==========
function loadOwnerProducts() {
  const productsGrid = document.getElementById('products-grid');
  if (!productsGrid) return;

  // Only inject owner products on the products/shop page, not the homepage
  if (window.location.pathname === '/' || window.location.pathname === '/index.html') return;

  const ownerProducts = JSON.parse(localStorage.getItem('owner_products') || '[]');
  
  ownerProducts.forEach(prod => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.id = prod.id;
    card.setAttribute('data-category', prod.category);
    card.setAttribute('data-image2', prod.image2 || '');
    
    // Generate Stars
    const fullStars = Math.floor(prod.rating);
    const halfStar = prod.rating % 1 !== 0;
    let starsHtml = '★'.repeat(fullStars) + (halfStar ? '☆' : '') + '☆'.repeat(5 - Math.ceil(prod.rating));

    // Pricing HTML
    let pricingHtml = `<span class="price-current">₹${prod.price.toLocaleString('en-IN')}</span>`;
    if (prod.oldPrice) {
      pricingHtml += `\n<span class="price-old">₹${prod.oldPrice.toLocaleString('en-IN')}</span>`;
      if (prod.discount) pricingHtml += `\n<span class="price-discount">${prod.discount}% OFF</span>`;
    }

    // Badge HTML
    let badgeHtml = '';
    if (prod.badge) {
      const badgeClass = prod.badge.toLowerCase() === 'sale' ? 'badge-sale' : (prod.badge.toLowerCase() === 'hot' ? 'badge-hot' : 'badge-new');
      badgeHtml = `<div class="product-badges"><span class="badge ${badgeClass}">${prod.badge}</span></div>`;
    }

    card.innerHTML = `
      <div class="product-img-wrap">
        <img src="${prod.image}" alt="${prod.name}" class="product-img" loading="lazy" />
        ${badgeHtml}
        <button class="overlay-wish" aria-label="Wishlist" data-id="${prod.id}">♡</button>
      </div>
      <div class="product-info">
        <span class="product-brand">${prod.brand}</span>
        <h3 class="product-name">${prod.name}</h3>
        <div class="product-rating">
          <span class="stars">${starsHtml}</span>
          <span class="rating-count">(New)</span>
        </div>
        <div class="product-pricing">
          ${pricingHtml}
        </div>
        <div class="product-actions">
          <button class="btn-buy buy-btn" data-id="${prod.id}" data-name="${prod.name}" data-price="${prod.price}">Buy Now</button>
          <button class="btn-cart add-cart-btn" data-id="${prod.id}" data-name="${prod.name}" data-price="${prod.price}">Add to Cart</button>
        </div>
      </div>
    `;
    
    // Insert at beginning of grid
    productsGrid.insertBefore(card, productsGrid.firstChild);
    
    // Bind Add to Cart
    card.querySelector('.add-cart-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(prod.id, prod.name, prod.price);
      const btn = e.target;
      btn.textContent = '✓ Added!';
      btn.style.background = 'linear-gradient(135deg, #4ade80, #16a34a)';
      setTimeout(() => {
        btn.textContent = 'Add to Cart';
        btn.style.background = '';
      }, 1500);
    });

    // Bind Wishlist
    card.querySelector('.overlay-wish').addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target;
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
  
  // Initial display limit call
  applyProductDisplayLimit();
}
loadOwnerProducts();
applyProductDisplayLimit();

// ========== PRODUCT FILTER TABS ==========
const filterTabs = document.querySelectorAll('.filter-tab');
const productCards = document.querySelectorAll('.product-card');

filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    filterTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const filter = tab.getAttribute('data-filter');
    productCards.forEach(card => {
      if (filter === 'all' || card.getAttribute('data-category') === filter) {
        card.style.display = '';
        card.style.animation = 'fadeInUp 0.4s ease forwards';
      } else {
        card.style.display = 'none';
      }
    });
    applyProductDisplayLimit();
  });
});

// Add fadeInUp animation for filter
const style = document.createElement('style');
style.textContent = `@keyframes fadeInUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }`;
document.head.appendChild(style);

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
      cartItemsEl.insertBefore(el, cartFooterEl.previousSibling);
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

// Checkout Modal Elements
const checkoutModal = document.getElementById('checkout-modal');
const checkoutClose = document.getElementById('checkout-close');
const checkoutForm = document.getElementById('checkout-form');
const summaryItemsEl = document.getElementById('summary-items-count');
const summaryTotalEl = document.getElementById('summary-total-amount');

// Payment screenshot and button elements
const custPaySelect = document.getElementById('cust-pay');
const onlinePayDetails = document.getElementById('online-pay-details');
const custScreenshotInput = document.getElementById('cust-screenshot');
const checkoutSubmitBtn = document.getElementById('checkout-submit-btn');

let activeCheckoutItem = null; // Stored if buying directly (Buy Now)

function openCheckout(directItem = null) {
  if (directItem) {
    activeCheckoutItem = directItem;
  } else {
    activeCheckoutItem = null;
    if (cart.length === 0) {
      showToast('🛒 Your cart is empty!');
      return;
    }
  }
  
  closeCart();
  checkoutModal.classList.add('active');
  
  // Update summary totals
  if (activeCheckoutItem) {
    summaryItemsEl.textContent = '1';
    summaryTotalEl.textContent = `₹${activeCheckoutItem.price.toLocaleString('en-IN')}`;
  } else {
    const count = cart.reduce((acc, item) => acc + item.qty, 0);
    const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    summaryItemsEl.textContent = count;
    summaryTotalEl.textContent = `₹${total.toLocaleString('en-IN')}`;
  }

  // Reset payment method details on open
  if (custPaySelect) {
    custPaySelect.value = 'cod';
    if (onlinePayDetails) onlinePayDetails.style.display = 'none';
    if (checkoutSubmitBtn) checkoutSubmitBtn.style.display = 'block';
  }
}

function closeCheckout() {
  checkoutModal.classList.remove('active');
  activeCheckoutItem = null;
}

// Bind checkout buttons
document.getElementById('checkout-btn').addEventListener('click', () => openCheckout());
if (checkoutClose) {
  checkoutClose.addEventListener('click', closeCheckout);
  checkoutModal.addEventListener('click', (e) => {
    if (e.target === checkoutModal) closeCheckout();
  });
}

// Payment method change listener
if (custPaySelect) {
  custPaySelect.addEventListener('change', () => {
    if (custPaySelect.value === 'online') {
      if (onlinePayDetails) onlinePayDetails.style.display = 'block';
      // Hide submit button until a screenshot is uploaded
      if (checkoutSubmitBtn) {
        checkoutSubmitBtn.style.display = (custScreenshotInput && custScreenshotInput.files.length > 0) ? 'block' : 'none';
      }
    } else {
      if (onlinePayDetails) onlinePayDetails.style.display = 'none';
      if (checkoutSubmitBtn) checkoutSubmitBtn.style.display = 'block';
    }
  });
}

// Screenshot upload listener
if (custScreenshotInput) {
  custScreenshotInput.addEventListener('change', () => {
    if (custScreenshotInput.files && custScreenshotInput.files.length > 0) {
      if (checkoutSubmitBtn) checkoutSubmitBtn.style.display = 'block';
      showToast('📸 Screenshot uploaded successfully!');
    } else {
      if (custPaySelect && custPaySelect.value === 'online') {
        if (checkoutSubmitBtn) checkoutSubmitBtn.style.display = 'none';
      }
    }
  });
}

// Bind Buy Now clicks (using delegation)
document.addEventListener('click', (e) => {
  const buyBtn = e.target.closest('.buy-btn');
  if (buyBtn) {
    e.stopPropagation();
    const id = buyBtn.getAttribute('data-id');
    const name = buyBtn.getAttribute('data-name');
    const price = parseInt(buyBtn.getAttribute('data-price'), 10);
    openCheckout({ id, name, price, qty: 1 });
  }
});

if (checkoutForm) {
  checkoutForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('cust-name').value.trim();
    const email = document.getElementById('cust-email').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const payment = document.getElementById('cust-pay').value;
    const address = document.getElementById('cust-address').value.trim();
    
    const screenshotFile = custScreenshotInput && custScreenshotInput.files[0];
    
    const saveOrder = async (screenshotDataUrl = null) => {
      let itemsList = [];
      let total = 0;
      
      if (activeCheckoutItem) {
        itemsList = [{ product_id: activeCheckoutItem.id, name: activeCheckoutItem.name, price: activeCheckoutItem.price, quantity: 1 }];
        total = activeCheckoutItem.price;
      } else {
        itemsList = cart.map(item => ({ product_id: item.id, name: item.name, price: item.price, quantity: item.qty }));
        total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
      }
      
      const payload = {
        customer: {
          name,
          email,
          phone,
          address,
          payment: payment === 'online' ? 'ONLINE' : payment.toUpperCase(),
          screenshot: screenshotDataUrl
        },
        items: itemsList,
        payment: { status: payment === 'online' ? 'SUCCESS' : 'PENDING' }
      };

      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        const orderId = data.orderNumber || ('MPS-' + Date.now());

        // Also dual-save to localStorage for fallback compatibility
        const existingOrders = JSON.parse(localStorage.getItem('moto_orders') || '[]');
        existingOrders.unshift({
          id: orderId,
          date: new Date().toLocaleString('en-IN'),
          customer: { name, email, phone, payment: payment === 'online' ? 'ONLINE (PAID)' : payment.toUpperCase(), address, screenshot: screenshotDataUrl },
          items: itemsList.map(i => ({ name: i.name, price: i.price, qty: i.quantity })),
          total: total,
          status: 'Placed'
        });
        localStorage.setItem('moto_orders', JSON.stringify(existingOrders));

        if (!activeCheckoutItem) {
          cart = [];
          updateCartUI();
        }

        closeCheckout();
        checkoutForm.reset();

        showToast(`🏁 Order Placed Successfully! Order #${orderId}`);
      } catch (err) {
        console.error('Order creation error:', err);
        showToast(`❌ Error placing order: ${err.message}`);
      }
    };
    
    if (payment === 'online' && screenshotFile) {
      const reader = new FileReader();
      reader.onload = function(event) {
        saveOrder(event.target.result);
      };
      reader.readAsDataURL(screenshotFile);
    } else {
      saveOrder(null);
    }
  });
}

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
