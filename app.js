"use strict";

/**
 * RHEL Arabic Command Dictionary V2
 * No external libraries are required.
 */

class SafeStorage {
  static get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  static set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The app still works when storage is unavailable.
    }
  }

  static remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage restrictions.
    }
  }
}

class ArabicText {
  static stopWords = new Set([
    "اريد", "ابي", "ابغي", "احتاج", "ممكن", "يمكن", "كيف", "طريقه",
    "لي", "لدي", "عندي", "من", "في", "علي", "الى", "عن", "ما", "هو",
    "هي", "هذا", "هذه", "ذلك", "او", "ثم", "مع", "كل", "بواسطه",
    "الرجاء", "لو", "فضلا", "عمل", "شي", "شيء"
  ].map(word => ArabicText.normalize(word)));

  static synonyms = new Map(Object.entries({
    "تحميل": ["تثبيت", "تنزيل", "install"],
    "تنزيل": ["تثبيت", "تحميل", "install"],
    "تنصيب": ["تثبيت", "install"],
    "تطبيق": ["برنامج", "حزمه", "package"],
    "برنامج": ["تطبيق", "حزمه", "package"],
    "حذف": ["ازاله", "الغاء", "remove", "delete"],
    "مسح": ["حذف", "ازاله", "remove"],
    "تشغيل": ["بدء", "start", "enable"],
    "ايقاف": ["وقف", "stop", "disable"],
    "ريستارت": ["اعاده", "تشغيل", "restart"],
    "خدمه": ["سيرفس", "service", "systemctl"],
    "سيرفس": ["خدمه", "service", "systemctl"],
    "لوق": ["سجل", "سجلات", "journal", "log"],
    "لوقات": ["سجلات", "journal", "log"],
    "اخطاء": ["فشل", "مشاكل", "error", "failed"],
    "هارد": ["قرص", "تخزين", "disk"],
    "مساحه": ["حجم", "تخزين", "disk"],
    "رام": ["ذاكره", "memory"],
    "بورت": ["منفذ", "port"],
    "فايروول": ["جدار", "firewall"],
    "مستخدم": ["حساب", "user"],
    "قروب": ["مجموعه", "group"],
    "مجلد": ["دليل", "directory", "folder"],
    "ملف": ["file"],
    "نسخ": ["copy", "cp"],
    "نقل": ["move", "mv"],
    "بحث": ["find", "grep", "search"],
    "شبكه": ["اتصال", "network", "ip"],
    "انترنت": ["شبكه", "اتصال", "ping"],
    "صلاحيات": ["اذونات", "permission", "chmod", "chown"],
    "ضغط": ["ارشيف", "tar", "zip"],
    "فك": ["استخراج", "extract", "unzip"],
    "اصدار": ["نسخه", "version"],
    "سيرفر": ["خادم", "server", "host"],
    "دخول": ["اتصال", "ssh", "login"]
  }).map(([key, values]) => [
    ArabicText.normalize(key),
    values.map(value => ArabicText.normalize(value))
  ]));

  static normalize(value = "") {
    return String(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[إأآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ـ/g, "")
      .replace(/[^\p{L}\p{N}\s_./<>|:\-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  static tokenize(value, { expand = true } = {}) {
    const baseTokens = ArabicText.normalize(value)
      .split(" ")
      .filter(token => token.length > 1 && !ArabicText.stopWords.has(token));

    if (!expand) return [...new Set(baseTokens)];

    const expanded = new Set(baseTokens);
    for (const token of baseTokens) {
      const alternatives = ArabicText.synonyms.get(token) || [];
      alternatives.forEach(item => expanded.add(item));
    }
    return [...expanded];
  }

  static escapeHtml(value = "") {
    const element = document.createElement("div");
    element.textContent = String(value);
    return element.innerHTML;
  }

  static highlight(value, query) {
    const escaped = ArabicText.escapeHtml(value);
    const queryTokens = ArabicText.tokenize(query, { expand: false })
      .sort((a, b) => b.length - a.length);

    if (!queryTokens.length) return escaped;

    let output = escaped;
    for (const token of queryTokens) {
      const safeToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const expression = new RegExp(`(${safeToken})`, "giu");
      output = output.replace(expression, "<mark>$1</mark>");
    }
    return output;
  }
}

class SearchIndex {
  constructor(commands, categories) {
    this.commands = commands;
    this.categories = categories;
    this.records = new Map();
    this.inverted = new Map();
    this.suggestionPool = [];
    this.build();
  }

  build() {
    for (const command of this.commands) {
      const categoryName = this.categories[command.category] || command.category;
      const record = {
        id: command.id,
        title: ArabicText.normalize(command.title_ar),
        description: ArabicText.normalize(command.description_ar),
        keywords: ArabicText.normalize((command.keywords_ar || []).join(" ")),
        command: ArabicText.normalize(command.command),
        example: ArabicText.normalize(command.example || ""),
        category: ArabicText.normalize(categoryName),
        notes: ArabicText.normalize(command.notes_ar || ""),
        all: ""
      };

      record.all = [
        record.title,
        record.description,
        record.keywords,
        record.command,
        record.example,
        record.category,
        record.notes
      ].join(" ");

      this.records.set(command.id, record);

      const tokens = ArabicText.tokenize(record.all, { expand: false });
      for (const token of tokens) {
        if (!this.inverted.has(token)) this.inverted.set(token, new Set());
        this.inverted.get(token).add(command.id);
      }

      this.suggestionPool.push({
        id: command.id,
        title: command.title_ar,
        command: command.command,
        category: categoryName,
        normalized: `${record.title} ${record.keywords} ${record.command}`
      });
    }
  }

  getCandidates(query) {
    const tokens = ArabicText.tokenize(query);
    if (!tokens.length) return this.commands;

    const candidateIds = new Set();

    for (const token of tokens) {
      const exact = this.inverted.get(token);
      exact?.forEach(id => candidateIds.add(id));

      if (token.length >= 3) {
        for (const [indexedToken, ids] of this.inverted) {
          if (indexedToken.includes(token) || token.includes(indexedToken)) {
            ids.forEach(id => candidateIds.add(id));
          }
        }
      }
    }

    if (!candidateIds.size) return this.commands;
    return this.commands.filter(command => candidateIds.has(command.id));
  }

  score(command, query) {
    const normalizedQuery = ArabicText.normalize(query);
    if (!normalizedQuery) return 0;

    const rawTokens = ArabicText.tokenize(query, { expand: false });
    const expandedTokens = ArabicText.tokenize(query);
    const record = this.records.get(command.id);
    let score = 0;

    if (record.title === normalizedQuery) score += 150;
    if (record.title.startsWith(normalizedQuery)) score += 80;
    if (record.title.includes(normalizedQuery)) score += 65;
    if (record.keywords.includes(normalizedQuery)) score += 55;
    if (record.command.includes(normalizedQuery)) score += 45;
    if (record.description.includes(normalizedQuery)) score += 35;
    if (record.category.includes(normalizedQuery)) score += 22;

    for (const token of rawTokens) {
      if (record.title.includes(token)) score += 26;
      if (record.keywords.includes(token)) score += 21;
      if (record.command.includes(token)) score += 17;
      if (record.description.includes(token)) score += 12;
      if (record.example.includes(token)) score += 9;
      if (record.category.includes(token)) score += 7;
      if (record.notes.includes(token)) score += 4;
    }

    const synonymTokens = expandedTokens.filter(token => !rawTokens.includes(token));
    for (const token of synonymTokens) {
      if (record.title.includes(token)) score += 10;
      if (record.keywords.includes(token)) score += 8;
      if (record.command.includes(token)) score += 6;
      if (record.description.includes(token)) score += 4;
    }

    const matchedRaw = rawTokens.filter(token => record.all.includes(token)).length;
    if (rawTokens.length > 1 && matchedRaw === rawTokens.length) score += 45;
    else score += matchedRaw * 4;

    return score;
  }

  search(query) {
    if (!ArabicText.normalize(query)) {
      return this.commands.map(command => ({ command, score: 0 }));
    }

    return this.getCandidates(query)
      .map(command => ({ command, score: this.score(command, query) }))
      .filter(item => item.score > 0);
  }

  suggest(query, limit = 7) {
    const normalized = ArabicText.normalize(query);
    if (normalized.length < 2) return [];

    return this.suggestionPool
      .map(item => {
        let score = 0;
        if (ArabicText.normalize(item.title).startsWith(normalized)) score += 60;
        if (ArabicText.normalize(item.title).includes(normalized)) score += 40;
        if (item.normalized.includes(normalized)) score += 25;

        for (const token of ArabicText.tokenize(query)) {
          if (item.normalized.includes(token)) score += 8;
        }

        return { ...item, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ar"))
      .slice(0, limit);
  }
}

class RhelDictionaryApp {
  constructor() {
    this.data = null;
    this.commands = [];
    this.index = null;
    this.favorites = new Set(SafeStorage.get("rhel:favorites", []));
    this.history = SafeStorage.get("rhel:history", []);
    this.mode = "all";
    this.layout = SafeStorage.get("rhel:layout", "grid");
    this.visibleLimit = 24;
    this.suggestions = [];
    this.activeSuggestion = -1;
    this.toastTimer = null;
    this.searchTimer = null;

    this.riskLabels = {
      low: "منخفضة",
      medium: "متوسطة",
      high: "عالية",
      critical: "حرجة"
    };

    this.riskOrder = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1
    };

    this.elements = this.collectElements();
    this.initializeTheme();
    this.attachStaticEvents();
    this.loadData();
  }

  collectElements() {
    const ids = [
      "searchBox", "searchInput", "clearSearchButton", "suggestions",
      "quickSearches", "commandsMetric", "categoriesMetric",
      "favoritesViewButton", "favoritesCount", "themeButton", "themeIcon",
      "allViewButton", "favoriteTabButton", "recentTabButton",
      "categoryFilter", "riskFilter", "sudoFilter", "versionFilter",
      "sortFilter", "resetButton", "recentSearchesPanel",
      "recentSearchesList", "clearHistoryButton", "results",
      "resultsEyebrow", "resultsTitle", "resultsSummary",
      "compactViewButton", "listViewButton", "activeFilters",
      "loadingState", "errorState", "emptyState", "emptyResetButton",
      "resultsGrid", "loadMoreButton", "toast", "schemaVersion",
      "commandDialog", "closeDialogButton", "dialogContent",
      "commandCardTemplate"
    ];

    return Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  }

  initializeTheme() {
    const stored = SafeStorage.get("rhel:theme", null);
    const preferredDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    this.theme = stored || (preferredDark ? "dark" : "light");
    this.applyTheme();
  }

  applyTheme() {
    document.documentElement.dataset.theme = this.theme;
    const isDark = this.theme === "dark";
    this.elements.themeIcon.textContent = isDark ? "☀" : "☾";
    this.elements.themeButton.setAttribute(
      "aria-label",
      isDark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"
    );
    this.elements.themeButton.title =
      isDark ? "الوضع النهاري" : "الوضع الليلي";
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", isDark ? "#0d1714" : "#0b6b50");
  }

  attachStaticEvents() {
    const e = this.elements;

    e.themeButton.addEventListener("click", () => {
      this.theme = this.theme === "dark" ? "light" : "dark";
      SafeStorage.set("rhel:theme", this.theme);
      this.applyTheme();
    });

    e.searchInput.addEventListener("input", () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        this.visibleLimit = 24;
        this.updateSuggestions();
        this.render();
      }, 90);
    });

    e.searchInput.addEventListener("focus", () => this.updateSuggestions());

    e.searchInput.addEventListener("keydown", event => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.moveSuggestion(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        this.moveSuggestion(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (this.activeSuggestion >= 0) {
          this.selectSuggestion(this.activeSuggestion);
        } else {
          this.commitSearch();
        }
      } else if (event.key === "Escape") {
        this.closeSuggestions();
        if (e.searchInput.value) {
          e.searchInput.value = "";
          this.render();
        }
      }
    });

    e.clearSearchButton.addEventListener("click", () => {
      e.searchInput.value = "";
      this.closeSuggestions();
      this.render();
      e.searchInput.focus();
    });

    document.addEventListener("click", event => {
      if (!e.searchBox.contains(event.target) && !e.suggestions.contains(event.target)) {
        this.closeSuggestions();
      }
    });

    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        e.searchInput.focus();
        e.searchInput.select();
      }
    });

    e.quickSearches.addEventListener("click", event => {
      const button = event.target.closest("[data-query]");
      if (!button) return;
      this.useQuery(button.dataset.query);
    });

    [
      e.categoryFilter,
      e.riskFilter,
      e.sudoFilter,
      e.versionFilter,
      e.sortFilter
    ].forEach(select => select.addEventListener("change", () => {
      this.visibleLimit = 24;
      this.render();
    }));

    e.resetButton.addEventListener("click", () => this.reset());
    e.emptyResetButton.addEventListener("click", () => this.reset());

    e.allViewButton.addEventListener("click", () => this.setMode("all"));
    e.favoriteTabButton.addEventListener("click", () => this.setMode("favorites"));
    e.favoritesViewButton.addEventListener("click", () => this.setMode("favorites"));
    e.recentTabButton.addEventListener("click", () => this.setMode("history"));

    e.compactViewButton.addEventListener("click", () => this.setLayout("grid"));
    e.listViewButton.addEventListener("click", () => this.setLayout("list"));

    e.clearHistoryButton.addEventListener("click", () => {
      this.history = [];
      SafeStorage.remove("rhel:history");
      this.renderHistory();
      this.showToast("تم مسح سجل البحث");
    });

    e.recentSearchesList.addEventListener("click", event => {
      const item = event.target.closest("[data-history-query]");
      if (!item) return;
      this.useQuery(item.dataset.historyQuery);
    });

    e.loadMoreButton.addEventListener("click", () => {
      this.visibleLimit += 24;
      this.renderResults();
    });

    e.activeFilters.addEventListener("click", event => {
      const button = event.target.closest("[data-remove-filter]");
      if (!button) return;
      this.removeFilter(button.dataset.removeFilter);
    });

    e.resultsGrid.addEventListener("click", event => {
      const card = event.target.closest(".command-card");
      if (!card) return;
      const command = this.commands.find(item => item.id === card.dataset.id);
      if (!command) return;

      if (event.target.closest(".copy-button")) {
        this.copy(command.command, "تم نسخ الأمر");
      } else if (event.target.closest(".copy-example-button")) {
        this.copy(command.example || command.command, "تم نسخ المثال");
      } else if (event.target.closest(".favorite-button")) {
        this.toggleFavorite(command.id);
      } else if (event.target.closest(".details-button")) {
        this.openDetails(command);
      }
    });

    e.closeDialogButton.addEventListener("click", () => e.commandDialog.close());
    e.commandDialog.addEventListener("click", event => {
      const rect = e.commandDialog.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) e.commandDialog.close();
    });
  }

  async loadData() {
    try {
      const response = await fetch("commands.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      this.data = await response.json();
      if (!Array.isArray(this.data.commands)) {
        throw new Error("Invalid commands.json schema");
      }

      this.commands = this.data.commands;
      this.index = new SearchIndex(this.commands, this.data.categories || {});

      this.populateCategories();
      this.elements.commandsMetric.textContent = this.commands.length;
      this.elements.categoriesMetric.textContent =
        Object.keys(this.data.categories || {}).length;
      this.elements.schemaVersion.textContent =
        `Schema ${this.data.schema_version || "—"}`;

      this.elements.loadingState.hidden = true;
      this.updateFavoriteCount();
      this.setLayout(this.layout, false);
      this.renderHistory();
      this.render();
    } catch (error) {
      console.error("Unable to load commands.json:", error);
      this.elements.loadingState.hidden = true;
      this.elements.errorState.hidden = false;
    }
  }

  populateCategories() {
    const categories = Object.entries(this.data.categories || {})
      .sort((a, b) => a[1].localeCompare(b[1], "ar"));

    for (const [value, label] of categories) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      this.elements.categoryFilter.appendChild(option);
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.visibleLimit = 24;

    const states = {
      allViewButton: mode === "all",
      favoriteTabButton: mode === "favorites",
      recentTabButton: mode === "history"
    };

    for (const [key, active] of Object.entries(states)) {
      this.elements[key].classList.toggle("is-active", active);
      this.elements[key].setAttribute("aria-selected", String(active));
    }

    this.elements.recentSearchesPanel.hidden = mode !== "history";
    this.elements.results.hidden = mode === "history";

    if (mode === "history") {
      this.renderHistory();
      this.elements.recentSearchesPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    this.render();
    this.elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  setLayout(layout, persist = true) {
    this.layout = layout;
    this.elements.resultsGrid.classList.toggle("list-view", layout === "list");
    this.elements.compactViewButton.classList.toggle("is-active", layout === "grid");
    this.elements.listViewButton.classList.toggle("is-active", layout === "list");
    if (persist) SafeStorage.set("rhel:layout", layout);
  }

  reset() {
    const e = this.elements;
    e.searchInput.value = "";
    e.categoryFilter.value = "all";
    e.riskFilter.value = "all";
    e.sudoFilter.value = "all";
    e.versionFilter.value = "all";
    e.sortFilter.value = "relevance";
    this.mode = "all";
    this.visibleLimit = 24;
    this.closeSuggestions();
    this.setMode("all");
    e.searchInput.focus();
  }

  useQuery(query) {
    this.elements.searchInput.value = query;
    this.mode = "all";
    this.addHistory(query);
    this.closeSuggestions();
    this.setMode("all");
    this.render();
  }

  commitSearch() {
    const query = this.elements.searchInput.value.trim();
    if (!query) return;
    this.addHistory(query);
    this.closeSuggestions();
    this.render();
    this.elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  addHistory(query) {
    const clean = query.trim();
    if (clean.length < 2) return;

    this.history = [
      { query: clean, at: new Date().toISOString() },
      ...this.history.filter(item =>
        ArabicText.normalize(item.query) !== ArabicText.normalize(clean)
      )
    ].slice(0, 12);

    SafeStorage.set("rhel:history", this.history);
    this.renderHistory();
  }

  renderHistory() {
    const container = this.elements.recentSearchesList;
    container.innerHTML = "";

    if (!this.history.length) {
      container.innerHTML = '<p class="dialog-description">لا توجد عمليات بحث محفوظة حتى الآن.</p>';
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const item of this.history) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-item";
      button.dataset.historyQuery = item.query;

      const text = document.createElement("span");
      text.textContent = item.query;

      const time = document.createElement("time");
      time.dateTime = item.at;
      time.textContent = this.formatRelativeDate(item.at);

      button.append(text, time);
      fragment.appendChild(button);
    }

    container.appendChild(fragment);
  }

  formatRelativeDate(isoDate) {
    const date = new Date(isoDate);
    const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);

    if (diffMinutes < 1) return "الآن";
    if (diffMinutes < 60) return `قبل ${diffMinutes} د`;
    const hours = Math.round(diffMinutes / 60);
    if (hours < 24) return `قبل ${hours} س`;
    return date.toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
  }

  updateSuggestions() {
    if (!this.index) return;

    const query = this.elements.searchInput.value;
    this.suggestions = this.index.suggest(query);
    this.activeSuggestion = -1;
    this.renderSuggestions();
  }

  renderSuggestions() {
    const container = this.elements.suggestions;
    container.innerHTML = "";

    if (!this.suggestions.length) {
      this.closeSuggestions();
      return;
    }

    const fragment = document.createDocumentFragment();

    this.suggestions.forEach((suggestion, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "suggestion";
      button.role = "option";
      button.dataset.suggestionIndex = String(index);

      const main = document.createElement("span");
      main.innerHTML = `
        <strong>${ArabicText.highlight(suggestion.title, this.elements.searchInput.value)}</strong>
        <small>${ArabicText.escapeHtml(suggestion.category)}</small>
      `;

      const code = document.createElement("code");
      code.textContent = suggestion.command;

      button.append(main, code);
      button.addEventListener("mousedown", event => {
        event.preventDefault();
        this.selectSuggestion(index);
      });

      fragment.appendChild(button);
    });

    container.appendChild(fragment);
    container.hidden = false;
    this.elements.searchInput.setAttribute("aria-expanded", "true");
  }

  moveSuggestion(direction) {
    if (!this.suggestions.length) return;

    this.activeSuggestion =
      (this.activeSuggestion + direction + this.suggestions.length) %
      this.suggestions.length;

    this.elements.suggestions
      .querySelectorAll(".suggestion")
      .forEach((item, index) => {
        const active = index === this.activeSuggestion;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
        if (active) item.scrollIntoView({ block: "nearest" });
      });
  }

  selectSuggestion(index) {
    const suggestion = this.suggestions[index];
    if (!suggestion) return;
    this.useQuery(suggestion.title);
  }

  closeSuggestions() {
    this.suggestions = [];
    this.activeSuggestion = -1;
    this.elements.suggestions.hidden = true;
    this.elements.suggestions.innerHTML = "";
    this.elements.searchInput.setAttribute("aria-expanded", "false");
  }

  getResults() {
    const e = this.elements;
    const query = e.searchInput.value.trim();

    let items = this.index.search(query);

    items = items.filter(({ command }) => {
      if (this.mode === "favorites" && !this.favorites.has(command.id)) return false;
      if (e.categoryFilter.value !== "all" &&
          command.category !== e.categoryFilter.value) return false;
      if (e.riskFilter.value !== "all" &&
          command.risk !== e.riskFilter.value) return false;
      if (e.sudoFilter.value === "yes" && !command.requires_sudo) return false;
      if (e.sudoFilter.value === "no" && command.requires_sudo) return false;
      if (e.versionFilter.value !== "all" &&
          !(command.rhel_versions || []).includes(e.versionFilter.value)) return false;
      return true;
    });

    return this.sortResults(items, query);
  }

  sortResults(items, query) {
    const sort = this.elements.sortFilter.value;

    return items.sort((a, b) => {
      if (sort === "title") {
        return a.command.title_ar.localeCompare(b.command.title_ar, "ar");
      }

      if (sort === "risk") {
        return this.riskOrder[b.command.risk] - this.riskOrder[a.command.risk] ||
          a.command.title_ar.localeCompare(b.command.title_ar, "ar");
      }

      if (sort === "category") {
        const categoryA = this.data.categories[a.command.category] || "";
        const categoryB = this.data.categories[b.command.category] || "";
        return categoryA.localeCompare(categoryB, "ar") ||
          a.command.title_ar.localeCompare(b.command.title_ar, "ar");
      }

      if (query) {
        return b.score - a.score ||
          a.command.title_ar.localeCompare(b.command.title_ar, "ar");
      }

      return a.command.title_ar.localeCompare(b.command.title_ar, "ar");
    });
  }

  render() {
    if (!this.index || this.mode === "history") return;

    this.elements.clearSearchButton.hidden = !this.elements.searchInput.value;
    this.renderActiveFilters();
    this.renderResults();
  }

  renderResults() {
    const allResults = this.getResults();
    const visibleResults = allResults.slice(0, this.visibleLimit);
    const query = this.elements.searchInput.value.trim();

    this.elements.resultsGrid.innerHTML = "";
    this.elements.emptyState.hidden = allResults.length !== 0;
    this.elements.resultsGrid.hidden = allResults.length === 0;

    const modeTitle = this.mode === "favorites" ? "الأوامر المفضلة" : "كل الأوامر";
    this.elements.resultsEyebrow.textContent =
      this.mode === "favorites" ? "محفوظة على هذا الجهاز" :
      query ? "نتائج البحث" : "المعجم الكامل";

    this.elements.resultsTitle.textContent =
      query ? `نتائج: ${query}` : modeTitle;

    this.elements.resultsSummary.textContent =
      allResults.length === this.commands.length && this.mode === "all"
        ? `يعرض المعجم الكامل: ${allResults.length} أمراً وعملية`
        : `تم العثور على ${allResults.length} نتيجة`;

    const fragment = document.createDocumentFragment();
    for (const item of visibleResults) {
      fragment.appendChild(this.createCard(item.command, query));
    }

    this.elements.resultsGrid.appendChild(fragment);
    this.elements.loadMoreButton.hidden = visibleResults.length >= allResults.length;
    if (!this.elements.loadMoreButton.hidden) {
      this.elements.loadMoreButton.textContent =
        `عرض المزيد (${allResults.length - visibleResults.length} متبقية)`;
    }
  }

  createCard(command, query) {
    const node = this.elements.commandCardTemplate.content.cloneNode(true);
    const card = node.querySelector(".command-card");
    card.dataset.id = command.id;

    node.querySelector(".category-badge").textContent =
      this.data.categories[command.category] || command.category;

    node.querySelector(".command-title").innerHTML =
      ArabicText.highlight(command.title_ar, query);

    node.querySelector(".command-description").innerHTML =
      ArabicText.highlight(command.description_ar, query);

    node.querySelector(".command-code").textContent = command.command;

    const riskBadge = node.querySelector(".risk-badge");
    riskBadge.textContent = `الخطورة: ${this.riskLabels[command.risk] || command.risk}`;
    riskBadge.classList.add(`risk-${command.risk}`);

    const sudoBadge = node.querySelector(".sudo-badge");
    sudoBadge.textContent = command.requires_sudo ? "يحتاج sudo" : "بدون sudo";
    if (command.requires_sudo) sudoBadge.classList.add("requires-sudo");

    node.querySelector(".version-badge").textContent =
      `RHEL ${(command.rhel_versions || []).join(" / ")}`;

    const favoriteButton = node.querySelector(".favorite-button");
    const isFavorite = this.favorites.has(command.id);
    favoriteButton.classList.toggle("is-favorite", isFavorite);
    favoriteButton.textContent = isFavorite ? "★" : "☆";
    favoriteButton.setAttribute(
      "aria-label",
      isFavorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"
    );

    return node;
  }

  renderActiveFilters() {
    const e = this.elements;
    const chips = [];

    if (e.searchInput.value.trim()) {
      chips.push({ key: "search", label: `بحث: ${e.searchInput.value.trim()}` });
    }
    if (e.categoryFilter.value !== "all") {
      chips.push({
        key: "category",
        label: e.categoryFilter.options[e.categoryFilter.selectedIndex].text
      });
    }
    if (e.riskFilter.value !== "all") {
      chips.push({
        key: "risk",
        label: `الخطورة: ${e.riskFilter.options[e.riskFilter.selectedIndex].text}`
      });
    }
    if (e.sudoFilter.value !== "all") {
      chips.push({
        key: "sudo",
        label: e.sudoFilter.options[e.sudoFilter.selectedIndex].text
      });
    }
    if (e.versionFilter.value !== "all") {
      chips.push({
        key: "version",
        label: e.versionFilter.options[e.versionFilter.selectedIndex].text
      });
    }
    if (this.mode === "favorites") {
      chips.push({ key: "mode", label: "المفضلة فقط" });
    }

    e.activeFilters.hidden = chips.length === 0;
    e.activeFilters.innerHTML = chips.map(chip => `
      <span class="filter-chip">
        ${ArabicText.escapeHtml(chip.label)}
        <button type="button" data-remove-filter="${chip.key}" aria-label="إزالة الفلتر">×</button>
      </span>
    `).join("");
  }

  removeFilter(key) {
    const e = this.elements;
    if (key === "search") e.searchInput.value = "";
    if (key === "category") e.categoryFilter.value = "all";
    if (key === "risk") e.riskFilter.value = "all";
    if (key === "sudo") e.sudoFilter.value = "all";
    if (key === "version") e.versionFilter.value = "all";
    if (key === "mode") this.mode = "all";

    this.visibleLimit = 24;
    this.render();
  }

  toggleFavorite(id) {
    if (this.favorites.has(id)) {
      this.favorites.delete(id);
      this.showToast("تمت الإزالة من المفضلة");
    } else {
      this.favorites.add(id);
      this.showToast("تمت الإضافة إلى المفضلة");
    }

    SafeStorage.set("rhel:favorites", [...this.favorites]);
    this.updateFavoriteCount();
    this.render();
  }

  updateFavoriteCount() {
    this.elements.favoritesCount.textContent = this.favorites.size;
  }

  async copy(text, message) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    this.showToast(message);
  }

  showToast(message) {
    clearTimeout(this.toastTimer);
    this.elements.toast.textContent = message;
    this.elements.toast.classList.add("is-visible");

    this.toastTimer = setTimeout(() => {
      this.elements.toast.classList.remove("is-visible");
    }, 1800);
  }

  openDetails(command) {
    const category = this.data.categories[command.category] || command.category;
    const packages = command.required_packages?.length
      ? command.required_packages.join("، ")
      : "لا توجد حزمة إضافية محددة";

    const parts = command.parts_ar?.length
      ? `
        <h3>شرح أجزاء الأمر</h3>
        <ul class="detail-parts">
          ${command.parts_ar.map(part =>
            `<li>${ArabicText.escapeHtml(
              typeof part === "string" ? part : JSON.stringify(part)
            )}</li>`
          ).join("")}
        </ul>
      `
      : "";

    const note = command.notes_ar
      ? `<div class="detail-note"><strong>ملاحظة:</strong> ${ArabicText.escapeHtml(command.notes_ar)}</div>`
      : "";

    this.elements.dialogContent.innerHTML = `
      <div class="dialog-body">
        <span class="category-badge">${ArabicText.escapeHtml(category)}</span>
        <h2>${ArabicText.escapeHtml(command.title_ar)}</h2>
        <p class="dialog-description">${ArabicText.escapeHtml(command.description_ar)}</p>

        <code class="dialog-code">${ArabicText.escapeHtml(command.command)}</code>

        <div class="detail-grid">
          <div class="detail-item">
            <strong>مثال عملي</strong>
            <span><code>${ArabicText.escapeHtml(command.example || command.command)}</code></span>
          </div>
          <div class="detail-item">
            <strong>مستوى الخطورة</strong>
            <span>${ArabicText.escapeHtml(this.riskLabels[command.risk] || command.risk)}</span>
          </div>
          <div class="detail-item">
            <strong>الصلاحية</strong>
            <span>${command.requires_sudo ? "يتطلب sudo" : "لا يتطلب sudo"}</span>
          </div>
          <div class="detail-item">
            <strong>الإصدارات</strong>
            <span>RHEL ${ArabicText.escapeHtml((command.rhel_versions || []).join(" / "))}</span>
          </div>
          <div class="detail-item">
            <strong>الحزم المطلوبة</strong>
            <span>${ArabicText.escapeHtml(packages)}</span>
          </div>
          <div class="detail-item">
            <strong>معرّف العملية</strong>
            <span><code>${ArabicText.escapeHtml(command.id)}</code></span>
          </div>
        </div>

        ${note}
        ${parts}
      </div>
    `;

    if (typeof this.elements.commandDialog.showModal === "function") {
      this.elements.commandDialog.showModal();
    } else {
      this.elements.commandDialog.setAttribute("open", "");
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new RhelDictionaryApp();
});
