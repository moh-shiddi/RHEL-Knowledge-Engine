"use strict";

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
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional */ }
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
    "مشكله": ["خطا", "فشل", "troubleshooting", "diagnose"],
    "لايعمل": ["فشل", "متوقف", "failed"],
    "هارد": ["قرص", "تخزين", "disk"],
    "مساحه": ["حجم", "تخزين", "disk"],
    "رام": ["ذاكره", "memory"],
    "بورت": ["Port", "port"],
    "فايروول": ["جدار", "firewall"],
    "مستخدم": ["حساب", "user"],
    "قروب": ["مجموعه", "group"],
    "مجلد": ["دليل", "directory", "folder"],
    "بحث": ["find", "grep", "search"],
    "شبكه": ["اتصال", "network", "ip"],
    "انترنت": ["شبكه", "اتصال", "ping"],
    "صلاحيات": ["اذونات", "permission", "chmod", "chown"],
    "ضغط": ["ارشيف", "tar", "zip"],
    "فك": ["استخراج", "extract", "unzip"],
    "سيرفر": ["خادم", "server", "host"],
    "دخول": ["اتصال", "ssh", "login"],
    "شرح": ["Concept", "ماهو", "why", "concept"],
    "تعلم": ["مسار", "دوره", "learning", "path"],
    "امر": ["command", "syntax", "خيارات"]
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
    const tokens = ArabicText.normalize(value)
      .split(" ")
      .filter(token => token.length > 1 && !ArabicText.stopWords.has(token));

    if (!expand) return [...new Set(tokens)];
    const expanded = new Set(tokens);
    for (const token of tokens) {
      (ArabicText.synonyms.get(token) || []).forEach(item => expanded.add(item));
    }
    return [...expanded];
  }

  static escape(value = "") {
    const element = document.createElement("div");
    element.textContent = String(value);
    return element.innerHTML;
  }

  static highlight(value, query) {
    let output = ArabicText.escape(value);
    const tokens = ArabicText.tokenize(query, { expand: false })
      .sort((a, b) => b.length - a.length);

    for (const token of tokens) {
      const safe = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      output = output.replace(new RegExp(`(${safe})`, "giu"), "<mark>$1</mark>");
    }
    return output;
  }

  static collectStrings(value, output = []) {
    if (typeof value === "string") output.push(value);
    else if (Array.isArray(value)) value.forEach(item => ArabicText.collectStrings(item, output));
    else if (value && typeof value === "object") Object.values(value).forEach(item => ArabicText.collectStrings(item, output));
    return output;
  }
}

class KnowledgeIndex {
  constructor(entities, categories, types, entityById) {
    this.entities = entities;
    this.categories = categories;
    this.types = types;
    this.entityById = entityById;
    this.records = new Map();
    this.build();
  }

  build() {
    for (const entity of this.entities) {
      const category = this.categories[entity.category] || entity.category;
      const type = this.types[entity.entity_type] || entity.entity_type;
      const relatedTitles = (entity.related_entities || [])
        .map(id => this.entityById.get(id)?.title_ar || "")
        .join(" ");
      const moduleTitles = (entity.modules || [])
        .map(item => `${this.entityById.get(item.entity_id)?.title_ar || ""} ${item.objective_ar || ""}`)
        .join(" ");
      const allStrings = ArabicText.collectStrings(entity).join(" ");

      const record = {
        title: ArabicText.normalize(entity.title_ar),
        summary: ArabicText.normalize(entity.summary_ar),
        keywords: ArabicText.normalize((entity.keywords_ar || []).join(" ")),
        category: ArabicText.normalize(category),
        type: ArabicText.normalize(type),
        related: ArabicText.normalize(relatedTitles),
        modules: ArabicText.normalize(moduleTitles),
        all: ArabicText.normalize(allStrings)
      };
      this.records.set(entity.id, record);
    }
  }

  score(entity, query) {
    const normalizedQuery = ArabicText.normalize(query);
    if (!normalizedQuery) return 0;

    const rawTokens = ArabicText.tokenize(query, { expand: false });
    const expandedTokens = ArabicText.tokenize(query);
    const record = this.records.get(entity.id);
    let score = 0;

    if (record.title === normalizedQuery) score += 220;
    if (record.title.startsWith(normalizedQuery)) score += 120;
    if (record.title.includes(normalizedQuery)) score += 95;
    if (record.keywords.includes(normalizedQuery)) score += 75;
    if (record.summary.includes(normalizedQuery)) score += 58;
    if (record.type.includes(normalizedQuery)) score += 40;
    if (record.category.includes(normalizedQuery)) score += 32;
    if (record.all.includes(normalizedQuery)) score += 25;

    for (const token of rawTokens) {
      if (record.title.includes(token)) score += 34;
      if (record.keywords.includes(token)) score += 27;
      if (record.summary.includes(token)) score += 20;
      if (record.type.includes(token)) score += 16;
      if (record.category.includes(token)) score += 12;
      if (record.related.includes(token)) score += 10;
      if (record.modules.includes(token)) score += 9;
      if (record.all.includes(token)) score += 7;
    }

    const synonyms = expandedTokens.filter(token => !rawTokens.includes(token));
    for (const token of synonyms) {
      if (record.title.includes(token)) score += 14;
      if (record.keywords.includes(token)) score += 11;
      if (record.summary.includes(token)) score += 8;
      if (record.all.includes(token)) score += 4;
    }

    const matched = rawTokens.filter(token => record.all.includes(token)).length;
    if (rawTokens.length > 1 && matched === rawTokens.length) score += 65;
    return score;
  }

  search(query) {
    if (!ArabicText.normalize(query)) return this.entities.map(entity => ({ entity, score: 0 }));
    return this.entities
      .map(entity => ({ entity, score: this.score(entity, query) }))
      .filter(item => item.score > 0);
  }

  suggest(query, limit = 8) {
    if (ArabicText.normalize(query).length < 2) return [];
    return this.search(query)
      .sort((a, b) => b.score - a.score || a.entity.title_ar.localeCompare(b.entity.title_ar, "en"))
      .slice(0, limit)
      .map(item => item.entity);
  }
}

class KnowledgeEngineApp {
  constructor() {
    this.data = null;
    this.entities = [];
    this.entityById = new Map();
    this.index = null;
    this.intentData = null;
    this.intentEngine = null;
    this.doctorData = null;
    this.doctor = null;
    this.workflowRunner = null;
    this.executionDiagnosticData = null;
    this.executionDiagnosticEngine = null;
    this.searchAnalysis = null;
    this.dismissedIntentQuery = "";
    this.intentInputValues = {};
    this.view = "all";
    this.layout = SafeStorage.get("rhel-ke:layout", "grid");
    this.theme = SafeStorage.get("rhel-ke:theme", null) ||
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    this.favorites = new Set(SafeStorage.get("rhel-ke:favorites", []));
    this.taskProgress = SafeStorage.get("rhel-ke:task-progress", {});
    this.pathProgress = SafeStorage.get("rhel-ke:path-progress", {});
    this.currentEntity = null;
    this.currentVariables = {};
    this.entityHistory = [];
    this.entityReturnScrollY = 0;
    this.visibleLimit = 24;
    this.suggestions = [];
    this.activeSuggestion = -1;
    this.searchTimer = null;
    this.toastTimer = null;

    this.typeLabels = {
      task: "Practical Task",
      troubleshooting: "Troubleshooting",
      command: "Command references",
      concept: "Concept",
      learning_path: "Learning Path"
    };
    this.typeIcons = { task: "✓", troubleshooting: "⚕", command: ">_", concept: "◎", learning_path: "↗" };
    this.difficultyLabels = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
    this.difficultyOrder = { beginner: 1, intermediate: 2, advanced: 3 };
    this.riskLabels = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

    this.e = this.collectElements();
    this.applyTheme();
    this.attachEvents();
    this.loadData();
  }

  collectElements() {
    const ids = [
      "favoritesShortcut", "favoritesCount", "themeButton", "themeIcon",
      "searchInput", "clearSearchButton", "suggestions", "categoryFilter",
      "difficultyFilter", "versionFilter", "sortFilter", "resetFiltersButton",
      "resultsSection", "resultsEyebrow", "resultsTitle", "resultsSummary",
      "gridViewButton", "listViewButton", "activeFilters", "loadingState",
      "errorState", "emptyState", "emptyResetButton", "resultsGrid",
      "loadMoreButton", "entitiesMetric", "tasksMetric", "commandsMetric",
      "conceptsMetric", "pathsMetric", "intentsMetric", "workflowMetric", "intentPanel", "intentPanelContent", "taskTileCount", "troubleTileCount",
      "commandTileCount", "conceptTileCount", "pathTileCount", "schemaVersion",
      "toast", "entityDialog", "dialogBackButton", "closeDialogButton", "dialogFavoriteButton",
      "dialogPrimaryCopyButton", "shareEntityButton", "dialogContent",
      "entityCardTemplate"
    ];
    return Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  }

  applyTheme() {
    document.documentElement.dataset.theme = this.theme;
    const dark = this.theme === "dark";
    this.e.themeIcon.textContent = dark ? "☀" : "☾";
    this.e.themeButton.title = dark ? "Light mode" : "Dark mode";
    this.e.themeButton.setAttribute("aria-label", dark ? "Enable light mode" : "Enable dark mode");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0d1714" : "#0b6b50");
  }

  attachEvents() {
    this.e.themeButton.addEventListener("click", () => {
      this.theme = this.theme === "dark" ? "light" : "dark";
      SafeStorage.set("rhel-ke:theme", this.theme);
      this.applyTheme();
    });

    this.e.searchInput.addEventListener("input", () => {
      this.intentInputValues = {};
      this.dismissedIntentQuery = "";

      // The main search box is global. Do not let a previously selected
      // content type, category, level, or RHEL version hide valid commands.
      if (this.e.searchInput.value.trim()) this.activateGlobalSearchScope();

      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        this.visibleLimit = 24;
        this.updateSuggestions();
        this.render();
      }, 90);
    });
    this.e.searchInput.addEventListener("focus", () => this.updateSuggestions());
    this.e.searchInput.addEventListener("keydown", event => this.handleSearchKeyboard(event));

    this.e.clearSearchButton.addEventListener("click", () => {
      this.e.searchInput.value = "";
      this.intentInputValues = {};
      this.dismissedIntentQuery = "";
      this.closeSuggestions();
      this.render();
      this.e.searchInput.focus();
    });

    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        this.e.searchInput.focus();
        this.e.searchInput.select();
      }
    });
    document.addEventListener("click", event => {
      if (!event.target.closest(".search-wrapper")) this.closeSuggestions();
    });

    document.querySelectorAll("[data-query]").forEach(button => {
      button.addEventListener("click", () => this.useQuery(button.dataset.query));
    });


    document.querySelectorAll(".hero-rhcsa-button[data-open-entity]").forEach(button => {
      button.addEventListener("click", () => {
        const entityId = button.dataset.openEntity;
        const entity = this.entityById.get(entityId);
        if (entity) {
          this.openEntity(entity);
          return;
        }
        location.hash = `entity=${encodeURIComponent(entityId)}`;
      });
    });

    document.querySelectorAll("[data-type-view]").forEach(button => {
      button.addEventListener("click", () => this.setView(button.dataset.typeView, true));
    });

    document.querySelectorAll("[data-view]").forEach(button => {
      button.addEventListener("click", () => this.setView(button.dataset.view, true));
    });

    [this.e.categoryFilter, this.e.difficultyFilter, this.e.versionFilter, this.e.sortFilter]
      .forEach(select => select.addEventListener("change", () => {
        this.visibleLimit = 24;
        this.render();
      }));

    this.e.resetFiltersButton.addEventListener("click", () => this.reset());
    this.e.emptyResetButton.addEventListener("click", () => this.reset());
    this.e.favoritesShortcut.addEventListener("click", () => this.setView("favorites", true));
    this.e.gridViewButton.addEventListener("click", () => this.setLayout("grid"));
    this.e.listViewButton.addEventListener("click", () => this.setLayout("list"));
    this.e.loadMoreButton.addEventListener("click", () => {
      this.visibleLimit += 24;
      this.renderResults();
    });

    this.e.activeFilters.addEventListener("click", event => {
      const button = event.target.closest("[data-remove-filter]");
      if (button) this.removeFilter(button.dataset.removeFilter);
    });

    this.e.intentPanel.addEventListener("input", event => {
      const input = event.target.closest("[data-intent-variable]");
      if (input) this.intentInputValues[input.dataset.intentVariable] = input.value.trim();
    });
    this.e.intentPanel.addEventListener("click", event => this.handleIntentPanelClick(event));

    this.e.resultsGrid.addEventListener("click", event => this.handleCardClick(event));
    this.e.dialogBackButton.addEventListener("click", () => this.goBackFromEntity());
    this.e.closeDialogButton.addEventListener("click", () => this.closeDialog());
    this.e.entityDialog.addEventListener("cancel", event => {
      event.preventDefault();
      this.closeDialog();
    });
    this.e.dialogFavoriteButton.addEventListener("click", () => {
      if (this.currentEntity) this.toggleFavorite(this.currentEntity.id);
    });
    this.e.dialogPrimaryCopyButton.addEventListener("click", () => this.copyPrimaryContent());
    this.e.shareEntityButton.addEventListener("click", () => this.copyShareLink());
    this.e.dialogContent.addEventListener("input", event => this.handleDialogInput(event));
    this.e.dialogContent.addEventListener("change", event => this.handleDialogChange(event));
    this.e.dialogContent.addEventListener("click", event => this.handleDialogClick(event));
    this.e.entityDialog.addEventListener("click", event => {
      const rect = this.e.entityDialog.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) this.closeDialog();
    });

    window.addEventListener("hashchange", () => this.openEntityFromHash());
  }

  async loadData() {
    try {
      const [knowledgeResponse, intentResponse, doctorResponse, diagnosticResponse] = await Promise.all([
        fetch("knowledge-en.json?v=20260722-rhcsa-concepts25", { cache: "no-store" }),
        fetch("intents-en.json?v=20260722-rhcsa-search-en2", { cache: "no-store" }),
        fetch("doctor-data-en.json?v=20260722-rhcsa-search-en2", { cache: "no-store" }),
        fetch("diagnostic-patterns-en.json?v=20260722-rhcsa-search-en2", { cache: "no-store" })
      ]);
      if (!knowledgeResponse.ok) throw new Error(`knowledge.json HTTP ${knowledgeResponse.status}`);
      if (!intentResponse.ok) throw new Error(`intents.json HTTP ${intentResponse.status}`);
      if (!doctorResponse.ok) throw new Error(`doctor-data.json HTTP ${doctorResponse.status}`);
      if (!diagnosticResponse.ok) throw new Error(`diagnostic-patterns.json HTTP ${diagnosticResponse.status}`);
      this.data = await knowledgeResponse.json();
      this.intentData = await intentResponse.json();
      this.doctorData = await doctorResponse.json();
      this.executionDiagnosticData = await diagnosticResponse.json();
      if (!Array.isArray(this.data.entities)) throw new Error("Invalid knowledge schema");

      this.entities = this.data.entities;
      this.entityById = new Map(this.entities.map(entity => [entity.id, entity]));
      this.index = new KnowledgeIndex(this.entities, this.data.categories || {}, this.data.entity_types || this.typeLabels, this.entityById);
      this.intentEngine = new RhelIntentEngine(this.intentData, this.entities);
      this.doctor = new LinuxDoctor(this.doctorData, this);
      this.executionDiagnosticEngine = new ExecutionDiagnosticEngine(this.executionDiagnosticData);
      this.workflowRunner = new GuidedWorkflowRunner(this);

      this.populateCategories();
      this.updateMetrics();
      this.workflowRunner.updateDashboard();
      this.updateFavoriteCount();
      this.setLayout(this.layout, false);
      this.e.schemaVersion.textContent = `Schema ${this.data.schema_version || "—"}`;
      this.e.loadingState.hidden = true;
      this.render();
      this.openEntityFromHash();
    } catch (error) {
      console.error(error);
      this.e.loadingState.hidden = true;
      this.e.errorState.hidden = false;
    }
  }

  populateCategories() {
    Object.entries(this.data.categories || {})
      .sort((a, b) => a[1].localeCompare(b[1], "ar"))
      .forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        this.e.categoryFilter.appendChild(option);
      });
  }

  updateMetrics() {
    const counts = this.countByType();
    this.e.entitiesMetric.textContent = this.entities.length;
    this.e.tasksMetric.textContent = (counts.task || 0) + (counts.troubleshooting || 0);
    this.e.commandsMetric.textContent = counts.command || 0;
    this.e.conceptsMetric.textContent = counts.concept || 0;
    this.e.pathsMetric.textContent = counts.learning_path || 0;
    this.e.intentsMetric.textContent = this.intentData?.intents?.length || 0;
    this.e.taskTileCount.textContent = counts.task || 0;
    this.e.troubleTileCount.textContent = counts.troubleshooting || 0;
    this.e.commandTileCount.textContent = counts.command || 0;
    this.e.conceptTileCount.textContent = counts.concept || 0;
    this.e.pathTileCount.textContent = counts.learning_path || 0;
  }

  countByType() {
    return this.entities.reduce((acc, entity) => {
      acc[entity.entity_type] = (acc[entity.entity_type] || 0) + 1;
      return acc;
    }, {});
  }

  setLayout(layout, persist = true) {
    this.layout = layout;
    this.e.resultsGrid.classList.toggle("list-view", layout === "list");
    this.e.gridViewButton.classList.toggle("is-active", layout === "grid");
    this.e.listViewButton.classList.toggle("is-active", layout === "list");
    if (persist) SafeStorage.set("rhel-ke:layout", layout);
  }

  setView(view, scroll = false) {
    this.view = view;
    this.visibleLimit = 24;
    document.querySelectorAll("[data-view]").forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    this.render();
    if (scroll) this.e.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  activateGlobalSearchScope() {
    this.view = "all";
    this.e.categoryFilter.value = "all";
    this.e.difficultyFilter.value = "all";
    this.e.versionFilter.value = "all";
    this.e.sortFilter.value = "relevance";

    document.querySelectorAll("[data-view]").forEach(button => {
      const active = button.dataset.view === "all";
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  reset() {
    this.e.searchInput.value = "";
    this.e.categoryFilter.value = "all";
    this.e.difficultyFilter.value = "all";
    this.e.versionFilter.value = "all";
    this.e.sortFilter.value = "relevance";
    this.intentInputValues = {};
    this.dismissedIntentQuery = "";
    this.closeSuggestions();
    this.setView("all");
    this.e.searchInput.focus();
  }

  useQuery(query) {
    this.e.searchInput.value = query;
    this.intentInputValues = {};
    this.dismissedIntentQuery = "";
    this.closeSuggestions();
    this.activateGlobalSearchScope();
    this.render();
    this.e.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  updateSuggestions() {
    if (!this.index) return;
    const query = this.e.searchInput.value;
    const analysis = this.intentEngine?.analyze(query);
    const entitySuggestions = this.index.suggest(analysis?.searchQuery || query).map(entity => ({ kind: "entity", entity }));
    this.suggestions = [];
    if (analysis?.intent && analysis.confidence !== "low") this.suggestions.push({ kind: "intent", analysis });
    this.suggestions.push(...entitySuggestions.slice(0, Math.max(0, 8 - this.suggestions.length)));
    this.activeSuggestion = -1;
    this.renderSuggestions();
  }

  renderSuggestions() {
    this.e.suggestions.innerHTML = "";
    if (!this.suggestions.length) {
      this.closeSuggestions();
      return;
    }

    const fragment = document.createDocumentFragment();
    this.suggestions.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `suggestion ${item.kind === "intent" ? "intent-suggestion" : ""}`;
      button.dataset.suggestionIndex = String(index);
      if (item.kind === "intent") {
        const analysis = item.analysis;
        const targetTitle = analysis.target?.title_ar || "Show suggested results";
        button.innerHTML = `
          <span><strong>${ArabicText.escape(analysis.intent.icon || "⌁")} I understand that you want: ${ArabicText.escape(analysis.intent.title_ar)}</strong><small>${ArabicText.escape(targetTitle)}</small></span>
          <span class="suggestion-type">Smart intent</span>
        `;
      } else {
        const entity = item.entity;
        button.innerHTML = `
          <span><strong>${ArabicText.highlight(entity.title_ar, this.e.searchInput.value)}</strong><small>${ArabicText.escape(entity.summary_ar)}</small></span>
          <span class="suggestion-type">${ArabicText.escape(this.typeLabels[entity.entity_type] || entity.entity_type)}</span>
        `;
      }
      button.addEventListener("mousedown", event => {
        event.preventDefault();
        this.selectSuggestion(index);
      });
      fragment.appendChild(button);
    });
    this.e.suggestions.appendChild(fragment);
    this.e.suggestions.hidden = false;
    this.e.searchInput.setAttribute("aria-expanded", "true");
  }

  handleSearchKeyboard(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveSuggestion(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveSuggestion(-1);
    } else if (event.key === "Enter") {
      if (this.activeSuggestion >= 0) {
        event.preventDefault();
        this.selectSuggestion(this.activeSuggestion);
      } else {
        this.closeSuggestions();
        this.render();
      }
    } else if (event.key === "Escape") {
      this.closeSuggestions();
    }
  }

  moveSuggestion(direction) {
    if (!this.suggestions.length) return;
    this.activeSuggestion = (this.activeSuggestion + direction + this.suggestions.length) % this.suggestions.length;
    this.e.suggestions.querySelectorAll(".suggestion").forEach((item, index) => {
      item.classList.toggle("is-active", index === this.activeSuggestion);
      if (index === this.activeSuggestion) item.scrollIntoView({ block: "nearest" });
    });
  }

  selectSuggestion(index) {
    const item = this.suggestions[index];
    if (!item) return;
    this.closeSuggestions();
    if (item.kind === "intent") {
      this.searchAnalysis = item.analysis;
      this.openIntentTarget(item.analysis);
      this.render();
      return;
    }
    const entity = item.entity;
    this.e.searchInput.value = entity.title_ar;
    this.openEntity(entity);
    this.render();
  }

  closeSuggestions() {
    this.suggestions = [];
    this.activeSuggestion = -1;
    this.e.suggestions.hidden = true;
    this.e.suggestions.innerHTML = "";
    this.e.searchInput.setAttribute("aria-expanded", "false");
  }

  getResults() {
    const query = this.e.searchInput.value.trim();
    this.searchAnalysis = this.intentEngine?.analyze(query) || null;
    const effectiveQuery = this.searchAnalysis?.searchQuery || query;
    let items = this.index.search(effectiveQuery);

    // Direct command lookup: a query such as "pvcreate" must always return
    // cmd-pvcreate even if the command is nested inside an RHCSA module.
    if (query) {
      const normalizedQuery = ArabicText.normalize(query);
      const itemMap = new Map(items.map(item => [item.entity.id, item]));

      for (const entity of this.entities) {
        if (entity.entity_type !== "command") continue;

        const commandName = ArabicText.normalize(entity.command_name || "");
        const entityIdCommand = ArabicText.normalize(
          String(entity.id || "").replace(/^cmd-/, "")
        );
        const syntaxCommand = ArabicText.normalize(
          String(entity.syntax || "").trim().split(/\s+/)[0] || ""
        );

        if (
          normalizedQuery === commandName ||
          normalizedQuery === entityIdCommand ||
          normalizedQuery === syntaxCommand
        ) {
          const existing = itemMap.get(entity.id);
          if (existing) {
            existing.score = Math.max(existing.score, 2000);
          } else {
            const item = { entity, score: 2000 };
            items.push(item);
            itemMap.set(entity.id, item);
          }
        }
      }
    }

    if (this.searchAnalysis?.intent) {
      const itemMap = new Map(items.map(item => [item.entity.id, item]));
      for (const id of this.searchAnalysis.intent.target_entities || []) {
        const entity = this.entityById.get(id);
        if (entity && !itemMap.has(id)) {
          const item = { entity, score: 0 };
          items.push(item);
          itemMap.set(id, item);
        }
      }
      for (const item of items) item.score += this.intentEngine.scoreEntity(item.entity, this.searchAnalysis);
    }

    items = items.filter(({ entity }) => {
      if (this.view === "favorites" && !this.favorites.has(entity.id)) return false;
      if (this.view !== "all" && this.view !== "favorites" && entity.entity_type !== this.view) return false;
      if (this.e.categoryFilter.value !== "all" && entity.category !== this.e.categoryFilter.value) return false;
      if (this.e.difficultyFilter.value !== "all" && entity.difficulty !== this.e.difficultyFilter.value) return false;
      if (this.e.versionFilter.value !== "all" && !(entity.supported_versions || []).includes(this.e.versionFilter.value)) return false;
      return true;
    });

    return this.sortResults(items, query);
  }

  sortResults(items, query) {
    const sort = this.e.sortFilter.value;
    return items.sort((a, b) => {
      if (sort === "title") return a.entity.title_ar.localeCompare(b.entity.title_ar, "en");
      if (sort === "type") return (this.typeLabels[a.entity.entity_type] || "").localeCompare(this.typeLabels[b.entity.entity_type] || "", "ar") || a.entity.title_ar.localeCompare(b.entity.title_ar, "en");
      if (sort === "difficulty") return (this.difficultyOrder[a.entity.difficulty] || 9) - (this.difficultyOrder[b.entity.difficulty] || 9) || a.entity.title_ar.localeCompare(b.entity.title_ar, "en");
      if (sort === "relations") return (b.entity.related_entities?.length || 0) - (a.entity.related_entities?.length || 0) || a.entity.title_ar.localeCompare(b.entity.title_ar, "en");
      if (query) return b.score - a.score || a.entity.title_ar.localeCompare(b.entity.title_ar, "en");
      const typeOrder = { learning_path: 1, troubleshooting: 2, task: 3, concept: 4, command: 5 };
      return (typeOrder[a.entity.entity_type] || 9) - (typeOrder[b.entity.entity_type] || 9) || a.entity.title_ar.localeCompare(b.entity.title_ar, "en");
    });
  }

  render() {
    if (!this.index) return;
    this.e.clearSearchButton.hidden = !this.e.searchInput.value;
    this.renderActiveFilters();
    this.renderResults();
    this.renderIntentPanel();
  }

  renderResults() {
    const all = this.getResults();
    const visible = all.slice(0, this.visibleLimit);
    const query = this.e.searchInput.value.trim();

    this.e.resultsGrid.innerHTML = "";
    this.e.emptyState.hidden = all.length !== 0;
    this.e.resultsGrid.hidden = all.length === 0;

    const viewTitle = this.view === "all" ? "All content" : this.view === "favorites" ? "Favorites" : this.typeLabels[this.view];
    this.e.resultsEyebrow.textContent = query ? (this.searchAnalysis?.intent ? "Results ranked by intent" : "Unified search results") : "Knowledge graph";
    this.e.resultsTitle.textContent = query ? `Results: ${query}` : viewTitle;
    const intentSummary = this.searchAnalysis?.intent ? ` — Detected intent: ${this.searchAnalysis.intent.title_ar}` : "";
    this.e.resultsSummary.textContent = `Found ${all.length} results out of ${this.entities.length}${intentSummary}`;

    const fragment = document.createDocumentFragment();
    visible.forEach(({ entity }) => fragment.appendChild(this.createCard(entity, query)));
    this.e.resultsGrid.appendChild(fragment);

    this.e.loadMoreButton.hidden = visible.length >= all.length;
    if (!this.e.loadMoreButton.hidden) this.e.loadMoreButton.textContent = `Show more (${all.length - visible.length} remaining)`;
  }

  createCard(entity, query) {
    const node = this.e.entityCardTemplate.content.cloneNode(true);
    const card = node.querySelector(".entity-card");
    card.dataset.id = entity.id;
    card.dataset.type = entity.entity_type;

    const typeBadge = node.querySelector(".type-badge");
    typeBadge.textContent = `${this.typeIcons[entity.entity_type] || "•"} ${this.typeLabels[entity.entity_type] || entity.entity_type}`;
    typeBadge.classList.add(`type-${entity.entity_type}`);
    node.querySelector(".category-badge").textContent = this.data.categories[entity.category] || entity.category;
    node.querySelector(".entity-title").innerHTML = ArabicText.highlight(entity.title_ar, query);
    node.querySelector(".entity-summary").innerHTML = ArabicText.highlight(entity.summary_ar, query);

    const favorite = node.querySelector(".favorite-button");
    const isFavorite = this.favorites.has(entity.id);
    favorite.classList.toggle("is-favorite", isFavorite);
    favorite.textContent = isFavorite ? "★" : "☆";
    favorite.setAttribute("aria-label", isFavorite ? "Remove from favorites" : "Add to favorites");

    node.querySelector(".entity-meta").innerHTML = this.cardMeta(entity);
    node.querySelector(".entity-preview").innerHTML = this.cardPreview(entity);
    const quick = node.querySelector(".quick-action-button");
    quick.textContent = this.quickActionLabel(entity);
    if (["concept", "learning_path"].includes(entity.entity_type)) quick.hidden = true;
    return node;
  }

  cardMeta(entity) {
    const badges = [`<span class="meta-badge">${ArabicText.escape(this.difficultyLabels[entity.difficulty] || entity.difficulty)}</span>`];
    if (entity.risk) badges.push(`<span class="risk-badge risk-${entity.risk}">Risk ${ArabicText.escape(this.riskLabels[entity.risk] || entity.risk)}</span>`);
    if (["task", "troubleshooting"].includes(entity.entity_type)) {
      badges.push(`<span class="meta-badge">${entity.estimated_minutes || 0} minutes</span>`);
      badges.push(`<span class="meta-badge">${entity.steps?.length || 0} steps</span>`);
    }
    if (entity.entity_type === "command") badges.push(`<span class="meta-badge">${entity.examples?.length || 0} examples</span>`);
    if (entity.entity_type === "concept") badges.push(`<span class="meta-badge">${entity.key_points_ar?.length || 0} points</span>`);
    if (entity.entity_type === "learning_path") badges.push(`<span class="meta-badge">${entity.estimated_hours || 0} hours</span><span class="meta-badge">${entity.modules?.length || 0} modules</span>`);
    badges.push(`<span class="meta-badge">${entity.related_entities?.length || 0} links</span>`);
    return badges.join("");
  }

  cardPreview(entity) {
    if (["task", "troubleshooting"].includes(entity.entity_type)) {
      const first = entity.steps?.[0];
      return first ? `<code>${ArabicText.escape(first.command)}</code><p>${ArabicText.escape(first.title_ar)}</p>` : "";
    }
    if (entity.entity_type === "command") return `<code>${ArabicText.escape(entity.syntax || entity.command_name)}</code><p>${ArabicText.escape(entity.purpose_ar || "")}</p>`;
    if (entity.entity_type === "concept") return `<ul>${(entity.key_points_ar || []).slice(0, 2).map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul>`;
    if (entity.entity_type === "learning_path") {
      const modules = (entity.modules || []).slice(0, 3).map(item => this.entityById.get(item.entity_id)?.title_ar || item.objective_ar);
      return `<ul>${modules.map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul>`;
    }
    return "";
  }

  quickActionLabel(entity) {
    if (["task", "troubleshooting"].includes(entity.entity_type)) return "Start workflow";
    if (entity.entity_type === "command") return "Copy syntax";
    return "";
  }

  handleCardClick(event) {
    const card = event.target.closest(".entity-card");
    if (!card) return;
    const entity = this.entityById.get(card.dataset.id);
    if (!entity) return;

    if (event.target.closest(".favorite-button")) this.toggleFavorite(entity.id);
    else if (event.target.closest(".quick-action-button")) this.quickAction(entity);
    else if (event.target.closest(".open-entity-button") || event.target.closest(".entity-title")) this.openEntity(entity);
  }

  quickAction(entity) {
    if (["task", "troubleshooting"].includes(entity.entity_type)) this.workflowRunner?.start(entity, { variables: {}, resume: true });
    else if (entity.entity_type === "command") this.copy(entity.syntax || entity.command_name, "Syntax copied");
  }

  renderActiveFilters() {
    const chips = [];
    if (this.e.searchInput.value.trim()) chips.push({ key: "search", label: `Search: ${this.e.searchInput.value.trim()}` });
    if (this.view !== "all") chips.push({ key: "view", label: this.view === "favorites" ? "Favorites" : this.typeLabels[this.view] });
    if (this.e.categoryFilter.value !== "all") chips.push({ key: "category", label: this.e.categoryFilter.options[this.e.categoryFilter.selectedIndex].text });
    if (this.e.difficultyFilter.value !== "all") chips.push({ key: "difficulty", label: this.e.difficultyFilter.options[this.e.difficultyFilter.selectedIndex].text });
    if (this.e.versionFilter.value !== "all") chips.push({ key: "version", label: this.e.versionFilter.options[this.e.versionFilter.selectedIndex].text });

    this.e.activeFilters.hidden = chips.length === 0;
    this.e.activeFilters.innerHTML = chips.map(chip => `<span class="filter-chip">${ArabicText.escape(chip.label)}<button type="button" data-remove-filter="${chip.key}" aria-label="Remove filter">×</button></span>`).join("");
  }

  removeFilter(key) {
    if (key === "search") this.e.searchInput.value = "";
    if (key === "view") this.view = "all";
    if (key === "category") this.e.categoryFilter.value = "all";
    if (key === "difficulty") this.e.difficultyFilter.value = "all";
    if (key === "version") this.e.versionFilter.value = "all";
    this.visibleLimit = 24;
    this.render();
  }

  toggleFavorite(id) {
    if (this.favorites.has(id)) {
      this.favorites.delete(id);
      this.showToast("Removed from favorites");
    } else {
      this.favorites.add(id);
      this.showToast("Added to favorites");
    }
    SafeStorage.set("rhel-ke:favorites", [...this.favorites]);
    this.updateFavoriteCount();
    this.render();
    if (this.currentEntity?.id === id) this.updateDialogFavoriteButton();
  }

  updateFavoriteCount() { this.e.favoritesCount.textContent = this.favorites.size; }

  openEntity(entity, { updateHash = true, initialVariables = {}, rememberCurrent = true } = {}) {
    const dialogWasOpen = Boolean(this.e.entityDialog.open || this.e.entityDialog.hasAttribute("open"));
    const movingToAnotherEntity = Boolean(
      dialogWasOpen &&
      this.currentEntity &&
      this.currentEntity.id !== entity.id
    );

    if (!dialogWasOpen) {
      this.entityHistory = [];
      this.entityReturnScrollY = window.scrollY;
    } else if (movingToAnotherEntity && rememberCurrent) {
      this.entityHistory.push({
        id: this.currentEntity.id,
        variables: { ...this.currentVariables },
        scrollTop: this.e.entityDialog.scrollTop
      });
    }

    this.currentEntity = entity;
    this.currentVariables = {
      ...initialVariables,
      ...Object.fromEntries((entity.variables || []).map(variable => [
        variable.name,
        initialVariables[variable.name] || ""
      ]))
    };

    this.e.dialogContent.innerHTML = this.renderEntity(entity);
    this.configureDialogActions(entity);
    this.updateDialogFavoriteButton();
    this.updateDialogBackButton();

    if (typeof this.e.entityDialog.showModal === "function" && !this.e.entityDialog.open) {
      this.e.entityDialog.showModal();
    } else {
      this.e.entityDialog.setAttribute("open", "");
    }

    requestAnimationFrame(() => {
      this.e.entityDialog.scrollTop = 0;
    });

    if (updateHash) {
      history.replaceState(null, "", `#entity=${encodeURIComponent(entity.id)}`);
    }
  }

  updateDialogBackButton() {
    if (!this.e.dialogBackButton) return;

    const previous = this.entityHistory.at(-1);
    if (previous) {
      const previousEntity = this.entityById.get(previous.id);
      const previousTitle = previousEntity?.title_ar || previous.id;
      this.e.dialogBackButton.title = `Back to ${previousTitle}`;
      this.e.dialogBackButton.setAttribute(
        "aria-label",
        `Back to ${previousTitle}`
      );
    } else {
      this.e.dialogBackButton.title = "Back to the results list";
      this.e.dialogBackButton.setAttribute("aria-label", "Back to the results list");
    }
  }

  goBackFromEntity() {
    const previous = this.entityHistory.pop();

    if (previous) {
      const previousEntity = this.entityById.get(previous.id);
      if (previousEntity) {
        this.openEntity(previousEntity, {
          updateHash: true,
          initialVariables: previous.variables || {},
          rememberCurrent: false
        });

        requestAnimationFrame(() => {
          this.e.entityDialog.scrollTop = Number(previous.scrollTop) || 0;
        });
        return;
      }
    }

    this.closeDialog();
  }

  closeDialog() {
    const returnScrollY = this.entityReturnScrollY;

    if (this.e.entityDialog.open && typeof this.e.entityDialog.close === "function") {
      this.e.entityDialog.close();
    } else {
      this.e.entityDialog.removeAttribute("open");
    }

    this.currentEntity = null;
    this.currentVariables = {};
    this.entityHistory = [];
    this.updateDialogBackButton();

    if (location.hash.startsWith("#entity=")) {
      history.replaceState(null, "", location.pathname + location.search);
    }

    requestAnimationFrame(() => {
      window.scrollTo({ top: returnScrollY, behavior: "auto" });
    });
  }

  openEntityFromHash() {
    const match = location.hash.match(/^#entity=(.+)$/);
    if (!match || !this.entityById.size) return;
    const entity = this.entityById.get(decodeURIComponent(match[1]));
    if (entity && this.currentEntity?.id !== entity.id) {
      this.openEntity(entity, { updateHash: false, rememberCurrent: false });
    }
  }

  configureDialogActions(entity) {
    const copyable = ["task", "troubleshooting", "command"].includes(entity.entity_type);
    this.e.dialogPrimaryCopyButton.hidden = !copyable;
    this.e.dialogPrimaryCopyButton.textContent = entity.entity_type === "command" ? "Copy examples" : "Copy all commands";
  }

  updateDialogFavoriteButton() {
    if (!this.currentEntity) return;
    const favorite = this.favorites.has(this.currentEntity.id);
    this.e.dialogFavoriteButton.textContent = favorite ? "★ Favorited" : "☆ Favorite";
  }

  renderEntity(entity) {
    const header = this.renderEntityHeader(entity);
    let body = "";
    if (["task", "troubleshooting"].includes(entity.entity_type)) body = this.renderTask(entity);
    else if (entity.entity_type === "command") body = this.renderCommandReference(entity);
    else if (entity.entity_type === "concept") body = this.renderConcept(entity);
    else if (entity.entity_type === "learning_path") body = this.renderLearningPath(entity);
    return `<div class="dialog-body">${header}${body}${this.renderKnowledgeGraph(entity)}</div>`;
  }

  renderEntityHeader(entity) {
    const category = this.data.categories[entity.category] || entity.category;
    const meta = [
      ["Type", this.typeLabels[entity.entity_type] || entity.entity_type],
      ["Category", category],
      ["Level", this.difficultyLabels[entity.difficulty] || entity.difficulty],
      ["Versions", `RHEL ${(entity.supported_versions || []).join(" / ")}`],
      ["Status", entity.status === "verified" ? "Verified" : entity.status === "reviewed" ? "Reviewed" : "Draft"]
    ];
    if (entity.risk) meta.splice(3, 0, ["Risk", this.riskLabels[entity.risk] || entity.risk]);
    return `
      <section class="entity-hero">
        <div>
          <div class="entity-card__badges"><span class="type-badge type-${entity.entity_type}">${this.typeIcons[entity.entity_type] || "•"} ${ArabicText.escape(this.typeLabels[entity.entity_type] || entity.entity_type)}</span><span class="category-badge">${ArabicText.escape(category)}</span></div>
          <h2>${ArabicText.escape(entity.title_ar)}</h2>
          <p>${ArabicText.escape(entity.summary_ar)}</p>
        </div>
        <div class="entity-hero__meta">${meta.map(([label, value]) => `<div class="info-pill"><span>${ArabicText.escape(label)}</span><strong>${ArabicText.escape(value)}</strong></div>`).join("")}</div>
      </section>
    `;
  }

  renderTask(task) {
    const workflowSession = this.workflowRunner?.sessions?.[task.id];
    const workflowProgress = workflowSession && this.workflowRunner
      ? this.workflowRunner.progress(task, workflowSession)
      : 0;
    const workflowLabel = workflowSession
      ? (workflowSession.state === "completed" ? "Restart workflow" : "Resume workflow")
      : "Start guided workflow";
    return `
      <section class="guided-workflow-entry">
        <div>
          <span class="eyebrow">Guided Workflow</span>
          <h3>Run this task as a guided workflow</h3>
          <p>It reviews prerequisites, presents one step at a time, and saves verification results and the final report.</p>
          ${workflowSession ? `<div class="guided-workflow-entry__progress"><span>Saved progress</span><div><i style="width:${workflowProgress}%"></i></div><b>${workflowProgress}%</b></div>` : ""}
        </div>
        <button type="button" data-start-guided-workflow>${workflowLabel}</button>
      </section>
      ${task.goal_ar ? `<section class="dialog-section"><div class="callout"><strong>Objective:</strong> ${ArabicText.escape(task.goal_ar)}</div></section>` : ""}
      ${this.renderPrerequisites(task)}
      ${this.renderVariables(task)}
      ${this.renderTaskProgress(task)}
      ${this.renderSteps(task)}
      ${this.renderVerification(task)}
      ${this.renderErrors(task)}
      ${this.renderResources(task)}
      ${this.renderRollback(task)}
      ${this.renderSafety(task)}
    `;
  }

  renderPrerequisites(task) {
    if (!(task.prerequisites_ar || []).length) return "";
    return `<section class="dialog-section"><div class="dialog-section__heading"><h3>Before you begin</h3></div><ul class="bullet-list">${task.prerequisites_ar.map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul></section>`;
  }

  renderVariables(task) {
    if (!(task.variables || []).length) return "";
    return `
      <section class="dialog-section">
        <div class="dialog-section__heading"><h3>Task inputs</h3><span class="section-note">Commands update automatically when values are entered</span></div>
        <div class="variables-grid">${task.variables.map(variable => `
          <label class="variable-field"><span>${ArabicText.escape(variable.label_ar)}</span><input type="text" data-variable="${ArabicText.escape(variable.name)}" placeholder="Example: ${ArabicText.escape(variable.example || "")}" value="${ArabicText.escape(this.currentVariables[variable.name] || "")}" autocomplete="off"></label>
        `).join("")}</div>
      </section>
    `;
  }

  renderTaskProgress(task) {
    const required = (task.steps || []).filter(step => !step.optional);
    const completed = this.getTaskProgress(task.id);
    const completeCount = required.filter(step => completed.has(step.id)).length;
    const percent = required.length ? Math.round(completeCount / required.length * 100) : 0;
    return `<section class="dialog-section"><div class="progress-panel"><div class="progress-panel__header"><span>Execution progress</span><span id="taskProgressText">${completeCount} of ${required.length} — ${percent}%</span></div><div class="progress-track"><div id="taskProgressBar" class="progress-bar" style="width:${percent}%"></div></div></div></section>`;
  }

  renderSteps(task) {
    const completed = this.getTaskProgress(task.id);
    return `
      <section class="dialog-section">
        <div class="dialog-section__heading"><h3>Execution steps</h3><span class="section-note">${task.steps?.length || 0} steps</span></div>
        <div class="steps-list">${(task.steps || []).map((step, index) => {
          const resolved = this.resolveCommand(step.command);
          return `<article class="step-card ${completed.has(step.id) ? "is-complete" : ""}" data-step-card="${ArabicText.escape(step.id)}">
            <input class="step-check" type="checkbox" data-task-step="${ArabicText.escape(step.id)}" ${completed.has(step.id) ? "checked" : ""} aria-label="Mark step complete">
            <div><h4>${index + 1}. ${ArabicText.escape(step.title_ar)} ${step.optional ? '<span class="meta-badge">Optional</span>' : ""}</h4><p>${ArabicText.escape(step.explanation_ar)}</p><div class="command-box"><code data-command-template="${ArabicText.escape(step.command)}">${ArabicText.escape(resolved)}</code><button class="command-copy" type="button" data-copy-command="${ArabicText.escape(step.id)}">Copy</button></div>${step.expected_result_ar ? `<div class="expected-result"><strong>Expected result:</strong> ${ArabicText.escape(step.expected_result_ar)}</div>` : ""}${step.notes_ar ? `<div class="expected-result"><strong>Note:</strong> ${ArabicText.escape(step.notes_ar)}</div>` : ""}</div>
          </article>`;
        }).join("")}</div>
      </section>
    `;
  }

  renderVerification(task) {
    if (!(task.verification || []).length) return "";
    return `<section class="dialog-section"><div class="dialog-section__heading"><h3>Post-execution verification</h3></div><div class="verification-list">${task.verification.map((item, index) => `<article class="verification-item"><h4>${ArabicText.escape(item.title_ar)}</h4><code data-verification-template="${ArabicText.escape(item.command)}">${ArabicText.escape(this.resolveCommand(item.command))}</code><p><strong>Expected:</strong> ${ArabicText.escape(item.expected_result_ar)}</p><button class="text-button" type="button" data-copy-verification="${index}">Copy verification command</button></article>`).join("")}</div></section>`;
  }

  renderErrors(task) {
    if (!(task.common_errors || []).length) return "";
    return `<section class="dialog-section"><div class="dialog-section__heading"><h3>Common errors</h3></div><div class="error-list">${task.common_errors.map(error => `<article class="error-item"><h4>${ArabicText.escape(error.symptom_ar)}</h4><p><strong>Likely causes:</strong></p><ul>${(error.likely_causes_ar || []).map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul>${(error.checks || []).map((check, index) => `<div class="error-check"><strong>${ArabicText.escape(check.title_ar)}</strong><code>${ArabicText.escape(this.resolveCommand(check.command))}</code><small>${ArabicText.escape(check.expected_result_ar)}</small><button class="text-button" type="button" data-copy-error-check="${ArabicText.escape(check.command)}">Copy check</button></div>`).join("")}${(error.fixes_ar || []).length ? `<p><strong>Suggested remediation:</strong></p><ul>${error.fixes_ar.map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul>` : ""}</article>`).join("")}</div></section>`;
  }

  renderResources(task) {
    const files = task.files || [];
    const ports = task.ports || [];
    if (!files.length && !ports.length) return "";
    return `<section class="dialog-section"><div class="dialog-section__heading"><h3>Related resources</h3></div><div class="resource-grid">${files.map(file => `<article class="resource-card"><strong>File or path</strong><code>${ArabicText.escape(file)}</code></article>`).join("")}${ports.map(port => `<article class="resource-card"><strong>Port ${port.port}/${ArabicText.escape(port.protocol)}</strong><p>${ArabicText.escape(port.purpose_ar)}</p></article>`).join("")}</div></section>`;
  }

  renderRollback(task) {
    if (!(task.rollback_ar || []).length) return "";
    return `<section class="dialog-section"><div class="dialog-section__heading"><h3>Rollback</h3></div><div class="callout callout--warning"><ul class="rollback-list">${task.rollback_ar.map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul></div></section>`;
  }

  renderSafety(task) {
    if (!(task.safety_notes_ar || []).length) return "";
    return `<section class="dialog-section"><div class="dialog-section__heading"><h3>Safety notes</h3></div><div class="callout callout--danger"><ul class="rollback-list">${task.safety_notes_ar.map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul></div></section>`;
  }

  renderCommandReference(entity) {
    return `
      <section class="dialog-section"><div class="dialog-section__heading"><h3>General syntax</h3></div><code class="syntax-box">${ArabicText.escape(entity.syntax || entity.command_name)}</code>${entity.provided_by ? `<p class="section-note">Provided by package: <code>${ArabicText.escape(entity.provided_by)}</code></p>` : ""}</section>
      <section class="dialog-section"><div class="dialog-section__heading"><h3>What does it do?</h3></div><div class="callout">${ArabicText.escape(entity.purpose_ar || entity.summary_ar)}</div></section>
      ${(entity.options || []).length ? `<section class="dialog-section"><div class="dialog-section__heading"><h3>Important options and actions</h3></div><div class="option-list">${entity.options.map(item => `<article class="option-item"><code>${ArabicText.escape(item.option)}</code><div><strong>${ArabicText.escape(item.description_ar)}</strong>${item.example ? `<p><code>${ArabicText.escape(item.example)}</code></p>` : ""}</div></article>`).join("")}</div></section>` : ""}
      ${(entity.examples || []).length ? `<section class="dialog-section"><div class="dialog-section__heading"><h3>Practical examples</h3></div><div class="examples-grid">${entity.examples.map((item, index) => `<article class="example-card"><h4>${ArabicText.escape(item.title_ar)}</h4><p>${ArabicText.escape(item.explanation_ar)}</p><div class="command-box"><code>${ArabicText.escape(item.command)}</code><button class="command-copy" type="button" data-copy-command-example="${index}">Copy</button></div></article>`).join("")}</div></section>` : ""}
      ${(entity.common_mistakes_ar || []).length ? `<section class="dialog-section"><div class="dialog-section__heading"><h3>Common mistakes</h3></div><div class="callout callout--warning"><ul class="rollback-list">${entity.common_mistakes_ar.map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul></div></section>` : ""}
    `;
  }

  renderConcept(entity) {
    return `
      <section class="dialog-section"><div class="dialog-section__heading"><h3>Definition</h3></div><div class="callout">${ArabicText.escape(entity.definition_ar || entity.summary_ar)}</div></section>
      <section class="dialog-section"><div class="dialog-section__heading"><h3>Why it matters</h3></div><p>${ArabicText.escape(entity.why_it_matters_ar || "")}</p></section>
      ${(entity.mental_model_ar || "") ? `<section class="dialog-section"><div class="dialog-section__heading"><h3>Mental model</h3></div><div class="mental-model">${ArabicText.escape(entity.mental_model_ar)}</div></section>` : ""}
      ${(entity.key_points_ar || []).length ? `<section class="dialog-section"><div class="dialog-section__heading"><h3>Key points</h3></div><div class="concept-grid">${entity.key_points_ar.map((item, index) => `<article class="concept-card"><h4>${index + 1}</h4><p>${ArabicText.escape(item)}</p></article>`).join("")}</div></section>` : ""}
      ${(entity.misconceptions_ar || []).length ? `<section class="dialog-section"><div class="dialog-section__heading"><h3>Common misconceptions</h3></div><div class="callout callout--warning"><ul class="rollback-list">${entity.misconceptions_ar.map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul></div></section>` : ""}
    `;
  }

  renderLearningPath(entity) {
    const completed = this.getPathProgress(entity.id);
    const modules = entity.modules || [];
    const completedCount = modules.filter(item => completed.has(item.entity_id)).length;
    const percent = modules.length ? Math.round(completedCount / modules.length * 100) : 0;
    return `
      <section class="dialog-section"><div class="callout"><strong>Path description:</strong> ${ArabicText.escape(entity.description_ar || entity.summary_ar)}</div></section>
      <section class="dialog-section"><div class="progress-panel"><div class="progress-panel__header"><span>Learning-path progress</span><span id="pathProgressText">${completedCount} of ${modules.length} — ${percent}%</span></div><div class="progress-track"><div id="pathProgressBar" class="progress-bar" style="width:${percent}%"></div></div></div></section>
      <section class="dialog-section"><div class="dialog-section__heading"><h3>Path modules</h3><span class="section-note">Estimated duration ${entity.estimated_hours || 0} hours</span></div><div class="module-list">${modules.map((item, index) => {
        const target = this.entityById.get(item.entity_id);
        const done = completed.has(item.entity_id);
        return `<article class="module-item ${done ? "is-complete" : ""}" data-module-card="${ArabicText.escape(item.entity_id)}"><span class="module-number">${index + 1}</span><div><h4>${ArabicText.escape(target?.title_ar || item.entity_id)} ${item.optional ? '<span class="meta-badge">Optional</span>' : ""}</h4><p>${ArabicText.escape(item.objective_ar)}</p></div><div class="module-actions"><label><input type="checkbox" data-path-module="${ArabicText.escape(item.entity_id)}" ${done ? "checked" : ""}> Done</label><button type="button" data-open-entity="${ArabicText.escape(item.entity_id)}" ${target ? "" : "disabled"}>Open</button></div></article>`;
      }).join("")}</div></section>
      ${(entity.outcomes_ar || []).length ? `<section class="dialog-section"><div class="dialog-section__heading"><h3>What will you learn?</h3></div><ul class="bullet-list">${entity.outcomes_ar.map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul></section>` : ""}
    `;
  }

  renderKnowledgeGraph(entity) {
    const related = this.getRelatedEntities(entity, 8);
    if (!related.length) return "";
    const width = 760, height = 390, cx = 380, cy = 195, radius = 145;
    const nodes = related.map((item, index) => {
      const angle = -Math.PI / 2 + index * (2 * Math.PI / related.length);
      return { entity: item, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
    const lines = nodes.map(node => `<line class="graph-line" x1="${cx}" y1="${cy}" x2="${node.x.toFixed(1)}" y2="${node.y.toFixed(1)}"></line>`).join("");
    const relatedNodes = nodes.map(node => this.svgNode(node.entity, node.x, node.y, false)).join("");
    const centerNode = this.svgNode(entity, cx, cy, true);
    return `
      <section class="dialog-section">
        <div class="dialog-section__heading"><h3>Knowledge map</h3><span class="section-note">Select a node to open it</span></div>
        <div class="graph-wrap"><svg class="knowledge-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="Relationships for ${ArabicText.escape(entity.title_ar)}">${lines}${relatedNodes}${centerNode}</svg></div>
        <div class="related-list">${related.map(item => `<button class="related-button" type="button" data-open-entity="${ArabicText.escape(item.id)}">${ArabicText.escape(this.typeLabels[item.entity_type])}: ${ArabicText.escape(item.title_ar)}</button>`).join("")}</div>
      </section>
    `;
  }

  svgNode(entity, x, y, current) {
    const label = String(entity.title_ar || "");
    const first = label.slice(0, 20);
    const second = label.length > 20 ? label.slice(20, 38) + (label.length > 38 ? "…" : "") : "";
    return `<g class="graph-node" data-current="${current}" ${current ? "" : `data-open-entity="${ArabicText.escape(entity.id)}"`} transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="${current ? 58 : 48}"></circle><text text-anchor="middle"><tspan x="0" dy="${second ? "-3" : "4"}">${ArabicText.escape(first)}</tspan>${second ? `<tspan x="0" dy="17">${ArabicText.escape(second)}</tspan>` : ""}</text></g>`;
  }

  getRelatedEntities(entity, limit = 8) {
    const explicit = (entity.related_entities || []).map(id => this.entityById.get(id)).filter(Boolean);
    if (explicit.length >= limit) return explicit.slice(0, limit);
    const seen = new Set([entity.id, ...explicit.map(item => item.id)]);
    const fallback = this.entities.filter(item => item.category === entity.category && !seen.has(item.id));
    return [...explicit, ...fallback].slice(0, limit);
  }

  handleDialogInput(event) {
    const input = event.target.closest("[data-variable]");
    if (!input || !this.currentEntity) return;
    this.currentVariables[input.dataset.variable] = input.value.trim();
    this.updateResolvedCommands();
  }

  handleDialogChange(event) {
    if (!this.currentEntity) return;
    const step = event.target.closest("[data-task-step]");
    if (step) {
      this.toggleTaskStep(this.currentEntity.id, step.dataset.taskStep, step.checked);
      step.closest(".step-card")?.classList.toggle("is-complete", step.checked);
      this.updateTaskProgressUI(this.currentEntity);
      return;
    }
    const module = event.target.closest("[data-path-module]");
    if (module) {
      this.togglePathModule(this.currentEntity.id, module.dataset.pathModule, module.checked);
      module.closest(".module-item")?.classList.toggle("is-complete", module.checked);
      this.updatePathProgressUI(this.currentEntity);
    }
  }

  handleDialogClick(event) {
    if (!this.currentEntity) return;
    if (event.target.closest("[data-start-guided-workflow]")) {
      const entity = this.currentEntity;
      const variables = { ...this.currentVariables };
      this.closeDialog();
      this.workflowRunner?.start(entity, { variables, resume: true });
      return;
    }
    const open = event.target.closest("[data-open-entity]");
    if (open) {
      const target = this.entityById.get(open.dataset.openEntity);
      if (target) this.openEntity(target);
      return;
    }
    const copyStep = event.target.closest("[data-copy-command]");
    if (copyStep) {
      const step = this.currentEntity.steps?.find(item => item.id === copyStep.dataset.copyCommand);
      if (step) this.copy(this.resolveCommand(step.command), "Command copied");
      return;
    }
    const copyVerification = event.target.closest("[data-copy-verification]");
    if (copyVerification) {
      const item = this.currentEntity.verification?.[Number(copyVerification.dataset.copyVerification)];
      if (item) this.copy(this.resolveCommand(item.command), "Verification command copied");
      return;
    }
    const errorCheck = event.target.closest("[data-copy-error-check]");
    if (errorCheck) {
      this.copy(this.resolveCommand(errorCheck.dataset.copyErrorCheck), "Diagnostic command copied");
      return;
    }
    const commandExample = event.target.closest("[data-copy-command-example]");
    if (commandExample) {
      const item = this.currentEntity.examples?.[Number(commandExample.dataset.copyCommandExample)];
      if (item) this.copy(item.command, "Example copied");
    }
  }

  resolveCommand(command) {
    let result = String(command || "");
    for (const [name, value] of Object.entries(this.currentVariables)) {
      if (value) result = result.replaceAll(`<${name}>`, value);
    }
    return result;
  }

  updateResolvedCommands() {
    this.e.dialogContent.querySelectorAll("[data-command-template]").forEach(code => {
      code.textContent = this.resolveCommand(code.dataset.commandTemplate);
    });
    this.e.dialogContent.querySelectorAll("[data-verification-template]").forEach(code => {
      code.textContent = this.resolveCommand(code.dataset.verificationTemplate);
    });
  }


  renderIntentPanel() {
    const analysis = this.searchAnalysis;
    const query = this.e.searchInput.value.trim();
    if (!query || !analysis?.intent || this.dismissedIntentQuery === query) {
      this.e.intentPanel.hidden = true;
      this.e.intentPanelContent.innerHTML = "";
      return;
    }

    const confidenceLabels = { high: "High confidence", medium: "Medium confidence", low: "Possible suggestion" };
    const values = { ...this.intentEngine.variableDefaults(analysis, analysis.target), ...this.intentInputValues };
    const required = analysis.intent.required_variables || [];
    const prompts = this.intentData.variable_prompts || {};
    const fields = required.map(name => {
      const prompt = prompts[name] || { label_ar: name, example: "" };
      return `<label class="intent-field"><span>${ArabicText.escape(prompt.label_ar || name)}</span><input type="text" data-intent-variable="${ArabicText.escape(name)}" value="${ArabicText.escape(values[name] || "")}" placeholder="Example: ${ArabicText.escape(prompt.example || "")}" autocomplete="off"></label>`;
    }).join("");

    const extracted = Object.entries(analysis.extracted?.values || {}).map(([name, value]) => {
      const label = prompts[name]?.label_ar || name;
      return `<span class="analysis-chip"><strong>${ArabicText.escape(label)}:</strong> ${ArabicText.escape(value)}</span>`;
    }).join("");

    const corrections = (analysis.corrected?.corrections || []).map(item => `${item.from} → ${item.to}`).join(", ");
    const alternatives = (analysis.alternatives || []).filter(item => item.intent?.id !== analysis.intent.id).slice(0, 3);
    const target = analysis.target;

    this.e.intentPanelContent.innerHTML = `
      <div class="intent-panel__inner">
        <div class="intent-panel__header">
          <div class="intent-panel__identity">
            <span class="intent-panel__icon" aria-hidden="true">${ArabicText.escape(analysis.intent.icon || "⌁")}</span>
            <div><span class="eyebrow">Natural-language analysis</span><h2>I understand that you want: ${ArabicText.escape(analysis.intent.title_ar)}</h2><p>${ArabicText.escape(analysis.intent.summary_ar || "")}</p></div>
          </div>
          <span class="intent-confidence intent-confidence--${analysis.confidence}">${confidenceLabels[analysis.confidence] || "Suggestion"}</span>
        </div>
        ${corrections ? `<div class="correction-note"><strong>Technical correction:</strong> ${ArabicText.escape(corrections)}</div>` : ""}
        ${extracted ? `<div class="intent-analysis-row">${extracted}</div>` : ""}
        <div class="intent-target">
          <div class="intent-target__top"><div><h3>${target ? `Suggested workflow: ${ArabicText.escape(target.title_ar)}` : "Suggested search results"}</h3><p>${target ? ArabicText.escape(target.summary_ar) : "Results were ranked according to the detected intent."}</p></div></div>
          ${fields ? `<div class="intent-fields">${fields}</div>` : ""}
          <div class="intent-actions">
            ${target ? `<button class="intent-primary" type="button" data-intent-open>Open the workflow and prepare commands</button>` : ""}
            <button class="intent-secondary" type="button" data-intent-scroll>Show ranked results</button>
            <button class="intent-secondary" type="button" data-intent-dismiss>Use standard search</button>
          </div>
        </div>
        ${alternatives.length ? `<div class="intent-alternatives"><span>You may also mean:</span>${alternatives.map(item => `<button class="intent-alt" type="button" data-intent-alt="${ArabicText.escape(item.intent.id)}">${ArabicText.escape(item.intent.title_ar)}</button>`).join("")}</div>` : ""}
        ${analysis.reasons?.length ? `<div class="intent-reasons">Why this result: ${ArabicText.escape(analysis.reasons.join(", "))}</div>` : ""}
      </div>`;
    this.e.intentPanel.hidden = false;
  }

  handleIntentPanelClick(event) {
    if (event.target.closest("[data-intent-open]")) {
      this.openIntentTarget(this.searchAnalysis);
      return;
    }
    if (event.target.closest("[data-intent-scroll]")) {
      this.e.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (event.target.closest("[data-intent-dismiss]")) {
      this.dismissedIntentQuery = this.e.searchInput.value.trim();
      this.renderIntentPanel();
      return;
    }
    const alternative = event.target.closest("[data-intent-alt]");
    if (alternative) {
      const intent = this.intentData.intents.find(item => item.id === alternative.dataset.intentAlt);
      if (!intent) return;
      const analysis = { ...this.searchAnalysis, intent, target: (intent.target_entities || []).map(id => this.entityById.get(id)).find(Boolean) || null };
      this.searchAnalysis = analysis;
      this.openIntentTarget(analysis);
    }
  }

  openIntentTarget(analysis) {
    if (!analysis?.intent) return;
    const target = analysis.target || (analysis.intent.target_entities || []).map(id => this.entityById.get(id)).find(Boolean);
    if (!target) {
      this.e.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const panelValues = {};
    this.e.intentPanel.querySelectorAll("[data-intent-variable]").forEach(input => { if (input.value.trim()) panelValues[input.dataset.intentVariable] = input.value.trim(); });
    const initialVariables = { ...this.intentEngine.variableDefaults(analysis, target), ...this.intentInputValues, ...panelValues };
    this.openEntity(target, { initialVariables });
  }

  getTaskProgress(id) { return new Set(this.taskProgress[id] || []); }
  toggleTaskStep(taskId, stepId, checked) {
    const set = this.getTaskProgress(taskId);
    checked ? set.add(stepId) : set.delete(stepId);
    this.taskProgress[taskId] = [...set];
    SafeStorage.set("rhel-ke:task-progress", this.taskProgress);
  }

  updateTaskProgressUI(task) {
    const required = (task.steps || []).filter(step => !step.optional);
    const completed = this.getTaskProgress(task.id);
    const count = required.filter(step => completed.has(step.id)).length;
    const percent = required.length ? Math.round(count / required.length * 100) : 0;
    const text = this.e.dialogContent.querySelector("#taskProgressText");
    const bar = this.e.dialogContent.querySelector("#taskProgressBar");
    if (text) text.textContent = `${count} of ${required.length} — ${percent}%`;
    if (bar) bar.style.width = `${percent}%`;
  }

  getPathProgress(id) { return new Set(this.pathProgress[id] || []); }
  togglePathModule(pathId, moduleId, checked) {
    const set = this.getPathProgress(pathId);
    checked ? set.add(moduleId) : set.delete(moduleId);
    this.pathProgress[pathId] = [...set];
    SafeStorage.set("rhel-ke:path-progress", this.pathProgress);
  }

  updatePathProgressUI(path) {
    const modules = path.modules || [];
    const completed = this.getPathProgress(path.id);
    const count = modules.filter(item => completed.has(item.entity_id)).length;
    const percent = modules.length ? Math.round(count / modules.length * 100) : 0;
    const text = this.e.dialogContent.querySelector("#pathProgressText");
    const bar = this.e.dialogContent.querySelector("#pathProgressBar");
    if (text) text.textContent = `${count} of ${modules.length} — ${percent}%`;
    if (bar) bar.style.width = `${percent}%`;
  }

  copyPrimaryContent() {
    if (!this.currentEntity) return;
    if (["task", "troubleshooting"].includes(this.currentEntity.entity_type)) {
      const text = (this.currentEntity.steps || []).map((step, index) => `# ${index + 1}. ${step.title_ar}\n${this.resolveCommand(step.command)}`).join("\n\n");
      this.copy(text, "All task commands copied");
    } else if (this.currentEntity.entity_type === "command") {
      const text = (this.currentEntity.examples || []).map(item => `# ${item.title_ar}\n${item.command}`).join("\n\n");
      this.copy(text || this.currentEntity.syntax, "Command examples copied");
    }
  }

  copyShareLink() {
    if (!this.currentEntity) return;
    const url = `${location.origin}${location.pathname}${location.search}#entity=${encodeURIComponent(this.currentEntity.id)}`;
    this.copy(url, "Page link copied");
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
    this.e.toast.textContent = message;
    this.e.toast.classList.add("is-visible");
    this.toastTimer = setTimeout(() => this.e.toast.classList.remove("is-visible"), 1800);
  }
}

document.addEventListener("DOMContentLoaded", () => { window.rhelKnowledgeApp = new KnowledgeEngineApp(); });
