(function () {
  "use strict";

  const STORAGE_KEY = "buttonPressLogger.v1";

  // Okabe–Ito palette: distinguishable under common forms of color blindness.
  const BUTTONS = [
    { index: 1, color: "Red", hex: "#D55E00" },
    { index: 2, color: "Blue", hex: "#0072B2" },
    { index: 3, color: "Green", hex: "#009E73" },
    { index: 4, color: "Yellow", hex: "#F0E442" },
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    sessionId: $("session-id"),
    sessionStatus: $("session-status"),
    display: $("timer-display"),
    start: $("btn-start"),
    pause: $("btn-pause"),
    stop: $("btn-stop"),
    pad: $("pad"),
    lastPress: $("last-press"),
    undo: $("btn-undo"),
    clear: $("btn-clear"),
    scope: $("export-scope"),
    csv: $("btn-csv"),
    json: $("btn-json"),
    counts: $("counts"),
    logBody: $("log-body"),
    logEmpty: $("log-empty"),
  };

  // ---------- state & persistence ----------

  function freshTimer() {
    return {
      sessionId: null,
      sessionStartIso: null,
      running: false,
      startedAt: null, // Date.now() when the current running stretch began
      accumulatedMs: 0, // time banked from earlier running stretches
    };
  }

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          log: Array.isArray(parsed.log) ? parsed.log : [],
          timer: Object.assign(freshTimer(), parsed.timer || {}),
          lastScope: parsed.lastScope || "all",
        };
      }
    } catch (err) {
      console.warn("Could not load saved data:", err);
    }
    return { log: [], timer: freshTimer(), lastScope: "all" };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("Could not save data:", err);
    }
  }

  // ---------- timer ----------

  function elapsedMs() {
    const t = state.timer;
    return t.accumulatedMs + (t.running && t.startedAt ? Date.now() - t.startedAt : 0);
  }

  function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(ms));
    const h = Math.floor(total / 3600000);
    const m = Math.floor((total % 3600000) / 60000);
    const s = Math.floor((total % 60000) / 1000);
    const milli = total % 1000;
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    const base = `${pad(m)}:${pad(s)}.${pad(milli, 3)}`;
    return h > 0 ? `${h}:${base}` : base;
  }

  let rafId = null;
  function tick() {
    els.display.textContent = formatElapsed(elapsedMs());
    rafId = state.timer.running ? requestAnimationFrame(tick) : null;
  }
  function startTicking() {
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }

  function defaultSessionId() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `S-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function start() {
    const t = state.timer;
    if (t.sessionId) return;

    const id = els.sessionId.value.trim() || defaultSessionId();
    if (state.log.some((e) => e.session_id === id)) {
      const ok = confirm(
        `Session "${id}" already has entries in the log. New presses will be added to it, with the timer starting from 0 again. Continue?`
      );
      if (!ok) return;
    }

    els.sessionId.value = id;
    state.timer = {
      sessionId: id,
      sessionStartIso: new Date().toISOString(),
      running: true,
      startedAt: Date.now(),
      accumulatedMs: 0,
    };
    state.lastScope = id;
    save();
    render();
    startTicking();
  }

  function togglePause() {
    const t = state.timer;
    if (!t.sessionId) return;
    if (t.running) {
      t.accumulatedMs = elapsedMs();
      t.running = false;
      t.startedAt = null;
    } else {
      t.running = true;
      t.startedAt = Date.now();
      startTicking();
    }
    save();
    render();
  }

  function stop() {
    const t = state.timer;
    if (!t.sessionId) return;
    if (!confirm(`End session "${t.sessionId}"? Presses won't be recorded until you start a new session.`)) return;
    const finalMs = elapsedMs();
    const endedId = t.sessionId;
    state.timer = freshTimer();
    state.lastScope = endedId;
    save();
    render();
    els.display.textContent = formatElapsed(finalMs);
  }

  // ---------- logging ----------

  function record(btn) {
    const t = state.timer;
    if (!t.sessionId || !t.running) return;

    const ms = Math.round(elapsedMs());
    const pressNumber = state.log.filter((e) => e.session_id === t.sessionId).length + 1;
    state.log.push({
      session_id: t.sessionId,
      press_number: pressNumber,
      button_index: btn.index,
      button_color: btn.color,
      elapsed_ms: ms,
      elapsed: formatElapsed(ms),
      timestamp_iso: new Date().toISOString(),
      session_start_iso: t.sessionStartIso,
    });
    save();
    flash(btn.index);
    if (navigator.vibrate) navigator.vibrate(25);
    renderLog();
  }

  function flash(index) {
    const el = els.pad.querySelector(`[data-index="${index}"]`);
    if (!el) return;
    el.classList.remove("flash");
    void el.offsetWidth; // restart the animation on rapid repeat presses
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 120);
  }

  function undo() {
    if (!state.log.length) return;
    state.log.pop();
    save();
    renderLog();
  }

  function clearLog() {
    if (!state.log.length) return;
    const ok = confirm(
      `Delete all ${state.log.length} logged presses? This cannot be undone. Export first if you need the data.`
    );
    if (!ok) return;
    state.log = [];
    state.lastScope = state.timer.sessionId || "all";
    save();
    renderLog();
  }

  // ---------- export ----------

  const CSV_COLUMNS = [
    "session_id",
    "press_number",
    "button_index",
    "button_color",
    "elapsed_ms",
    "elapsed",
    "timestamp_iso",
    "session_start_iso",
  ];

  function csvCell(value) {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toCsv(rows) {
    const lines = [CSV_COLUMNS.join(",")];
    for (const r of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(","));
    return lines.join("\r\n") + "\r\n";
  }

  function rowsForScope(scope) {
    return scope === "all" ? state.log : state.log.filter((e) => e.session_id === scope);
  }

  function fileStem(scope) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    const label = scope === "all" ? "all-sessions" : scope.replace(/[^\w.-]+/g, "_");
    return `button-log_${label}_${stamp}`;
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    const scope = els.scope.value;
    const rows = rowsForScope(scope);
    if (!rows.length) return alert("Nothing to export yet.");
    // BOM so Excel opens the file as UTF-8.
    download(`${fileStem(scope)}.csv`, "\uFEFF" + toCsv(rows), "text/csv;charset=utf-8");
  }

  function exportJson() {
    const scope = els.scope.value;
    const rows = rowsForScope(scope);
    if (!rows.length) return alert("Nothing to export yet.");
    const payload = {
      exported_at: new Date().toISOString(),
      scope,
      buttons: BUTTONS.map(({ index, color, hex }) => ({ index, color, hex })),
      presses: rows,
    };
    download(`${fileStem(scope)}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  // ---------- rendering ----------

  function buildPad() {
    for (const btn of BUTTONS) {
      const el = document.createElement("button");
      el.className = "pad-btn";
      el.dataset.index = btn.index;
      el.style.background = btn.hex;
      el.setAttribute("aria-label", `${btn.color} button (key ${btn.index})`);
      el.innerHTML = `<span class="key">${btn.index}</span>`;
      // Log on pointerdown (not click) so the timestamp matches the moment of contact.
      let lastPointerDown = 0;
      el.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        lastPointerDown = performance.now();
        record(btn);
      });
      // Keyboard activation (Enter/Space) on a focused button; skip the click that follows a pointerdown.
      el.addEventListener("click", () => {
        if (performance.now() - lastPointerDown < 1500) return;
        record(btn);
      });
      els.pad.appendChild(el);
    }
  }

  function render() {
    const t = state.timer;
    const active = Boolean(t.sessionId);

    els.sessionId.disabled = active;
    if (active) els.sessionId.value = t.sessionId;
    els.start.disabled = active;
    els.pause.disabled = !active;
    els.pause.textContent = t.running || !active ? "Pause" : "Resume";
    els.stop.disabled = !active;

    els.sessionStatus.textContent = active
      ? `${t.running ? "Recording" : "Paused"}: ${t.sessionId}`
      : "No active session";
    els.sessionStatus.classList.toggle("active", active && t.running);

    for (const el of els.pad.children) el.disabled = !t.running;

    if (active) els.display.textContent = formatElapsed(elapsedMs());
    renderLog();
    syncWakeLock();
  }

  // Keep the screen on while recording (supported on modern iOS/Android over HTTPS).
  let wakeLock = null;
  async function syncWakeLock() {
    const want = state.timer.running && document.visibilityState === "visible";
    try {
      if (want && !wakeLock && "wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
          wakeLock = null;
        });
      } else if (!want && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (err) {
      wakeLock = null;
    }
  }

  function renderLastPress() {
    const t = state.timer;
    const last = state.log[state.log.length - 1];
    if (!t.sessionId) {
      els.lastPress.innerHTML = "&nbsp;";
    } else if (last && last.session_id === t.sessionId) {
      const hex = BUTTONS.find((b) => b.index === last.button_index).hex;
      els.lastPress.innerHTML = `Last: <span class="swatch" style="background:${hex}"></span> `;
      els.lastPress.appendChild(
        document.createTextNode(`${last.button_color} at ${last.elapsed} · ${last.press_number} total`)
      );
    } else {
      els.lastPress.textContent = t.running ? "Ready: tap a color" : "Paused";
    }
  }

  function sessionIds() {
    const seen = [];
    for (const e of state.log) if (!seen.includes(e.session_id)) seen.push(e.session_id);
    if (state.timer.sessionId && !seen.includes(state.timer.sessionId)) seen.push(state.timer.sessionId);
    return seen;
  }

  function renderScopeOptions() {
    const ids = sessionIds();
    const wanted = state.lastScope;
    els.scope.innerHTML = "";
    const add = (value, label) => {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      els.scope.appendChild(o);
    };
    add("all", `All sessions (${state.log.length})`);
    for (const id of ids) {
      const n = state.log.filter((e) => e.session_id === id).length;
      add(id, `Session ${id} (${n})`);
    }
    els.scope.value = wanted === "all" || ids.includes(wanted) ? wanted : "all";
  }

  function renderCounts() {
    const rows = rowsForScope(els.scope.value);
    els.counts.innerHTML = "";
    for (const btn of BUTTONS) {
      const n = rows.filter((e) => e.button_index === btn.index).length;
      const chip = document.createElement("span");
      chip.className = "count-chip";
      chip.innerHTML = `<span class="swatch" style="background:${btn.hex}"></span>${btn.color}: <strong>${n}</strong>`;
      els.counts.appendChild(chip);
    }
  }

  function renderLog() {
    renderScopeOptions();
    renderCounts();
    renderLastPress();

    const rows = rowsForScope(els.scope.value);
    const colorHex = Object.fromEntries(BUTTONS.map((b) => [b.index, b.hex]));
    const frag = document.createDocumentFragment();
    for (let i = rows.length - 1; i >= 0; i--) {
      const e = rows[i];
      const tr = document.createElement("tr");
      const cells = [
        e.press_number,
        e.session_id,
        null,
        e.elapsed,
        new Date(e.timestamp_iso).toLocaleTimeString([], { hour12: false }) +
          "." + String(new Date(e.timestamp_iso).getMilliseconds()).padStart(3, "0"),
      ];
      cells.forEach((value, idx) => {
        const td = document.createElement("td");
        if (idx === 2) {
          td.innerHTML = `<span class="swatch" style="background:${colorHex[e.button_index]}"></span> `;
          td.appendChild(document.createTextNode(e.button_color));
        } else {
          td.textContent = value;
        }
        if (idx === 3 || idx === 4) td.className = "mono";
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    }
    els.logBody.replaceChildren(frag);
    els.logEmpty.hidden = rows.length > 0;
    els.undo.disabled = state.log.length === 0;
    els.clear.disabled = state.log.length === 0;
  }

  // ---------- wiring ----------

  buildPad();

  els.start.addEventListener("click", start);
  els.pause.addEventListener("click", togglePause);
  els.stop.addEventListener("click", stop);
  els.undo.addEventListener("click", undo);
  els.clear.addEventListener("click", clearLog);
  els.csv.addEventListener("click", exportCsv);
  els.json.addEventListener("click", exportJson);
  els.scope.addEventListener("change", () => {
    state.lastScope = els.scope.value;
    save();
    renderLog();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
    const btn = BUTTONS.find((b) => String(b.index) === ev.key);
    if (btn) {
      ev.preventDefault();
      record(btn);
    }
  });

  els.pad.addEventListener("contextmenu", (ev) => ev.preventDefault());

  // Wake locks are dropped when the tab is hidden; reacquire and refresh on return.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      render();
      if (state.timer.running) startTicking();
    } else {
      syncWakeLock();
    }
  });

  // Keep tabs in sync if the app is open in more than one tab.
  window.addEventListener("storage", (ev) => {
    if (ev.key !== STORAGE_KEY) return;
    state = load();
    render();
    if (state.timer.running) startTicking();
  });

  render();
  if (state.timer.running) startTicking();
})();
