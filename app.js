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
    splitRow: $("splitRow"),
    splitValue: $("splitValue"),
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

  function fmtQty(h) {
    return String(Math.round(h * 100) / 100);
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
   * Walk the real timeline so labor hours that cross a shift change
   * (9am / 6pm) get the rate that applies at that moment.
   */
  function computeLabor() {
    var lines = [
      { key: "callout", hours: num(el.callout.value) },
      { key: "drive", hours: num(el.drive.value) },
      { key: "service", hours: num(el.service.value) }
    ];

    var manual =
      el.rateMode.value === "135" ||
      el.rateMode.value === "165" ||
      el.holiday.checked;
    var fixed =
      el.rateMode.value === "135" ? REG_RATE :
      el.rateMode.value === "165" ? AFT_RATE :
      el.holiday.checked ? AFT_RATE : null;

    var cost = { callout: 0, drive: 0, service: 0 };
    var segments = [];
    var d = parseWhen();
    var stepH = 1 / 60; /* 1 minute */

    lines.forEach(function (line) {
      var remaining = line.hours;
      while (remaining > 1e-9) {
        var dt = Math.min(stepH, remaining);
        var r = manual ? fixed : rateAtDate(d);
        cost[line.key] += r * dt;
        var last = segments[segments.length - 1];
        if (last && last.rate === r) {
          last.hours += dt;
        } else {
          segments.push({ rate: r, hours: dt });
        }
        d = new Date(d.getTime() + dt * 3600000);
        remaining -= dt;
      }
    });

    return {
      cost: cost,
      segments: segments,
      additionalRate: manual ? fixed : rateAtDate(d),
      manual: manual,
      end: d
    };
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
    var startRate = getRate();
    el.rateBadge.textContent = rateLabel(startRate);

    var calloutH = num(el.callout.value);
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

    if (laborInfo.segments.length > 1) {
      var segs = laborInfo.segments.map(function (s) {
        return money(s.rate) + " × " + fmtQty(s.hours) + "h";
      });
      el.splitValue.textContent = segs.join("  +  ");
      el.splitRow.hidden = false;
    } else {
      el.splitRow.hidden = true;
    }

    var rate = laborInfo.additionalRate;

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
    var upfront = calloutCost + driveCost;

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
      money(total) + ", including call-out/drive time" +
      partClause + " and the " + fmtHours(serviceH) + " " + hourWord + " of service time.\n" +
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

    var company = el.authCompany.value.trim() || "____";
    var invoice = el.authInvoice.value.trim() || "____";
    var serviceName = el.authService.value.trim() || "____";
    var dateStr = usDate(el.authDate.value);

    el.authMsg.value =
      "Please confirm that you are the authorized person of the company: " +
      company + " And you approve the amount of " + money(total) +
      " for the service provided by the Company RoadPro Assistance. Invoice #" +
      invoice + ".  Date " + dateStr + "\n\n" +
      "Service: " + serviceName + "  Please reply YES or NO to confirm";
  }

  /* ---------- events ---------- */

  el.when.value = toLocalInput(new Date());
  el.authDate.value = toLocalInput(new Date()).slice(0, 10);

  ["when", "rateMode", "holiday", "callout", "drive", "service",
   "feeOn", "feeRate", "taxOn", "taxRate", "eta",
   "authCompany", "authInvoice", "authService", "authDate"].forEach(function (key) {
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

  update();
})();
