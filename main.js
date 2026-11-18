(() => {
  'use strict';

  // ── Copy Functionality (Invoker Commands & Live Region) ──
const copyTimers = new WeakMap();
let lastCopyMessage = '';

function reportCopyStatus(button, ok) {
  const wrap = button.closest('.copy-wrap');
  const tip = wrap ? wrap.querySelector('.tip') : button.nextElementSibling;
  clearTimeout(copyTimers.get(button));
  button.removeAttribute('data-copied');
  button.removeAttribute('data-failed');
  let message = ok ? 'Copied' : 'Copy failed';
  if (message === lastCopyMessage) message += '\u00A0';
  lastCopyMessage = message;

  if (tip) tip.textContent = '';
  void button.offsetWidth; // restart CSS animation
  button.setAttribute(ok ? 'data-copied' : 'data-failed', '');
  if (tip) {
    requestAnimationFrame(() => (tip.textContent = message));
  }
  copyTimers.set(button, setTimeout(() => {
    button.removeAttribute('data-copied');
    button.removeAttribute('data-failed');
    if (tip) tip.textContent = '';
  }, 2000));
}

async function copyText(button, target) {
  if (!target) return;
  let resolved = target;
  if (target.classList && target.classList.contains('code-window')) {
    const activePanel = target.querySelector('.tab-panel:not([hidden]), .tab-panel.active') || target;
    resolved = activePanel.querySelector('code, pre') || activePanel;
  }
  const text = resolved.matches('input, textarea') ? resolved.value : resolved.innerText.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    reportCopyStatus(button, true);
  } catch (err) {
    console.error('Failed to copy', err);
    reportCopyStatus(button, false);
  }
}

// Declarative Invoker Commands: command event on document (capture phase)
document.addEventListener('command', (event) => {
  if (event.command && event.command.startsWith('--copy')) {
    copyText(event.source, event.target);
  }
}, true);

// Fallback for browsers without native CommandEvent support
if (!('CommandEvent' in window)) {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[command^="--copy"]');
    if (!button) return;
    const targetId = button.getAttribute('commandfor');
    const target = document.getElementById(targetId);
    if (target) copyText(button, target);
  });
}

// ── Accessible Code Tabs ──
document.querySelectorAll('.code-tabs').forEach(tablist => {
  const tabs = Array.from(tablist.querySelectorAll('.tab-btn'));
  const windowEl = tablist.closest('.code-window');
  if (!windowEl) return;
  const panels = Array.from(windowEl.querySelectorAll('.tab-panel'));
  const copyBtn = windowEl.querySelector('.btn-copy-code');

  function selectTab(selectedTab, focus = false) {
    tabs.forEach(tab => {
      const isSelected = tab === selectedTab;
      tab.classList.toggle('active', isSelected);
      tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      tab.toggleAttribute('focusgroupstart', isSelected);
      tab.tabIndex = isSelected ? 0 : -1;
    });

    const targetId = selectedTab.getAttribute('data-tab');
    panels.forEach(panel => {
      const matches = panel.id === targetId;
      panel.classList.toggle('active', matches);
      if (matches) {
        panel.removeAttribute('hidden');
        panel.tabIndex = 0;
      } else {
        panel.setAttribute('hidden', 'until-found');
        panel.removeAttribute('tabindex');
      }
    });

    // Sync copy button target to active panel's code block
    if (copyBtn) {
      const activeCode = windowEl.querySelector('.tab-panel:not([hidden]) code');
      if (activeCode && activeCode.id) {
        copyBtn.setAttribute('commandfor', activeCode.id);
      }
    }

    if (focus) selectedTab.focus();
  }

  // Initialize roving tabindex
  tabs.forEach(tab => {
    const isSelected = tab.getAttribute('aria-selected') === 'true';
    tab.tabIndex = isSelected ? 0 : -1;
    tab.addEventListener('click', () => selectTab(tab, true));
  });

  // Arrow key roving navigation (selection follows focus)
  tablist.addEventListener('keydown', (event) => {
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex === -1) return;

    let targetIndex = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      targetIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = tabs.length - 1;
    }

    if (targetIndex !== null) {
      event.preventDefault();
      selectTab(tabs[targetIndex], true);
    }
  });

  // Reveal tab when find-in-page matches inside a hidden-until-found panel
  panels.forEach(panel => {
    panel.addEventListener('beforematch', () => {
      const matchingTab = tabs.find(t => t.getAttribute('data-tab') === panel.id);
      if (matchingTab) selectTab(matchingTab);
    });
  });
});

// ── Scrollspy Navigation ──
if (CSS.supports('scroll-target-group: auto')) {
  const syncAriaCurrent = () => {
    const currentLink = document.querySelector('.nav-links a:target-current');
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.setAttribute('aria-current', link === currentLink ? 'true' : 'false');
    });
  };
  syncAriaCurrent();
  document.addEventListener('scrollend', syncAriaCurrent);
} else {
  const navLinks = document.querySelectorAll('.nav-links a');
  const sections = document.querySelectorAll('main section[id], header[id]');
  const spyObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          const isActive = link.getAttribute('href') === `#${id}`;
          link.classList.toggle('target-current', isActive);
          link.setAttribute('aria-current', isActive ? 'true' : 'false');
        });
      }
    });
  }, { rootMargin: '-20% 0px -60% 0px', threshold: 0 });

  sections.forEach(s => spyObserver.observe(s));
}

// ── Navigation Reveal on Scroll (Fallback) ──
if (!CSS.supports('(animation-timeline: scroll()) and (animation-range: 0% 100%)')) {
  const heroEl = document.getElementById('top');
  const navEl = document.querySelector('nav.nav');

  if (heroEl && navEl && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.15) {
            navEl.classList.remove('nav-visible');
          } else {
            navEl.classList.add('nav-visible');
          }
        });
      },
      { threshold: [0, 0.15, 0.5] }
    );
    observer.observe(heroEl);
  } else if (navEl) {
    navEl.classList.add('nav-visible');
  }
}
})();
