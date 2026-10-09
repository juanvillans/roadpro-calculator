(function () {
  "use strict";

  var $ = function (id) {
    return document.getElementById(id);
  };

  var el = {
    when: $("when"),
    rateMode: $("rateMode"),
    holiday: $("holiday"),
    rateBadge: $("rateBadge"),
    callout: $("callout"),
    drive: $("drive"),
    service: $("service"),
    calloutPrice: $("calloutPrice"),
    drivePrice: $("drivePrice"),
    servicePrice: $("servicePrice"),
    parts: $("parts"),
    addPart: $("addPart"),
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
    copy: $("copy")
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

  /* ---------- parts ---------- */

  function addPartRow(desc, price) {
    var row = document.createElement("div");
    row.className = "part-row";
    row.innerHTML =
      '<input type="text" class="part-desc" placeholder="Descripción (ej. caucho)" />' +
      '<input type="number" class="part-price" min="0" step="0.01" placeholder="0.00" />' +
      '<button type="button" class="del" title="Eliminar">&times;</button>';

    row.querySelector(".part-desc").value = desc || "";
    row.querySelector(".part-price").value = price || "";
    row.querySelector(".part-desc").addEventListener("input", update);
    row.querySelector(".part-price").addEventListener("input", update);
    row.querySelector(".del").addEventListener("click", function () {
      row.remove();
      update();
    });

    el.parts.appendChild(row);
    var input = row.querySelector(".part-desc");
    if (input) input.focus();
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
    var rate = getRate();
    el.rateBadge.textContent = rateLabel(rate);

    var calloutH = num(el.callout.value);
    var driveH = num(el.drive.value);
    var serviceH = num(el.service.value);

    el.calloutPrice.textContent = money(calloutH * rate);
    el.drivePrice.textContent = money(driveH * rate);
    el.servicePrice.textContent = money(serviceH * rate);

    var labor = (calloutH + driveH + serviceH) * rate;

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
    var upfront = (calloutH + driveH) * rate;

    el.laborOut.textContent = money(labor);
    el.partsOut.textContent = money(parts.total);
    el.subtotalOut.textContent = money(subtotal);
    el.feeOut.textContent = money(fee);
    el.taxOut.textContent = money(tax);
    el.total.textContent = money(total);
    el.addHour.textContent = money(rate) + "/h";
    el.upfront.textContent = money(upfront);

    var partClause = parts.descs.length
      ? ", parts (" + parts.descs.join(", ") + ")"
      : "";
    var hourWord = serviceH === 1 ? "hour" : "hours";
    var eta = el.eta.value.trim() || "____";

    el.quote.value =
      "First hour: " + money(total) + ", including call-out/drive time" +
      partClause + " and the " + fmtHours(serviceH) + " " + hourWord + " of labor.\n" +
      "* Each additional hour: " + money(rate) + "\n" +
      "* Upfront payment required: " + money(upfront) + "\n" +
      "Estimated arrival time (ETA): " + eta + "\n" +
      "If you want to proceed please provide:\n" +
      "1. Your name\n" +
      "2. Company name for the invoice\n" +
      "3. Make/year/color of the truck\n" +
      "4. Unit/Truck number\n" +
      "5. Name and phone number of the person responsible for payment\n" +
      "6. Payment method";
  }

  /* ---------- events ---------- */

  el.when.value = toLocalInput(new Date());

  ["when", "rateMode", "holiday", "callout", "drive", "service",
   "feeOn", "feeRate", "taxOn", "taxRate", "eta"].forEach(function (key) {
    el[key].addEventListener("input", update);
    el[key].addEventListener("change", update);
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

  el.copy.addEventListener("click", function () {
    var text = el.quote.value;
    var done = function () {
      var old = el.copy.textContent;
      el.copy.textContent = "¡Copiado!";
      setTimeout(function () {
        el.copy.textContent = old;
      }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        el.quote.select();
        document.execCommand("copy");
        done();
      });
    } else {
      el.quote.select();
      document.execCommand("copy");
      done();
    }
  });

  update();
})();
