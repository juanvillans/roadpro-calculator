(function () {
  "use strict";

  var $ = function (id) {
    return document.getElementById(id);
  };

  var el = {
    when: $("when"),
    nowBtn: $("nowBtn"),
    rateMode: $("rateMode"),
    holiday: $("holiday"),
    rateBadge: $("rateBadge"),
    drive: $("drive"),
    service: $("service"),
    calloutPrice: $("calloutPrice"),
    drivePrice: $("drivePrice"),
    servicePrice: $("servicePrice"),
    parts: $("parts"),
    addPart: $("addPart"),
    invStatus: $("invStatus"),
    feeOn: $("feeOn"),
    feeRate: $("feeRate"),
    taxOn: $("taxOn"),
    taxRate: $("taxRate"),
    laborOut: $("laborOut"),
    partsOut: $("partsOut"),
    subtotalOut: $("subtotalOut"),
    feeOut: $("feeOut"),
    taxOut: $("taxOut"),
    total: $("total"),
    addHour: $("addHour"),
    upfront: $("upfront"),
    eta: $("eta"),
    quote: $("quote"),
    copy: $("copy"),
    authCompany: $("authCompany"),
    authInvoice: $("authInvoice"),
    authService: $("authService"),
    authDate: $("authDate"),
    authMsg: $("authMsg"),
    copyAuth: $("copyAuth")
  };

  var REG_RATE = 135;
  var AFT_RATE = 165;
  var lastPartCount = 0;

  /* ---------- helpers ---------- */

  function num(value) {
    var n = parseFloat(value);
    return isNaN(n) ? 0 : n;
  }

  function money(n) {
    var neg = n < 0;
    var parts = Math.abs(n).toFixed(2).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-$" : "$") + parts.join(".");
  }

  function moneyInt(n) {
    var neg = n < 0;
    var s = Math.round(Math.abs(n)).toString();
    s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-$" : "$") + s;
  }

  function fmtHours(h) {
    return Number.isInteger(h) ? String(h) : String(h);
  }

  function pad(n) {
    return String(n).length < 2 ? "0" + n : String(n);
  }

  function toLocalInput(d) {
    return (
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes())
    );
  }

  /* value from <input type="date"> (YYYY-MM-DD) -> MM/DD/YYYY */
  function usDate(value) {
    var m = (value || "").match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[2] + "/" + m[3] + "/" + m[1] : "";
  }

  /* The picked value is read as local time (naive components). */
  function pickedParts() {
    var m = (el.when.value || "").match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (m) {
      return {
        day: new Date(+m[1], +m[2] - 1, +m[3]).getDay(),
        hour: +m[4],
        minute: +m[5]
      };
    }
    var d = new Date();
    return { day: d.getDay(), hour: d.getHours(), minute: d.getMinutes() };
  }

  /* Rate: $135 Mon-Fri 9:00-18:00, otherwise $165 */
  function rateForParts(parts) {
    var t = parts.hour + parts.minute / 60;
    var weekend = parts.day === 0 || parts.day === 6;
    var business = !weekend && t >= 9 && t < 18;
    return business ? REG_RATE : AFT_RATE;
  }

  function getRate() {
    if (el.rateMode.value === "135") return REG_RATE;
    if (el.rateMode.value === "165") return AFT_RATE;
    if (el.holiday.checked) return AFT_RATE;
    return rateForParts(pickedParts());
  }

  function rateLabel(rate) {
    return rate === REG_RATE
      ? "Tarifa aplicada: $135/h (L-V 9am-6pm)"
      : "Tarifa aplicada: $165/h (noche/finde/feriado)";
  }

  function normalize(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, "");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function parseWhen() {
    var m = (el.when.value || "").match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return new Date();
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  }

  function rateAtDate(d) {
    var day = d.getDay();
    var t = d.getHours() + d.getMinutes() / 60;
    var weekend = day === 0 || day === 6;
    return !weekend && t >= 9 && t < 18 ? REG_RATE : AFT_RATE;
  }

  /*
   * Single rate for the whole job, chosen by the service time:
   * $135 Mon-Fri 9:00-18:00, otherwise $165. No split.
   * Call out is a fixed fee (one hour's rate) and does not consume time.
   */
  function computeLabor() {
    var manual =
      el.rateMode.value === "135" ||
      el.rateMode.value === "165" ||
      el.holiday.checked;
    var fixed =
      el.rateMode.value === "135" ? REG_RATE :
      el.rateMode.value === "165" ? AFT_RATE :
      el.holiday.checked ? AFT_RATE : null;

    var rate = manual ? fixed : rateAtDate(parseWhen());

    var driveH = num(el.drive.value);
    var serviceH = num(el.service.value);

    /* Upfront = call out + drive time beyond the first hour. */
    var upfrontDrive = Math.max(0, driveH - 1) * rate;

    return {
      rate: rate,
      manual: manual,
      upfrontDrive: upfrontDrive,
      cost: {
        callout: rate,
        drive: driveH * rate,
        service: serviceH * rate
      }
    };
  }

  /* ---------- inventory (live from Google Sheets) ---------- */

  var INVENTORY_URL =
    "https://docs.google.com/spreadsheets/d/" +
    "1s-gCFjMKWpOlRzAJwmXl2vp6xjJWNqzrKwTEvvhOVxk/export?format=csv&gid=0";
  var INVENTORY_KEY = "roadpro_inventory_v1";
  var INVENTORY_LIMIT = 10;
  var inventory = [];

  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch !== "\r") {
        field += ch;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function toNumber(s) {
    var cleaned = String(s == null ? "" : s).replace(/[^0-9.\-]/g, "");
    return cleaned === "" || cleaned === "-" ? NaN : parseFloat(cleaned);
  }

  function buildInventory(rows) {
    var items = [];
    var section = "";
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i];
      var col0 = (c[0] || "").trim();
      var nombre = (c[1] || "").trim();
      if (col0 && !nombre) { section = col0; continue; } /* section row */
      if (!nombre) continue;
      var precio = toNumber(c[8]); /* Precio Cliente */
      if (isNaN(precio)) continue;
      items.push({
        seccion: section,
        nombre: nombre,
        marca: (c[4] || "").trim(),
        tipo: (c[5] || "").trim(),
        nota: (c[6] || "").trim(),
        estado: (c[10] || "").trim(),
        precio: precio
      });
    }
    return items;
  }

  function setInventoryStatus(state, count) {
    if (!el.invStatus) return;
    if (state === "ok") {
      el.invStatus.textContent = "Inventario: " + count + " repuestos disponibles";
      el.invStatus.className = "hint inv-status inv-status--ok";
    } else if (state === "local") {
      el.invStatus.textContent = "Inventario: " + count + " repuestos (copia local)";
      el.invStatus.className = "hint inv-status inv-status--ok";
    } else if (state === "off") {
      el.invStatus.textContent = "Inventario no disponible — entrada manual";
      el.invStatus.className = "hint inv-status inv-status--off";
    } else {
      el.invStatus.textContent = "Cargando inventario…";
      el.invStatus.className = "hint inv-status";
    }
  }

  function loadInventory() {
    setInventoryStatus("loading");

    var cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(INVENTORY_KEY) || "null");
    } catch (e) {}

    if (cached && cached.items && cached.items.length) {
      inventory = cached.items;
      setInventoryStatus("ok", inventory.length);
    } else if (window.ROADPRO_INVENTORY_CSV) {
      var seeded = buildInventory(parseCSV(window.ROADPRO_INVENTORY_CSV));
      if (seeded.length) {
        inventory = seeded;
        setInventoryStatus("local", inventory.length);
      }
    }

    fetch(INVENTORY_URL)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function (text) {
        var items = buildInventory(parseCSV(text));
        if (!items.length) throw new Error("empty");
        inventory = items;
        setInventoryStatus("ok", inventory.length);
        try {
          localStorage.setItem(
            INVENTORY_KEY,
            JSON.stringify({ at: Date.now(), items: items })
          );
        } catch (e) {}
      })
      .catch(function () {
        if (!inventory.length) setInventoryStatus("off");
      });
  }

  function searchInventory(query) {
    var q = normalize(query);
    if (!q) return [];
    var nameHits = [];
    var otherHits = [];
    for (var i = 0; i < inventory.length; i++) {
      var it = inventory[i];
      var n = normalize(it.nombre);
      var hay = n + normalize(it.marca + it.tipo + it.nota + it.seccion + it.estado);
      if (n.indexOf(q) !== -1) nameHits.push(it);
      else if (hay.indexOf(q) !== -1) otherHits.push(it);
    }
    return nameHits.concat(otherHits).slice(0, INVENTORY_LIMIT);
  }

  /* ---------- parts ---------- */

  function attachCombobox(wrap, descInput, priceInput) {
    var box = wrap.querySelector(".suggest");
    var matches = [];
    var active = -1;

    function close() {
      box.hidden = true;
      box.innerHTML = "";
      matches = [];
      active = -1;
    }

    function highlight() {
      var items = box.querySelectorAll(".suggest__item");
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle("is-active", i === active);
      }
      if (active >= 0 && items[active]) items[active].scrollIntoView({ block: "nearest" });
    }

    function choose(idx) {
      var it = matches[idx];
      if (!it) return;
      descInput.value = [it.nombre, it.tipo, it.marca].filter(Boolean).join(" ");
      priceInput.value = it.precio.toFixed(2);
      close();
      update();
      descInput.focus();
    }

    function open() {
      if (!inventory.length) { close(); return; }
      matches = searchInventory(descInput.value);
      active = -1;
      if (!matches.length) { close(); return; }
      box.innerHTML = matches.map(function (it, idx) {
        var meta = [it.tipo, it.marca, it.estado].filter(Boolean).join(" · ");
        return (
          '<button type="button" class="suggest__item" data-idx="' + idx + '">' +
          '<span class="suggest__name">' + escapeHtml(it.nombre) + "</span>" +
          '<span class="suggest__meta">' + escapeHtml(meta) + "</span>" +
          '<span class="suggest__price">' + money(it.precio) + "</span>" +
          "</button>"
        );
      }).join("");
      box.hidden = false;
    }

    descInput.addEventListener("focus", open);
    descInput.addEventListener("input", open);
    descInput.addEventListener("keydown", function (e) {
      if (box.hidden) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        active = active + 1 >= matches.length ? 0 : active + 1;
        highlight();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        active = active - 1 < 0 ? matches.length - 1 : active - 1;
        highlight();
      } else if (e.key === "Enter" && matches.length) {
        e.preventDefault();
        choose(active >= 0 ? active : 0);
      } else if (e.key === "Escape") {
        close();
      }
    });
    box.addEventListener("mousedown", function (e) {
      var item = e.target.closest ? e.target.closest(".suggest__item") : null;
      if (item) {
        e.preventDefault();
        choose(parseInt(item.getAttribute("data-idx"), 10));
      }
    });
    descInput.addEventListener("blur", function () {
      setTimeout(close, 150);
    });
  }

  function addPartRow(desc, price) {
    var row = document.createElement("div");
    row.className = "part-row";
    row.innerHTML =
      '<div class="part-combo">' +
      '<input type="text" class="part-desc" name="part-desc" autocomplete="off" ' +
      'placeholder="Busca un repuesto o escribe…" />' +
      '<div class="suggest" hidden></div>' +
      "</div>" +
      '<input type="number" class="part-price" name="part-price" min="0" step="0.01" placeholder="0.00" />' +
      '<button type="button" class="del" title="Eliminar">&times;</button>';

    var combo = row.querySelector(".part-combo");
    var descInput = row.querySelector(".part-desc");
    var priceInput = row.querySelector(".part-price");

    descInput.value = desc || "";
    priceInput.value = price || "";
    descInput.addEventListener("input", update);
    priceInput.addEventListener("input", update);
    row.querySelector(".del").addEventListener("click", function () {
      row.remove();
      update();
    });
    attachCombobox(combo, descInput, priceInput);

    el.parts.appendChild(row);
    descInput.focus();
  }


  function readParts() {
    var rows = el.parts.querySelectorAll(".part-row");
    var total = 0;
    var descs = [];
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i].querySelector(".part-desc").value.trim();
      var p = num(rows[i].querySelector(".part-price").value);
      total += p;
      if (d) descs.push(d);
    }
    return { count: rows.length, total: total, descs: descs };
  }

  /* ---------- main ---------- */

  function update() {
    var startRate = getRate();
    el.rateBadge.textContent = rateLabel(startRate);

    var driveH = num(el.drive.value);
    var serviceH = num(el.service.value);

    var laborInfo = computeLabor();
    var calloutCost = laborInfo.cost.callout;
    var driveCost = laborInfo.cost.drive;
    var serviceCost = laborInfo.cost.service;

    el.calloutPrice.textContent = money(calloutCost);
    el.drivePrice.textContent = money(driveCost);
    el.servicePrice.textContent = money(serviceCost);

    var labor = calloutCost + driveCost + serviceCost;

    var rate = laborInfo.rate;

    var parts = readParts();

    if (parts.count > 0 && lastPartCount === 0) el.taxOn.checked = true;
    if (parts.count === 0 && lastPartCount > 0) el.taxOn.checked = false;
    lastPartCount = parts.count;

    var subtotal = labor + parts.total;
    var feeRate = num(el.feeRate.value);
    var taxRate = num(el.taxRate.value);
    var fee = el.feeOn.checked ? (subtotal * feeRate) / 100 : 0;
    var tax = el.taxOn.checked ? ((subtotal + fee) * taxRate) / 100 : 0;
    var total = subtotal + fee + tax;
    var upfront = calloutCost + laborInfo.upfrontDrive;

    el.laborOut.textContent = money(labor);
    el.partsOut.textContent = money(parts.total);
    el.subtotalOut.textContent = money(subtotal);
    el.feeOut.textContent = money(fee);
    el.taxOut.textContent = money(tax);
    el.total.textContent = moneyInt(total);
    el.addHour.textContent = money(rate) + "/h";
    el.upfront.textContent = money(upfront);

    var partClause = parts.descs.length
      ? ", parts (" + parts.descs.join(", ") + ")"
      : "";
    var hourWord = serviceH === 1 ? "hour" : "hours";
    var eta = el.eta.value.trim() || "____";

    el.quote.value =
      moneyInt(total) + ", including call-out/drive time" +
      partClause + " and the " + fmtHours(serviceH) + " " + hourWord + " of service time.\n" +
      "* Each additional hour: " + money(rate) + "\n" +
      "* Upfront payment required: " + money(upfront) + "\n" +
      "Estimated arrival time (ETA): " + eta + "\n\n" +
      "If you want to proceed please provide:\n" +
      "1. Your name\n" +
      "2. Company name for the invoice\n" +
      "3. Make/year/color of the truck\n" +
      "4. Unit/Truck number\n" +
      "5. Name and phone number of the person responsible for payment\n" +
      "6. Payment method";

    var company = el.authCompany.value.trim() || "____";
    var invoice = el.authInvoice.value.trim() || "____";
    var serviceName = el.authService.value.trim() || "____";
    var dateStr = usDate(el.authDate.value);

    el.authMsg.value =
      "Please confirm that you are the authorized person of the company: " +
      company + " And you approve the amount of " + moneyInt(total) +
      " for the service provided by the Company RoadPro Assistance. Invoice #" +
      invoice + ".  Date " + dateStr + "\n\n" +
      "Service: " + serviceName + "  Please reply YES or NO to confirm";
  }

  /* ---------- events ---------- */

  var whenAuto = true;

  function setWhenNow() {
    el.when.value = toLocalInput(new Date());
  }

  setWhenNow();
  el.authDate.value = toLocalInput(new Date()).slice(0, 10);

  ["when", "rateMode", "holiday", "drive", "service",
   "feeOn", "feeRate", "taxOn", "taxRate", "eta",
   "authCompany", "authInvoice", "authService", "authDate"].forEach(function (key) {
    el[key].addEventListener("input", update);
    el[key].addEventListener("change", update);
  });

  /* Keep the service time on "now" until the user edits it manually. */
  el.when.addEventListener("input", function () { whenAuto = false; });
  el.when.addEventListener("change", function () { whenAuto = false; });

  el.nowBtn.addEventListener("click", function () {
    whenAuto = true;
    setWhenNow();
    update();
  });

  function syncNow() {
    if (whenAuto) {
      setWhenNow();
      update();
    }
  }

  setInterval(syncNow, 30000);
  window.addEventListener("focus", syncNow);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) syncNow();
  });

  el.addPart.addEventListener("click", function () {
    addPartRow("", "");
    update();
  });

  document.querySelectorAll(".quick button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = el[btn.getAttribute("data-target")];
      var delta = num(btn.getAttribute("data-delta"));
      var next = Math.max(0, num(target.value) + delta);
      target.value = next;
      update();
    });
  });

  function bindCopy(btn, textarea) {
    btn.addEventListener("click", function () {
      var text = textarea.value;
      var done = function () {
        var old = btn.textContent;
        btn.textContent = "¡Copiado!";
        setTimeout(function () {
          btn.textContent = old;
        }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          textarea.select();
          document.execCommand("copy");
          done();
        });
      } else {
        textarea.select();
        document.execCommand("copy");
        done();
      }
    });
  }

  bindCopy(el.copy, el.quote);
  bindCopy(el.copyAuth, el.authMsg);

  loadInventory();
  update();
})();
