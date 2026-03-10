(() => {
  "use strict";

  /* =========================================================
     Helpers
  ========================================================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const onReady = (fn) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  };

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* ignore */
      }
    },
  };

  const getQuery = () => new URLSearchParams(window.location.search);

  const isProductosPage = () => {
    // cubre /pages/productos.html y /productos.html y cualquier ruta que contenga "productos"
    return /productos/i.test(window.location.pathname);
  };

  const getHeaderOffset = () => {
    // intenta leer alto real del header sticky, si existe
    const header = $(".site-header");
    const h = header ? header.getBoundingClientRect().height : 0;
    return Math.max(0, Math.round(h));
  };

  const normalizeText = (s) => {
    const str = String(s || "").trim().toLowerCase();
    // remover tildes/diacríticos (compatible amplio)
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  const tokenize = (s) => {
    const n = normalizeText(s);
    if (!n) return [];
    return n.split(/[\s,.;:/|\\+_()-]+/g).filter(Boolean);
  };

  /* =========================================================
     1) Leads counter (badge carrito)
  ========================================================= */
  const LEADS_KEY = "innovasmart_leads_count";

  function setCartCount(count) {
    const val = String(clamp(Number(count) || 0, 0, 99));
    $$(".cart-btn[data-count]").forEach((btn) => btn.setAttribute("data-count", val));
  }

  function incLeadsCount() {
    const current = Number(storage.get(LEADS_KEY, 0)) || 0;
    const next = clamp(current + 1, 0, 99);
    storage.set(LEADS_KEY, next);
    setCartCount(next);
  }

  function isWhatsAppLink(a) {
    if (!a) return false;
    const href = a.getAttribute("href") || "";
    return href.includes("wa.me/");
  }

  function initLeadCounter() {
    setCartCount(Number(storage.get(LEADS_KEY, 0)) || 0);

    document.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (!a || !isWhatsAppLink(a)) return;

      // No contar el “carrito” ni el flotante
      if (a.classList.contains("cart-btn")) return;
      if (a.classList.contains("wa-float")) return;

      // ✅ Prioridad: si el link define data-lead, lo contamos sí o sí
      if (a.hasAttribute("data-lead")) {
        incLeadsCount();
        return;
      }

      // Fallback: contar solo CTAs reales
      const isCTA =
        a.classList.contains("btn") ||
        a.classList.contains("btn--whatsapp") ||
        a.classList.contains("btn--ghost") ||
        a.classList.contains("btn--primary");

      if (isCTA) incLeadsCount();
    });
  }

  /* =========================================================
     2) Drawer (menú lateral)
  ========================================================= */
  function initDrawer() {
    const toggle = $("#nav-toggle");
    if (!toggle) return;

    // Teclado en labels (Enter/Espacio)
    const labels = $$('label[for="nav-toggle"]');
    labels.forEach((lab) => {
      if (!lab.hasAttribute("tabindex")) lab.setAttribute("tabindex", "0");
      lab.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle.checked = !toggle.checked;
        }
      });
    });

    // Cerrar drawer al click en un link dentro del drawer
    const drawer = $(".drawer");
    if (drawer) {
      drawer.addEventListener("click", (e) => {
        const link = e.target.closest("a");
        if (!link) return;
        toggle.checked = false;
      });
    }

    // ESC cierra
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (toggle.checked) toggle.checked = false;
    });
  }

  /* =========================================================
     3) Tips Carousel (Bootstrap)
  ========================================================= */
  function initTipsCarousel() {
    const el = $("#tipsCarousel");
    if (!el) return;

    const hasBootstrap = typeof window.bootstrap !== "undefined" && window.bootstrap.Carousel;
    if (!hasBootstrap) return;

    const instance = window.bootstrap.Carousel.getOrCreateInstance(el, {
      interval: false,
      ride: false,
      touch: true,
      pause: true,
      wrap: true,
    });

    const resetIframeInSlide = (slideEl) => {
      const iframe = $("iframe", slideEl);
      if (!iframe) return;
      const src = iframe.getAttribute("src");
      if (!src) return;
      iframe.setAttribute("src", src);
    };

    el.addEventListener("slid.bs.carousel", (ev) => {
      const items = $$(".carousel-item", el);
      const from = typeof ev.from === "number" ? ev.from : null;
      if (from == null) return;
      const prev = items[from];
      if (prev) resetIframeInSlide(prev);
    });

    return instance;
  }

  /* =========================================================
     4) Search routing + prefill
  ========================================================= */
  function initSearchRouting() {
    const forms = $$("form[data-site-search], form.search");
    if (forms.length === 0) return;

    forms.forEach((form) => {
      const action = form.getAttribute("action") || "";
      const needsFix = !action || action === "#";

      if (needsFix) {
        const inPages = window.location.pathname.includes("/pages/");
        form.setAttribute("action", inPages ? "productos.html" : "pages/productos.html");
        form.setAttribute("method", "get");
      }

      const input = $('input[type="search"]', form);
      if (input && !input.getAttribute("name")) input.setAttribute("name", "q");
    });

    // Prefill si venís con ?q=
    const params = getQuery();
    const q = (params.get("q") || "").trim();
    if (!q) return;

    forms.forEach((form) => {
      const input = $('input[type="search"][name="q"]', form);
      if (input) input.value = q;
    });
  }

  /* =========================================================
     5) Filtros Productos (chips) + búsqueda (?q=)
     ✅ NUEVO: filtro por CATEGORÍA (importaciones / ml / servicios)
     ✅ Opción A: oculta secciones completas si quedan vacías
  ========================================================= */
  function initProductFilters() {
    if (!isProductosPage()) return;

    const bar = $("[data-filterbar]");
    const gridRoot = $("[data-product-grid]") || document; // fallback

    // Cards pueden estar en múltiples grids/sections; buscamos global
    const cards = $$("[data-product]");
    if (cards.length === 0) return;

    const pills = bar ? $$("[data-filter]", bar) : [];
    const results = bar ? $("[data-results]", bar) : null;
    const empty = $("[data-empty]");

    const groups = $$("[data-group]"); // secciones a ocultar (Opción A)

    const params = getQuery();
    const qRaw = (params.get("q") || "").trim();
    const qTokens = tokenize(qRaw);

    let category = "all";
    const active = pills.find((p) => p.classList.contains("is-active"));
    if (active && active.dataset.filter) category = active.dataset.filter;

    const haystack = (card) => {
      const title = card.dataset.title || "";
      const tags = card.dataset.tags || "";
      const h3 = $(".card__title", card);
      const h3text = (h3?.textContent || "").trim();
      return normalizeText(`${title} ${tags} ${h3text}`);
    };

    const matches = (card) => {
      const cardCat = card.dataset.category || "uncategorized";

      if (category !== "all" && cardCat !== category) return false;

      if (qTokens.length) {
        const hs = haystack(card);
        // Todas las palabras deben estar
        for (const t of qTokens) {
          if (!hs.includes(t)) return false;
        }
      }

      return true;
    };

    const scrollToEl = (el) => {
      const headerH = getHeaderOffset();
      const y = el.getBoundingClientRect().top + window.scrollY - headerH - 14;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    };

    const updateGroupsVisibility = () => {
      if (!groups.length) return;

      groups.forEach((group) => {
        const visibleInGroup = $$("[data-product]", group).some((c) => !c.hidden);
        group.hidden = !visibleInGroup;
      });
    };

    const apply = (opts = { scroll: true }) => {
      let shown = 0;
      let firstMatch = null;

      cards.forEach((card) => {
        const ok = matches(card);
        card.hidden = !ok;

        // highlight solo si hay búsqueda
        card.classList.toggle("is-highlight", qTokens.length && ok);

        if (ok) {
          shown++;
          if (!firstMatch) firstMatch = card;
        }
      });

      updateGroupsVisibility();

      if (results) results.textContent = `${shown} de ${cards.length} resultados`;
      if (empty) empty.hidden = shown !== 0;

      // Scroll al primer match si venís por querystring (y no hay hash)
      if (opts.scroll && qTokens.length && firstMatch && !window.location.hash) {
        requestAnimationFrame(() => scrollToEl(firstMatch));
      }
    };

    // Click filtros
    pills.forEach((btn) => {
      btn.addEventListener("click", () => {
        pills.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");

        category = btn.dataset.filter || "all";
        apply({ scroll: false });
      });
    });

    apply({ scroll: true });
  }

  /* =========================================================
     6) WhatsApp builder (contacto)
  ========================================================= */
  function initWhatsAppBuilder() {
    const form = $("[data-wa-form]");
    const link = $("[data-wa-link]");
    if (!form || !link) return;

    const href = link.getAttribute("href") || "";
    const m = href.match(/wa\.me\/(\d+)/);
    const number = m ? m[1] : null;
    if (!number) return;

    const build = () => {
      const fd = new FormData(form);
      const etapa = String(fd.get("etapa") || "").trim();
      const consulta = String(fd.get("consulta") || "").trim();

      let msg = "Hola Innovasmart, quiero hacer una consulta.";
      if (etapa) msg += ` Mi etapa es: ${etapa}.`;
      if (consulta) msg += ` Consulta: ${consulta}.`;

      link.setAttribute("href", `https://wa.me/${number}?text=${encodeURIComponent(msg)}`);
    };

    form.addEventListener("input", build);
    form.addEventListener("change", build);
    build();
  }

  /* =========================================================
     7) Copy email (contacto)
  ========================================================= */
  function initCopyEmail() {
    const email = $("[data-copy-email]");
    if (!email) return;

    const toast = $("[data-copy-toast]");

    email.addEventListener("click", async (e) => {
      const text = (email.textContent || "").trim();
      if (!text) return;

      e.preventDefault();

      try {
        await navigator.clipboard.writeText(text);
        if (toast) {
          toast.hidden = false;
          window.setTimeout(() => (toast.hidden = true), 1200);
        }
      } catch {
        const r = document.createRange();
        r.selectNodeContents(email);
        const sel = window.getSelection();
        if (!sel) return;
        sel.removeAllRanges();
        sel.addRange(r);
      }
    });
  }

  /* =========================================================
     8) Hash modals (:target)
  ========================================================= */
  function initHashModals() {
    const isModalHash = () => window.location.hash.startsWith("#modal-");

    const apply = () => {
      document.body.classList.toggle("is-modal-open", isModalHash());

      if (isModalHash()) {
        const modal = $(window.location.hash);
        const close = modal ? $(".modal__close", modal) : null;
        if (close) close.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!isModalHash()) return;

      const back = $("#productos") ? "#productos" : "";
      window.location.hash = back;
    });

    window.addEventListener("hashchange", apply);
    apply();
  }

  /* =========================================================
     Boot
  ========================================================= */
  onReady(() => {
    initLeadCounter();
    initDrawer();
    initTipsCarousel();
    initSearchRouting();
    initProductFilters(); // ✅ ya filtra por categorías + oculta secciones vacías
    initWhatsAppBuilder();
    initCopyEmail();
    initHashModals();
  });
})();