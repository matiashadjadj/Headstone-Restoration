document.addEventListener('DOMContentLoaded', function () {
  var btn = document.querySelector('.hamburger');
  var overlay = document.querySelector('.menu-overlay');
  var navLinks = Array.from(document.querySelectorAll('.nav-item[href]'));

  function setExpanded(val) {
    if (btn) btn.setAttribute('aria-expanded', val ? 'true' : 'false');
  }

  function openMenu() {
    document.body.classList.add('sidebar-open');
    setExpanded(true);
  }

  function closeMenu() {
    document.body.classList.remove('sidebar-open');
    setExpanded(false);
  }

  if (btn) {
    btn.addEventListener('click', function () {
      var isOpen = document.body.classList.toggle('sidebar-open');
      setExpanded(isOpen);
    });

    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeMenu);
  }

  navLinks.forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  // Auto-set active nav item based on current file name
  var current = (location.pathname || '').split('/').pop() || 'Dashboard.html';
  navLinks.forEach(function (link) {
    try {
      var href = link.getAttribute('href') || '';
      var file = href.split('/').pop();
      if (file && file.toLowerCase() === current.toLowerCase()) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    } catch (err) {
      // ignore
    }
  });
});
