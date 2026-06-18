/* Bundle Widget hydration — vanilla JS, no dependencies.
   Handles: tier selection + quantity sync, per-unit variant selectors,
   "Complete the bundle" cards, add-on upsells, Ajax add-to-cart. */
(function () {
  "use strict";

  function money(cents) {
    var fmt = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || "";
    return (cents / 100).toFixed(2) + (fmt ? " " + fmt : "");
  }

  function rootUrl() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
  }

  function findProductForm(widget) {
    var scope = widget.closest("section") || document;
    return (
      scope.querySelector('form[action*="/cart/add"]') ||
      document.querySelector('form[action*="/cart/add"]')
    );
  }

  function findQuantityInputs(widget, form) {
    var found = [];
    function add(el) {
      if (el && found.indexOf(el) === -1) found.push(el);
    }
    if (form) {
      form.querySelectorAll('input[name="quantity"]').forEach(add);
      if (form.id) {
        document
          .querySelectorAll('input[name="quantity"][form="' + form.id + '"]')
          .forEach(add);
      }
    }
    var scope = widget.closest("section") || document;
    scope.querySelectorAll('input[name="quantity"]').forEach(add);
    return found;
  }

  function setQuantity(widget, form, qty) {
    if (qty < 1) return; // bundle card: quantity handled at add time
    var inputs = findQuantityInputs(widget, form);
    if (inputs.length === 0 && form) {
      var hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "quantity";
      form.appendChild(hidden);
      inputs = [hidden];
    }
    inputs.forEach(function (input) {
      input.value = String(qty);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function selectedTier(widget) {
    var checked = widget.querySelector("[data-be-tier] input:checked");
    return checked ? checked.closest("[data-be-tier]") : null;
  }

  function checkedAddons(widget) {
    return Array.prototype.slice.call(
      widget.querySelectorAll("input[data-be-addon]:checked"),
    );
  }

  // Build the items[] payload for /cart/add.js, or null if the native
  // form flow is fine (single variant, no add-ons, no bundle).
  function buildItems(widget, form) {
    var tier = selectedTier(widget);
    if (!tier) return null;
    var addons = checkedAddons(widget);
    var items = [];

    if (tier.hasAttribute("data-be-bundle")) {
      tier.querySelectorAll("[data-be-bundle-variant]").forEach(function (el) {
        var id = parseInt(el.value, 10);
        if (id) items.push({ id: id, quantity: 1 });
      });
    } else {
      var qty = parseInt(tier.dataset.qty, 10) || 1;
      var units = tier.querySelectorAll("[data-be-unit-variant]");
      if (units.length > 0) {
        var counts = {};
        units.forEach(function (sel) {
          counts[sel.value] = (counts[sel.value] || 0) + 1;
        });
        Object.keys(counts).forEach(function (vid) {
          items.push({ id: parseInt(vid, 10), quantity: counts[vid] });
        });
      } else if (addons.length > 0) {
        // No unit selectors but add-ons checked: include the main product.
        var idInput = form && (form.querySelector('[name="id"]') || null);
        var vid2 = idInput ? parseInt(idInput.value, 10) : NaN;
        if (!vid2) return null;
        items.push({ id: vid2, quantity: qty });
      } else {
        return null; // plain tier, no add-ons -> native flow handles it
      }
    }

    addons.forEach(function (cb) {
      var id = parseInt(cb.value, 10);
      if (id) items.push({ id: id, quantity: 1 });
    });
    return items.length ? items : null;
  }

  function themeDrawer() {
    return document.querySelector("cart-drawer"); // Dawn-family themes
  }

  function ajaxAdd(items, button) {
    if (button) button.disabled = true;
    var drawer = themeDrawer();
    var payload = { items: items };
    if (drawer && typeof drawer.renderContents === "function") {
      try {
        payload.sections = drawer
          .getSectionsToRender()
          .map(function (s) { return s.id; });
        payload.sections_url = window.location.pathname;
      } catch (e) { /* fall back to redirect below */ }
    }
    fetch(rootUrl() + "cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) {
            throw new Error(d.description || d.message || "Could not add to cart");
          }
          return d;
        });
      })
      .then(function (data) {
        if (button) button.disabled = false;
        document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
        if (drawer && typeof drawer.renderContents === "function" && data.sections) {
          drawer.renderContents(data); // open the theme's slide-out cart
        } else {
          window.location.href = rootUrl() + "cart";
        }
      })
      .catch(function (err) {
        if (button) button.disabled = false;
        alert(err.message || "Could not add to cart. Please try again.");
      });
  }

  function trackImpression(widget) {
    var offerId = widget.dataset.beOffer;
    if (!offerId || !navigator.sendBeacon) return;
    try {
      navigator.sendBeacon(
        "/apps/bundle-engine/events",
        JSON.stringify({ offerId: offerId }),
      );
    } catch (e) { /* analytics must never break the page */ }
  }

  function init(widget) {
    if (widget.dataset.beReady) return;
    widget.dataset.beReady = "1";
    trackImpression(widget);
    var tiers = widget.querySelectorAll("[data-be-tier]");
    if (!tiers.length) return;
    var totalEl = widget.querySelector("[data-be-total]");
    var form = findProductForm(widget);

    function select(tierEl) {
      tiers.forEach(function (t) {
        t.classList.toggle("be-selected", t === tierEl);
      });
      var qty = parseInt(tierEl.dataset.qty, 10) || 0;
      setQuantity(widget, form, qty);
      if (totalEl) {
        var total = parseInt(tierEl.dataset.total, 10);
        if (qty > 1 && !isNaN(total)) {
          totalEl.hidden = false;
          totalEl.textContent = "Total for " + qty + ": " + money(total);
        } else {
          totalEl.hidden = true;
        }
      }
    }

    tiers.forEach(function (tierEl) {
      var radio = tierEl.querySelector('input[type="radio"]');
      if (radio) {
        radio.addEventListener("change", function () {
          select(tierEl);
        });
        if (radio.checked) select(tierEl);
      }
    });

    if (!form) return;

    // Intercept the add-to-cart click in the CAPTURE phase at document level,
    // so we run before any theme cart JS. Only intercepts when needed
    // (bundle / per-unit variants / add-ons); otherwise native flow proceeds.
    var buttons = [];
    var inForm = form.querySelector('[type="submit"]');
    if (inForm) buttons.push(inForm);
    if (form.id) {
      document
        .querySelectorAll('button[form="' + form.id + '"], [type="submit"][form="' + form.id + '"]')
        .forEach(function (b) {
          if (buttons.indexOf(b) === -1) buttons.push(b);
        });
    }

    document.addEventListener(
      "click",
      function (e) {
        var hit = buttons.some(function (b) {
          return b === e.target || b.contains(e.target);
        });
        if (!hit) return;
        var items = buildItems(widget, form);
        if (!items) {
          // native flow — just make sure quantity is right
          var tier = selectedTier(widget);
          if (tier) setQuantity(widget, form, parseInt(tier.dataset.qty, 10) || 1);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        ajaxAdd(items, e.target.closest("button"));
      },
      true,
    );
  }

  function boot() {
    document.querySelectorAll("[data-be-widget]").forEach(init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  document.addEventListener("shopify:section:load", boot);
})();
