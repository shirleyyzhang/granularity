const chat = document.querySelector(".chat");
const composer = document.getElementById("composer");
const peekTooltip = document.getElementById("peek-tooltip");
const detailMenu = document.getElementById("detail-menu");
const chatInput = document.getElementById("chat-input");

let menuTarget = null;
let menuType = "facts";
let menuHideTimer = null;
let menuSliderIndex = 1;
let menuDepthCommitted = false;
let chatContext = {};
let detailDebounce = null;
let detailCache = new Map();
let conversationHistory = [];
let chatLoading = false;

const API_BASE =
  window.location.protocol === "file:" || !window.location.host
    ? "http://localhost:3000"
    : "";

function isOfflinePage() {
  return window.location.protocol === "file:" || !window.location.host;
}

function showServerBanner() {
  if (!isOfflinePage()) return;
  const banner = document.createElement("div");
  banner.className = "server-banner";
  banner.innerHTML = `
    <strong>Server required.</strong>
    Run <code>npm start</code> in the project folder, then open
    <a href="http://localhost:3000">http://localhost:3000</a>
    (opening the HTML file directly won't work).
  `;
  document.querySelector(".app")?.prepend(banner);
}

async function apiPost(path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      isOfflinePage()
        ? "Can't reach the API. Run npm start and open http://localhost:3000"
        : "Can't reach the server. Make sure npm start is running."
    );
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Server returned an invalid response.");
  }

  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent.replace(/\s+/g, " ").trim();
}

function seedConversationFromDom() {
  conversationHistory = [];
  chat.querySelectorAll(".message.user, .message.assistant").forEach((msg) => {
    const role = msg.classList.contains("user") ? "user" : "assistant";
    const content = msg.innerText.replace(/\s+/g, " ").trim();
    if (content) conversationHistory.push({ role, content });
  });
}

function getConversationForApi() {
  return conversationHistory.map(({ role, content }) => ({ role, content }));
}

function detailCacheKey(id, typeId, levelIndex) {
  return `${id}:${typeId}:${levelIndex}`;
}

async function fetchChatReply(messages, detailContext) {
  const data = await apiPost("/api/chat", { messages, detailContext });
  return data.html;
}

function getPriorLevels(ideaId, detailType, depthIndex) {
  const prior = {};
  if (depthIndex >= 1) {
    const brief = detailCache.get(detailCacheKey(ideaId, detailType, 0))?.body;
    if (brief) prior.brief = brief;
  }
  if (depthIndex >= 2) {
    const standard = detailCache.get(detailCacheKey(ideaId, detailType, 1))?.body;
    if (standard) prior.standard = standard;
  }
  return prior;
}

async function fetchDetailExpansion({ ideaId, ideaTitle, detailType, depthLabel, depthIndex }) {
  const key = detailCacheKey(ideaId, detailType, depthIndex);
  if (detailCache.has(key)) return detailCache.get(key);

  const data = await apiPost("/api/detail", {
    ideaId,
    ideaTitle,
    detailType,
    depthLabel,
    depthIndex,
    conversation: getConversationForApi(),
    priorLevels: getPriorLevels(ideaId, detailType, depthIndex),
  });

  detailCache.set(key, data);
  return data;
}

function getIdeaTitle(el) {
  return DETAIL_DATA[el.dataset.id]?.title || getOriginalText(el);
}

function getDepthLevel(levelIndex) {
  const label = DEPTH_LABELS[levelIndex] || DEPTH_LABELS[1];
  return { label, body: "" };
}

function getStaticDetailBody(id, typeId, levelIndex) {
  const data = DETAIL_DATA[id];
  return data?.types?.[typeId]?.[levelIndex]?.body || null;
}

function ensurePhraseWrap(el) {
  if (el.parentElement?.classList.contains("phrase-wrap")) return el.parentElement;
  const wrap = document.createElement("span");
  wrap.className = "phrase-wrap";
  el.parentNode.insertBefore(wrap, el);
  wrap.appendChild(el);
  return wrap;
}

function getPhraseWrap(el) {
  return ensurePhraseWrap(el);
}

function getInlineDetailEl(el, typeId) {
  return getPhraseWrap(el).querySelector(`.detail-inline[data-type="${typeId}"]`);
}

function isTypeActive(el, typeId) {
  return !!getInlineDetailEl(el, typeId);
}

const DETAIL_TYPE_COLORS = {
  facts: 0,    // teal
  evidence: 1, // amber
  risks: 3,    // rose — avoids violet clashing with menu selection accent
  action: 4,   // sky
};

function getDetailTypeColor(typeId) {
  const colorIndex = DETAIL_TYPE_COLORS[typeId] ?? 0;
  return PHRASE_COLORS[colorIndex];
}

const SELECTABLE_PHRASE_COLOR = PHRASE_COLORS[2]; // violet — same purple for all selectables

function applyPhraseColor(el) {
  const c = SELECTABLE_PHRASE_COLOR;
  el.dataset.colorIndex = "2";
  el.style.setProperty("--phrase-bg", c.bg);
  el.style.setProperty("--phrase-border", c.border);
  el.style.setProperty("--phrase-text", c.text);
  el.style.setProperty("--phrase-soft", c.soft);
  return c;
}

function applyDetailColor(detailEl, typeId) {
  const c = getDetailTypeColor(typeId);
  detailEl.style.setProperty("--detail-bg", c.bg);
  detailEl.style.setProperty("--detail-border", c.border);
  detailEl.style.setProperty("--detail-text", c.text);
  detailEl.style.setProperty("--detail-soft", c.soft);
  return c;
}

function sortInlineDetails(wrap) {
  const order = DETAIL_TYPES.map((t) => t.id);
  const details = [...wrap.querySelectorAll(".detail-inline")];
  details.sort((a, b) => order.indexOf(a.dataset.type) - order.indexOf(b.dataset.type));
  details.forEach((d) => wrap.appendChild(d));
}

function updateInlineDetailContent(detail, typeMeta, level, body) {
  detail.innerHTML = `
    <span class="detail-sep" aria-hidden="true"> — </span>
    <span class="detail-inline-meta">${typeMeta?.label || detail.dataset.type} · ${level.label}</span>
    <span class="detail-inline-body">${escapeHtml(body)}</span>
  `;
}

function setInlineDetailLoading(detail, typeMeta, level) {
  detail.innerHTML = `
    <span class="detail-sep" aria-hidden="true"> — </span>
    <span class="detail-inline-meta">${typeMeta?.label || detail.dataset.type} · ${level.label}</span>
    <span class="detail-inline-body loading-text">Generating…</span>
  `;
}

async function updatePhraseDetail(el, typeId, levelIndex, { pin = false } = {}) {
  const level = getDepthLevel(levelIndex);
  const typeMeta = DETAIL_TYPES.find((t) => t.id === typeId);
  const wrap = getPhraseWrap(el);
  const ideaId = el.dataset.id;
  const ideaTitle = getIdeaTitle(el);

  el.dataset.currentType = typeId;
  el.dataset.currentIndex = String(levelIndex);
  if (pin) {
    el.classList.add("is-pinned");
    selectPhrase(el);
  }

  let detail = getInlineDetailEl(el, typeId);
  if (!detail) {
    detail = document.createElement("span");
    detail.className = "detail-inline";
    detail.dataset.type = typeId;
    wrap.appendChild(detail);
  }

  detail.dataset.depth = String(levelIndex);
  applyDetailColor(detail, typeId);
  setInlineDetailLoading(detail, typeMeta, level);
  sortInlineDetails(wrap);
  updateColorLegend();
  repositionMenuIfOpen();

  try {
    const { body } = await fetchDetailExpansion({
      ideaId,
      ideaTitle,
      detailType: typeId,
      depthLabel: level.label,
      depthIndex: levelIndex,
    });
    updateInlineDetailContent(detail, typeMeta, level, body);
  } catch (err) {
    const fallback = getStaticDetailBody(ideaId, typeId, levelIndex);
    if (fallback) {
      updateInlineDetailContent(detail, typeMeta, level, fallback);
    } else {
      detail.innerHTML = `
        <span class="detail-sep" aria-hidden="true"> — </span>
        <span class="detail-inline-meta">${typeMeta?.label || typeId} · ${level.label}</span>
        <span class="detail-inline-body error-text">${escapeHtml(err.message)}</span>
      `;
    }
  }

  sortInlineDetails(wrap);
  updateColorLegend();
  repositionMenuIfOpen();
}

function removeInlineDetail(el, typeId) {
  getInlineDetailEl(el, typeId)?.remove();
  if (!getPhraseWrap(el).querySelector(".detail-inline")) {
    el.classList.remove("is-pinned", "is-selected");
    el.setAttribute("aria-pressed", "false");
    delete el.dataset.currentType;
    delete el.dataset.currentIndex;
  }
  updateColorLegend();
}

function clearPhraseDetails(el) {
  getPhraseWrap(el).querySelectorAll(".detail-inline").forEach((d) => d.remove());
  el.classList.remove("is-pinned", "is-selected", "is-active");
  el.setAttribute("aria-pressed", "false");
  delete el.dataset.currentType;
  delete el.dataset.currentIndex;
  updateColorLegend();
}

function hasInlineDetails(el) {
  return el.classList.contains("is-pinned") && !!getPhraseWrap(el).querySelector(".detail-inline");
}

function setActiveTarget(el) {
  document.querySelectorAll(".selectable.is-active").forEach((s) => {
    s.classList.remove("is-active");
  });
  if (el) {
    applyPhraseColor(el);
    el.classList.add("is-active");
  }
  updateColorLegend();
}

function selectPhrase(el) {
  applyPhraseColor(el);
  el.classList.add("is-selected");
  el.setAttribute("aria-pressed", "true");
  updateColorLegend();
}

function updateColorLegend() {
  const legend = document.getElementById("color-legend");
  if (!legend) return;

  const active = [...document.querySelectorAll(".selectable.is-pinned, .selectable.is-selected")];
  const seen = new Set();

  legend.innerHTML = active
    .filter((el) => {
      if (seen.has(el.dataset.id)) return false;
      seen.add(el.dataset.id);
      return true;
    })
    .map((el) => {
      const c = applyPhraseColor(el);
      const title = getIdeaTitle(el);
      const short = title.length > 36 ? title.slice(0, 34) + "…" : title;
      const isActive = el.classList.contains("is-active");
      const typeCount = getPhraseWrap(el).querySelectorAll(".detail-inline").length;
      const countBadge = typeCount > 1 ? ` · ${typeCount} details` : "";
      return `
        <button type="button" class="legend-chip${isActive ? " is-active" : ""}"
          data-id="${el.dataset.id}"
          style="--chip-bg:${c.bg};--chip-border:${c.border};--chip-text:${c.text}">
          <span class="legend-dot"></span>${short}${countBadge}
        </button>
      `;
    })
    .join("");
}

document.getElementById("color-legend")?.addEventListener("click", (e) => {
  const chip = e.target.closest(".legend-chip");
  if (!chip) return;
  const el = document.querySelector(`.selectable[data-id="${chip.dataset.id}"]`);
  if (el) {
    setActiveTarget(el);
    showDetailMenu(el);
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

function getDepthLevels() {
  return DEPTH_LABELS.map((label) => ({ label, body: "" }));
}

function getOriginalText(el) {
  if (!el.dataset.originalText) {
    el.dataset.originalText = el.textContent.trim();
  }
  return el.dataset.originalText;
}

function resetPhrase(el) {
  clearPhraseDetails(el);
}

function getLineRect(el) {
  const phraseRange = document.createRange();
  phraseRange.selectNodeContents(el);
  const phraseRects = [...phraseRange.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  const phraseRect = phraseRects.length
    ? phraseRects.reduce((line, rect) => (rect.bottom > line.bottom ? rect : line))
    : el.getBoundingClientRect();

  const paragraph = el.closest("p");
  if (!paragraph) return phraseRect;

  const lineRects = [...paragraph.getClientRects()].filter(
    (r) =>
      r.width > 0 &&
      r.height > 0 &&
      r.top <= phraseRect.bottom &&
      r.bottom >= phraseRect.top
  );

  if (!lineRects.length) return phraseRect;

  const top = Math.min(...lineRects.map((r) => r.top));
  const bottom = Math.max(...lineRects.map((r) => r.bottom));
  const left = Math.min(...lineRects.map((r) => r.left));
  const right = Math.max(...lineRects.map((r) => r.right));

  return {
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
  };
}

function getMenuAnchorRect(el) {
  const wrap = getPhraseWrap(el);
  if (!wrap.querySelector(".detail-inline")) return getLineRect(el);

  const range = document.createRange();
  range.selectNodeContents(wrap);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  if (!rects.length) return getLineRect(el);

  const bottom = Math.max(...rects.map((r) => r.bottom));
  const lastLine = rects.filter((r) => r.bottom >= bottom - 1);
  return {
    top: Math.min(...lastLine.map((r) => r.top)),
    bottom,
    left: Math.min(...lastLine.map((r) => r.left)),
    right: Math.max(...lastLine.map((r) => r.right)),
    width: Math.max(...lastLine.map((r) => r.right)) - Math.min(...lastLine.map((r) => r.left)),
    height: bottom - Math.min(...lastLine.map((r) => r.top)),
  };
}

function positionMenu(anchor) {
  const lineRect = getMenuAnchorRect(anchor);
  const paragraph = anchor.closest("p");
  const blockRect = paragraph?.getBoundingClientRect() || lineRect;

  detailMenu.hidden = false;
  const menuRect = detailMenu.getBoundingClientRect();

  let left = blockRect.left;
  left = Math.max(12, Math.min(left, window.innerWidth - menuRect.width - 12));

  const top = lineRect.bottom + 8;
  detailMenu.style.left = `${left}px`;
  detailMenu.style.top = `${top}px`;
}

function commitDepth(el, depthIndex) {
  if (!el || !menuType) return;
  menuSliderIndex = depthIndex;
  menuDepthCommitted = true;
  updatePhraseDetail(el, menuType, depthIndex, { pin: true });
}

function pickDepth(depthIndex) {
  const slider = detailMenu.querySelector(".menu-slider");
  if (slider) slider.value = String(depthIndex);
  menuSliderIndex = depthIndex;
  if (menuTarget) commitDepth(menuTarget, depthIndex);
}

function bindMenuSlider() {
  const levels = getDepthLevels();
  const slider = detailMenu.querySelector(".menu-slider");
  if (!slider) return;

  slider.max = String(Math.max(levels.length - 1, 0));
  slider.value = String(Math.min(menuSliderIndex, levels.length - 1));

  slider.oninput = () => {
    const i = Number(slider.value);
    menuSliderIndex = i;
    clearTimeout(detailDebounce);
    detailDebounce = setTimeout(() => {
      if (menuTarget) commitDepth(menuTarget, i);
    }, 200);
  };

  slider.onchange = () => {
    const i = Number(slider.value);
    if (menuTarget) commitDepth(menuTarget, i);
  };
}

function showDetailMenu(el, { typeOverride } = {}) {
  clearTimeout(menuHideTimer);
  const id = el.dataset.id;
  const title = getIdeaTitle(el);

  menuTarget = el;
  menuType = typeOverride ?? el.dataset.currentType ?? "facts";

  const existingDetail = getInlineDetailEl(el, menuType);
  if (existingDetail?.dataset.depth != null) {
    menuSliderIndex = Number(existingDetail.dataset.depth);
    menuDepthCommitted = true;
  } else {
    menuDepthCommitted = false;
    menuSliderIndex = 1;
  }

  const levels = getDepthLevels();
  menuSliderIndex = Math.min(menuSliderIndex, Math.max(levels.length - 1, 0));

  const typeButtons = DETAIL_TYPES.map((t) => {
    const isEditing = t.id === menuType;
    const isAdded = isTypeActive(el, t.id);
    const typeColor = getDetailTypeColor(t.id);
    return `
      <button type="button" class="menu-chip${isEditing ? " is-active" : ""}${isAdded ? " is-added" : ""}"
        data-action="type" data-type="${t.id}"
        style="--chip-type-bg:${typeColor.bg};--chip-type-border:${typeColor.border};--chip-type-text:${typeColor.text}"
        aria-pressed="${isAdded ? "true" : "false"}">${t.label}</button>
    `;
  }).join("");

  const tickMarks = levels
    .map(
      (lvl, i) =>
        `<button type="button" class="menu-slider-tick" data-action="depth" data-depth="${i}" aria-label="${lvl.label}"></button>`
    )
    .join("");
  const hasDetails = hasInlineDetails(el);
  const editingColor = getDetailTypeColor(menuType);
  detailMenu.style.setProperty("--menu-accent", editingColor.border);

  detailMenu.innerHTML = `
    <div class="menu-title-row">
      <span class="menu-color-dot"></span>
      <p class="menu-title">${title}</p>
    </div>
    <div class="menu-section">
      <p class="menu-label">Detail types <span class="menu-hint">select type · then pick depth</span></p>
      <div class="menu-chips">${typeButtons}</div>
    </div>
    <div class="menu-section">
      <p class="menu-label">How much detail</p>
      <div class="menu-slider-wrap">
        <div class="menu-slider-ticks">${tickMarks}</div>
        <input type="range" class="menu-slider" min="0" max="${Math.max(levels.length - 1, 0)}" step="1" value="${menuSliderIndex}" aria-label="Detail granularity" />
      </div>
      <div class="menu-slider-ends">
        <button type="button" class="menu-depth-label" data-action="depth" data-depth="0">${levels[0]?.label || "Brief"}</button>
        <button type="button" class="menu-depth-label menu-depth-label-center" data-action="depth" data-depth="1">Standard</button>
        <button type="button" class="menu-depth-label" data-action="depth" data-depth="${levels.length - 1}">${levels[levels.length - 1]?.label || "In depth"}</button>
      </div>
    </div>
    <div class="menu-actions">
      <button type="button" class="menu-action primary" data-action="tell-more">Tell me more →</button>
      ${hasDetails ? `<button type="button" class="menu-action" data-action="reset">Clear details</button>` : ""}
    </div>
  `;

  bindMenuSlider();
  positionMenu(el);
}

function hideDetailMenu(delay = 120) {
  clearTimeout(menuHideTimer);
  const pinned = menuTarget?.classList.contains("is-pinned");
  menuHideTimer = setTimeout(() => {
    if (menuTarget && !pinned) {
      menuTarget.classList.remove("is-selected", "is-active");
      menuTarget.setAttribute("aria-pressed", "false");
      updateColorLegend();
    }
    detailMenu.hidden = true;
    menuTarget = null;
  }, pinned ? Math.max(delay, 200) : delay);
}

function bindSelectable(el) {
  if (el.dataset.bound === "1") return;
  el.dataset.bound = "1";
  ensurePhraseWrap(el);
  getOriginalText(el);
  applyPhraseColor(el);

  const wrap = getPhraseWrap(el);

  wrap.addEventListener("mouseenter", () => {
    setActiveTarget(el);
    showDetailMenu(el);
  });
  wrap.addEventListener("mouseleave", (e) => {
    if (detailMenu.contains(e.relatedTarget)) return;
    hideDetailMenu();
  });
  el.addEventListener("click", (e) => {
    e.preventDefault();
    selectPhrase(el);
    setActiveTarget(el);
    showDetailMenu(el);
  });
  el.addEventListener("focus", () => {
    setActiveTarget(el);
    showDetailMenu(el);
  });
  el.addEventListener("blur", (e) => {
    if (detailMenu.contains(e.relatedTarget)) return;
    hideDetailMenu(0);
  });
}

function bindAllSelectables(root = document) {
  root.querySelectorAll(".selectable").forEach(bindSelectable);
}

detailMenu.addEventListener("mouseenter", () => clearTimeout(menuHideTimer));
detailMenu.addEventListener("mouseleave", () => hideDetailMenu());

detailMenu.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn || !menuTarget) return;

  const action = btn.dataset.action;

  if (action === "depth") {
    pickDepth(Number(btn.dataset.depth));
    return;
  }

  if (action === "type") {
    const newType = btn.dataset.type;

    if (isTypeActive(menuTarget, newType) && newType === menuType) {
      removeInlineDetail(menuTarget, newType);
      const remaining = DETAIL_TYPES.find((t) => isTypeActive(menuTarget, t.id));
      menuType = remaining?.id || newType;
      if (remaining) {
        menuSliderIndex = Number(getInlineDetailEl(menuTarget, remaining.id).dataset.depth) || 0;
        menuDepthCommitted = true;
      } else {
        menuDepthCommitted = false;
        menuSliderIndex = 1;
      }
    } else if (isTypeActive(menuTarget, newType)) {
      menuType = newType;
      menuSliderIndex = Number(getInlineDetailEl(menuTarget, newType).dataset.depth) || 0;
      menuDepthCommitted = true;
    } else {
      menuType = newType;
      menuDepthCommitted = false;
      menuSliderIndex = 1;
      selectPhrase(menuTarget);
      menuTarget.classList.add("is-pinned");
    }

    showDetailMenu(menuTarget, { typeOverride: menuType });
    return;
  }

  if (action === "reset") {
    resetPhrase(menuTarget);
    hideDetailMenu(0);
    return;
  }

  if (action === "tell-more") {
    tellMeMore(menuTarget);
    hideDetailMenu(0);
  }
});

function tellMeMore(el) {
  const id = el.dataset.id;
  const title = getIdeaTitle(el);

  const activeTypes = DETAIL_TYPES.filter((t) => isTypeActive(el, t.id));
  if (activeTypes.length === 0) {
    const typeId = menuType || "facts";
    const index = menuSliderIndex;
    const level = getDepthLevel(index);
    const typeMeta = DETAIL_TYPES.find((t) => t.id === typeId);
    chatContext = { detailId: id, title, type: typeId, index };
    prefillComposer(`Tell me more about “${title}” (${typeMeta?.label || "Detail"} · ${level.label}). `);
  } else {
    const parts = activeTypes.map((t) => {
      const detail = getInlineDetailEl(el, t.id);
      const depth = Number(detail?.dataset.depth) || 0;
      const level = getDepthLevel(depth);
      return `${t.label} · ${level.label}`;
    });
    chatContext = {
      detailId: id,
      title,
      types: activeTypes.map((t) => t.id),
    };
    prefillComposer(`Tell me more about “${title}” (${parts.join("; ")}). `);
  }

  composer.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function prefillComposer(text, placeholder) {
  chatInput.value = text;
  autosizeInput();
  if (placeholder) chatInput.placeholder = placeholder;
  chatInput.focus();
  chatInput.setSelectionRange(text.length, text.length);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setComposerDisabled(disabled) {
  chatLoading = disabled;
  chatInput.disabled = disabled;
  composer.querySelector(".composer-send").disabled = disabled;
}

function appendLoadingMessage() {
  const el = document.createElement("div");
  el.className = "message assistant";
  el.dataset.loading = "true";
  el.innerHTML = `<p class="loading-text">Thinking…</p>`;
  chat.insertBefore(el, composer);
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return el;
}

async function handleUserMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || chatLoading) return;

  appendMessage("user", escapeHtml(trimmed));
  conversationHistory.push({ role: "user", content: trimmed });

  setComposerDisabled(true);
  const loadingEl = appendLoadingMessage();

  try {
    const html = await fetchChatReply(
      getConversationForApi(),
      Object.keys(chatContext).length ? chatContext : undefined
    );
    loadingEl.remove();
    appendMessage("assistant", html);
    conversationHistory.push({ role: "assistant", content: htmlToText(html) });
    chatContext = {};
  } catch (err) {
    loadingEl.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
    conversationHistory.pop();
  } finally {
    setComposerDisabled(false);
  }
}

function appendMessage(role, htmlOrText) {
  const el = document.createElement("div");
  el.className = `message ${role}`;
  if (role === "user") {
    el.innerHTML = `<p>${htmlOrText}</p>`;
  } else {
    el.innerHTML = htmlOrText;
  }
  chat.insertBefore(el, composer);
  bindAllSelectables(el);
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return el;
}

// --- Sentence peeks ---
let peekHideTimer = null;

function showPeek(el) {
  const text = el.getAttribute("data-peek");
  if (!text) return;

  clearTimeout(peekHideTimer);
  peekTooltip.hidden = false;
  peekTooltip.textContent = text;

  const rect = el.getBoundingClientRect();
  const tipRect = peekTooltip.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - tipRect.width - 12));
  let top = rect.top - tipRect.height - 10;
  if (top < 8) top = rect.bottom + 10;

  peekTooltip.style.left = `${left}px`;
  peekTooltip.style.top = `${top}px`;
  el.classList.add("is-peeking");
}

function hidePeek(el) {
  if (el) el.classList.remove("is-peeking");
  peekHideTimer = setTimeout(() => {
    peekTooltip.hidden = true;
  }, 80);
}

chat.addEventListener("pointerover", (e) => {
  const target = e.target.closest(".peek-sentence");
  if (!target || !chat.contains(target)) return;
  if (e.target.closest(".selectable")) return;
  showPeek(target);
});

chat.addEventListener("pointerout", (e) => {
  const target = e.target.closest(".peek-sentence");
  if (!target) return;
  const related = e.relatedTarget;
  if (related && target.contains(related)) return;
  hidePeek(target);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideDetailMenu(0);
});

function repositionMenuIfOpen() {
  if (menuTarget && !detailMenu.hidden) positionMenu(menuTarget);
}

window.addEventListener("scroll", repositionMenuIfOpen, true);
window.addEventListener("resize", repositionMenuIfOpen);

bindAllSelectables();
seedConversationFromDom();
showServerBanner();

function autosizeInput() {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
}

chatInput.addEventListener("input", autosizeInput);

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value;
  if (!text.trim()) return;
  chatInput.value = "";
  autosizeInput();
  handleUserMessage(text);
});
