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
    "هارد": ["قرص", "تخزين", "disk"],
    "مساحه": ["حجم", "تخزين", "disk"],
    "رام": ["ذاكره", "memory"],
    "بورت": ["منفذ", "port"],
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
    "مشكله": ["خطا", "فشل", "troubleshoot", "diagnose"],
    "لايعمل": ["فشل", "متوقف", "failed"]
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
    const tokens = ArabicText.tokenize(query, { expand: false }).sort((a, b) => b.length - a.length);
    for (const token of tokens) {
      const safe = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      output = output.replace(new RegExp(`(${safe})`, "giu"), "<mark>$1</mark>");
    }
    return output;
  }
}

class KnowledgeIndex {
  constructor(tasks, categories) {
    this.tasks = tasks;
    this.categories = categories;
    this.records = new Map();
    this.build();
  }

  build() {
    for (const task of this.tasks) {
      const category = this.categories[task.category] || task.category;
      const stepCommands = (task.steps || []).map(step => step.command).join(" ");
      const stepText = (task.steps || []).map(step => `${step.title_ar} ${step.explanation_ar}`).join(" ");
      const errors = (task.common_errors || []).map(item =>
        `${item.symptom_ar} ${(item.likely_causes_ar || []).join(" ")} ${(item.fixes_ar || []).join(" ")}`
      ).join(" ");
      const files = (task.files || []).join(" ");

      const record = {
        title: ArabicText.normalize(task.title_ar),
        goal: ArabicText.normalize(task.goal_ar),
        summary: ArabicText.normalize(task.summary_ar),
        keywords: ArabicText.normalize((task.keywords_ar || []).join(" ")),
        category: ArabicText.normalize(category),
        commands: ArabicText.normalize(stepCommands),
        steps: ArabicText.normalize(stepText),
        errors: ArabicText.normalize(errors),
        files: ArabicText.normalize(files)
      };
      record.all = Object.values(record).join(" ");
      this.records.set(task.id, record);
    }
  }

  score(task, query) {
    const normalizedQuery = ArabicText.normalize(query);
    if (!normalizedQuery) return 0;

    const rawTokens = ArabicText.tokenize(query, { expand: false });
    const expandedTokens = ArabicText.tokenize(query);
    const record = this.records.get(task.id);
    let score = 0;

    if (record.title === normalizedQuery) score += 180;
    if (record.title.startsWith(normalizedQuery)) score += 100;
    if (record.title.includes(normalizedQuery)) score += 80;
    if (record.goal.includes(normalizedQuery)) score += 70;
    if (record.keywords.includes(normalizedQuery)) score += 65;
    if (record.commands.includes(normalizedQuery)) score += 55;
    if (record.summary.includes(normalizedQuery)) score += 38;
    if (record.errors.includes(normalizedQuery)) score += 35;

    for (const token of rawTokens) {
      if (record.title.includes(token)) score += 30;
      if (record.goal.includes(token)) score += 26;
      if (record.keywords.includes(token)) score += 22;
      if (record.commands.includes(token)) score += 18;
      if (record.steps.includes(token)) score += 14;
      if (record.summary.includes(token)) score += 11;
      if (record.errors.includes(token)) score += 10;
      if (record.category.includes(token)) score += 7;
      if (record.files.includes(token)) score += 5;
    }

    const synonyms = expandedTokens.filter(token => !rawTokens.includes(token));
    for (const token of synonyms) {
      if (record.title.includes(token)) score += 12;
      if (record.goal.includes(token)) score += 10;
      if (record.keywords.includes(token)) score += 8;
      if (record.commands.includes(token)) score += 6;
      if (record.all.includes(token)) score += 3;
    }

    const matched = rawTokens.filter(token => record.all.includes(token)).length;
    if (rawTokens.length > 1 && matched === rawTokens.length) score += 50;
    return score;
  }

  search(query) {
    if (!ArabicText.normalize(query)) return this.tasks.map(task => ({ task, score: 0 }));
    return this.tasks
      .map(task => ({ task, score: this.score(task, query) }))
      .filter(item => item.score > 0);
  }

  suggest(query, limit = 7) {
    if (ArabicText.normalize(query).length < 2) return [];
    return this.search(query)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.task);
  }
}

class RhelKnowledgeApp {
  constructor() {
    this.data = null;
    this.tasks = [];
    this.taskById = new Map();
    this.index = null;
    this.view = "all";
    this.layout = SafeStorage.get("rhel-kb:layout", "grid");
    this.theme = SafeStorage.get("rhel-kb:theme", null) ||
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    this.favorites = new Set(SafeStorage.get("rhel-kb:favorites", []));
    this.progress = SafeStorage.get("rhel-kb:progress", {});
    this.visibleLimit = 24;
    this.currentTask = null;
    this.currentVariables = {};
    this.suggestions = [];
    this.activeSuggestion = -1;
    this.searchTimer = null;
    this.toastTimer = null;

    this.riskLabels = { low: "منخفضة", medium: "متوسطة", high: "عالية", critical: "حرجة" };
    this.riskOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    this.difficultyLabels = { beginner: "مبتدئ", intermediate: "متوسط", advanced: "متقدم" };
    this.typeLabels = { workflow: "مسار عملي", troubleshooting: "حل مشكلة", legacy: "أمر سريع" };

    this.e = this.collectElements();
    this.applyTheme();
    this.attachEvents();
    this.loadData();
  }

  collectElements() {
    const ids = [
      "favoritesShortcut", "favoritesCount", "themeButton", "themeIcon",
      "searchInput", "clearSearchButton", "suggestions", "categoryFilter",
      "difficultyFilter", "riskFilter", "versionFilter", "sortFilter",
      "resetFiltersButton", "resultsSection", "resultsEyebrow", "resultsTitle",
      "resultsSummary", "gridViewButton", "listViewButton", "activeFilters",
      "loadingState", "errorState", "emptyState", "emptyResetButton",
      "resultsGrid", "loadMoreButton", "tasksMetric", "workflowsMetric",
      "stepsMetric", "categoriesMetric", "schemaVersion", "toast", "taskDialog",
      "closeDialogButton", "dialogFavoriteButton", "copyAllButton", "shareTaskButton",
      "dialogContent", "taskCardTemplate"
    ];
    return Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  }

  applyTheme() {
    document.documentElement.dataset.theme = this.theme;
    const dark = this.theme === "dark";
    this.e.themeIcon.textContent = dark ? "☀" : "☾";
    this.e.themeButton.title = dark ? "الوضع النهاري" : "الوضع الليلي";
    this.e.themeButton.setAttribute("aria-label", dark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0d1714" : "#0c6b50");
  }

  attachEvents() {
    this.e.themeButton.addEventListener("click", () => {
      this.theme = this.theme === "dark" ? "light" : "dark";
      SafeStorage.set("rhel-kb:theme", this.theme);
      this.applyTheme();
    });

    this.e.searchInput.addEventListener("input", () => {
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

    document.querySelector(".quick-searches").addEventListener("click", event => {
      const button = event.target.closest("[data-query]");
      if (button) this.useQuery(button.dataset.query);
    });

    document.querySelector(".view-tabs").addEventListener("click", event => {
      const button = event.target.closest("[data-view]");
      if (button) this.setView(button.dataset.view);
    });

    this.e.favoritesShortcut.addEventListener("click", () => this.setView("favorites"));

    [this.e.categoryFilter, this.e.difficultyFilter, this.e.riskFilter, this.e.versionFilter, this.e.sortFilter]
      .forEach(select => select.addEventListener("change", () => {
        this.visibleLimit = 24;
        this.render();
      }));

    this.e.resetFiltersButton.addEventListener("click", () => this.reset());
    this.e.emptyResetButton.addEventListener("click", () => this.reset());
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

    this.e.resultsGrid.addEventListener("click", event => {
      const card = event.target.closest(".task-card");
      if (!card) return;
      const task = this.taskById.get(card.dataset.id);
      if (!task) return;

      if (event.target.closest(".favorite-button")) this.toggleFavorite(task.id);
      else if (event.target.closest(".quick-copy-button")) this.copy(this.resolveCommand(task.steps?.[0]?.command || ""), "تم نسخ أول أمر");
      else if (event.target.closest(".open-task-button")) this.openTask(task);
    });

    this.e.closeDialogButton.addEventListener("click", () => this.closeTask());
    this.e.dialogFavoriteButton.addEventListener("click", () => {
      if (this.currentTask) this.toggleFavorite(this.currentTask.id, true);
    });
    this.e.copyAllButton.addEventListener("click", () => this.copyAllCommands());
    this.e.shareTaskButton.addEventListener("click", () => this.copyTaskLink());

    this.e.taskDialog.addEventListener("click", event => {
      const rect = this.e.taskDialog.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) this.closeTask();
    });

    this.e.dialogContent.addEventListener("click", event => this.handleDialogClick(event));
    this.e.dialogContent.addEventListener("input", event => this.handleDialogInput(event));
    this.e.dialogContent.addEventListener("change", event => this.handleDialogChange(event));

    window.addEventListener("hashchange", () => this.openTaskFromHash());
  }

  async loadData() {
    try {
      const response = await fetch("knowledge.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.data = await response.json();
      if (!Array.isArray(this.data.tasks)) throw new Error("Invalid knowledge schema");

      this.tasks = this.data.tasks;
      this.taskById = new Map(this.tasks.map(task => [task.id, task]));
      this.index = new KnowledgeIndex(this.tasks, this.data.categories || {});
      this.populateCategories();
      this.updateMetrics();
      this.updateFavoriteCount();
      this.setLayout(this.layout, false);
      this.e.schemaVersion.textContent = `Schema ${this.data.schema_version || "—"}`;
      this.e.loadingState.hidden = true;
      this.render();
      this.openTaskFromHash();
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
    const developed = this.tasks.filter(task => task.content_level !== "legacy").length;
    const steps = this.tasks.reduce((sum, task) => sum + (task.steps?.length || 0), 0);
    this.e.tasksMetric.textContent = this.tasks.length;
    this.e.workflowsMetric.textContent = developed;
    this.e.stepsMetric.textContent = steps;
    this.e.categoriesMetric.textContent = Object.keys(this.data.categories || {}).length;
  }

  setView(view) {
    this.view = view;
    this.visibleLimit = 24;
    document.querySelectorAll("[data-view]").forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    this.render();
    this.e.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  setLayout(layout, persist = true) {
    this.layout = layout;
    this.e.resultsGrid.classList.toggle("list-view", layout === "list");
    this.e.gridViewButton.classList.toggle("is-active", layout === "grid");
    this.e.listViewButton.classList.toggle("is-active", layout === "list");
    if (persist) SafeStorage.set("rhel-kb:layout", layout);
  }

  reset() {
    this.view = "all";
    this.e.searchInput.value = "";
    this.e.categoryFilter.value = "all";
    this.e.difficultyFilter.value = "all";
    this.e.riskFilter.value = "all";
    this.e.versionFilter.value = "all";
    this.e.sortFilter.value = "relevance";
    this.visibleLimit = 24;
    this.closeSuggestions();
    this.setView("all");
    this.e.searchInput.focus();
  }

  useQuery(query) {
    this.e.searchInput.value = query;
    this.closeSuggestions();
    this.view = "all";
    this.setView("all");
  }

  handleSearchKeyboard(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveSuggestion(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveSuggestion(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (this.activeSuggestion >= 0) this.selectSuggestion(this.activeSuggestion);
      else {
        this.closeSuggestions();
        this.render();
        this.e.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else if (event.key === "Escape") {
      this.closeSuggestions();
    }
  }

  updateSuggestions() {
    if (!this.index) return;
    this.suggestions = this.index.suggest(this.e.searchInput.value);
    this.activeSuggestion = -1;
    this.renderSuggestions();
  }

  renderSuggestions() {
    const container = this.e.suggestions;
    container.innerHTML = "";
    if (!this.suggestions.length) return this.closeSuggestions();

    const fragment = document.createDocumentFragment();
    this.suggestions.forEach((task, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "suggestion";
      button.role = "option";
      button.innerHTML = `
        <span>
          <strong>${ArabicText.highlight(task.title_ar, this.e.searchInput.value)}</strong>
          <small>${ArabicText.escape(task.goal_ar)}</small>
        </span>
        <code>${ArabicText.escape(task.steps?.[0]?.command || "")}</code>
      `;
      button.addEventListener("mousedown", event => {
        event.preventDefault();
        this.selectSuggestion(index);
      });
      fragment.appendChild(button);
    });
    container.appendChild(fragment);
    container.hidden = false;
    this.e.searchInput.setAttribute("aria-expanded", "true");
  }

  moveSuggestion(direction) {
    if (!this.suggestions.length) return;
    this.activeSuggestion = (this.activeSuggestion + direction + this.suggestions.length) % this.suggestions.length;
    this.e.suggestions.querySelectorAll(".suggestion").forEach((item, index) => {
      const active = index === this.activeSuggestion;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", String(active));
      if (active) item.scrollIntoView({ block: "nearest" });
    });
  }

  selectSuggestion(index) {
    const task = this.suggestions[index];
    if (!task) return;
    this.e.searchInput.value = task.title_ar;
    this.closeSuggestions();
    this.render();
    this.openTask(task);
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
    let items = this.index.search(query);

    items = items.filter(({ task }) => {
      if (this.view === "workflows" && task.content_level !== "workflow") return false;
      if (this.view === "troubleshooting" && task.content_level !== "troubleshooting") return false;
      if (this.view === "legacy" && task.content_level !== "legacy") return false;
      if (this.view === "favorites" && !this.favorites.has(task.id)) return false;
      if (this.e.categoryFilter.value !== "all" && task.category !== this.e.categoryFilter.value) return false;
      if (this.e.difficultyFilter.value !== "all" && task.difficulty !== this.e.difficultyFilter.value) return false;
      if (this.e.riskFilter.value !== "all" && task.risk !== this.e.riskFilter.value) return false;
      if (this.e.versionFilter.value !== "all" && !(task.supported_versions || []).includes(this.e.versionFilter.value)) return false;
      return true;
    });

    return this.sortResults(items, query);
  }

  sortResults(items, query) {
    const mode = this.e.sortFilter.value;
    return items.sort((a, b) => {
      if (mode === "title") return a.task.title_ar.localeCompare(b.task.title_ar, "ar");
      if (mode === "steps") return (b.task.steps?.length || 0) - (a.task.steps?.length || 0) || a.task.title_ar.localeCompare(b.task.title_ar, "ar");
      if (mode === "risk") return this.riskOrder[b.task.risk] - this.riskOrder[a.task.risk] || a.task.title_ar.localeCompare(b.task.title_ar, "ar");
      if (mode === "time") return a.task.estimated_minutes - b.task.estimated_minutes || a.task.title_ar.localeCompare(b.task.title_ar, "ar");
      if (query) return b.score - a.score || a.task.title_ar.localeCompare(b.task.title_ar, "ar");
      const levelPriority = { workflow: 1, troubleshooting: 2, legacy: 3 };
      return levelPriority[a.task.content_level] - levelPriority[b.task.content_level] || a.task.title_ar.localeCompare(b.task.title_ar, "ar");
    });
  }

  render() {
    if (!this.index) return;
    this.e.clearSearchButton.hidden = !this.e.searchInput.value;
    this.renderActiveFilters();
    this.renderResults();
  }

  renderResults() {
    const allResults = this.getResults();
    const visible = allResults.slice(0, this.visibleLimit);
    const query = this.e.searchInput.value.trim();
    this.e.resultsGrid.innerHTML = "";
    this.e.emptyState.hidden = allResults.length !== 0;
    this.e.resultsGrid.hidden = allResults.length === 0;

    const viewTitles = {
      all: "كل المهام",
      workflows: "المسارات العملية المطورة",
      troubleshooting: "مسارات حل المشكلات",
      legacy: "الأوامر السريعة",
      favorites: "المهام المفضلة"
    };
    this.e.resultsEyebrow.textContent = query ? "نتائج البحث" : "قاعدة المعرفة";
    this.e.resultsTitle.textContent = query ? `نتائج: ${query}` : viewTitles[this.view];
    this.e.resultsSummary.textContent = `تم العثور على ${allResults.length} نتيجة من أصل ${this.tasks.length}`;

    const fragment = document.createDocumentFragment();
    visible.forEach(item => fragment.appendChild(this.createTaskCard(item.task, query)));
    this.e.resultsGrid.appendChild(fragment);

    this.e.loadMoreButton.hidden = visible.length >= allResults.length;
    if (!this.e.loadMoreButton.hidden) this.e.loadMoreButton.textContent = `عرض المزيد (${allResults.length - visible.length} متبقية)`;
  }

  createTaskCard(task, query) {
    const node = this.e.taskCardTemplate.content.cloneNode(true);
    const card = node.querySelector(".task-card");
    card.dataset.id = task.id;

    const type = node.querySelector(".type-badge");
    type.textContent = this.typeLabels[task.content_level] || task.content_level;
    type.classList.add(`type-${task.content_level}`);
    node.querySelector(".category-badge").textContent = this.data.categories[task.category] || task.category;
    node.querySelector(".task-title").innerHTML = ArabicText.highlight(task.title_ar, query);
    node.querySelector(".task-goal").innerHTML = ArabicText.highlight(task.goal_ar, query);
    node.querySelector(".difficulty-badge").textContent = this.difficultyLabels[task.difficulty] || task.difficulty;

    const risk = node.querySelector(".risk-badge");
    risk.textContent = `الخطورة: ${this.riskLabels[task.risk] || task.risk}`;
    risk.classList.add(`risk-${task.risk}`);
    node.querySelector(".time-badge").textContent = `${task.estimated_minutes} د`;
    node.querySelector(".steps-badge").textContent = `${task.steps?.length || 0} خطوة`;

    const firstStep = task.steps?.[0];
    node.querySelector(".task-preview").innerHTML = firstStep
      ? `<code>${ArabicText.escape(firstStep.command)}</code><small>${ArabicText.escape(firstStep.title_ar)}</small>`
      : `<small>لا توجد خطوات</small>`;

    const favorite = node.querySelector(".favorite-button");
    const isFavorite = this.favorites.has(task.id);
    favorite.classList.toggle("is-favorite", isFavorite);
    favorite.textContent = isFavorite ? "★" : "☆";
    favorite.setAttribute("aria-label", isFavorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة");
    return node;
  }

  renderActiveFilters() {
    const chips = [];
    if (this.e.searchInput.value.trim()) chips.push({ key: "search", label: `بحث: ${this.e.searchInput.value.trim()}` });
    if (this.view !== "all") chips.push({ key: "view", label: document.querySelector(`[data-view="${this.view}"]`)?.textContent || this.view });
    for (const [key, element] of [["category", this.e.categoryFilter], ["difficulty", this.e.difficultyFilter], ["risk", this.e.riskFilter], ["version", this.e.versionFilter]]) {
      if (element.value !== "all") chips.push({ key, label: element.options[element.selectedIndex].text });
    }
    this.e.activeFilters.hidden = chips.length === 0;
    this.e.activeFilters.innerHTML = chips.map(chip => `
      <span class="filter-chip">${ArabicText.escape(chip.label)}<button type="button" data-remove-filter="${chip.key}" aria-label="إزالة الفلتر">×</button></span>
    `).join("");
  }

  removeFilter(key) {
    if (key === "search") this.e.searchInput.value = "";
    if (key === "view") this.setView("all");
    if (key === "category") this.e.categoryFilter.value = "all";
    if (key === "difficulty") this.e.difficultyFilter.value = "all";
    if (key === "risk") this.e.riskFilter.value = "all";
    if (key === "version") this.e.versionFilter.value = "all";
    this.visibleLimit = 24;
    this.render();
  }

  toggleFavorite(id, fromDialog = false) {
    if (this.favorites.has(id)) {
      this.favorites.delete(id);
      this.showToast("تمت الإزالة من المفضلة");
    } else {
      this.favorites.add(id);
      this.showToast("تمت الإضافة إلى المفضلة");
    }
    SafeStorage.set("rhel-kb:favorites", [...this.favorites]);
    this.updateFavoriteCount();
    if (fromDialog && this.currentTask) this.updateDialogFavoriteButton();
    this.render();
  }

  updateFavoriteCount() { this.e.favoritesCount.textContent = this.favorites.size; }

  openTask(task, { updateHash = true } = {}) {
    this.currentTask = task;
    this.currentVariables = Object.fromEntries((task.variables || []).map(variable => [variable.name, ""]));
    this.renderTaskDialog();
    if (typeof this.e.taskDialog.showModal === "function" && !this.e.taskDialog.open) this.e.taskDialog.showModal();
    if (updateHash) history.replaceState(null, "", `#task=${encodeURIComponent(task.id)}`);
  }

  closeTask() {
    if (this.e.taskDialog.open) this.e.taskDialog.close();
    this.currentTask = null;
    this.currentVariables = {};
    if (location.hash.startsWith("#task=")) history.replaceState(null, "", location.pathname + location.search);
  }

  openTaskFromHash() {
    const match = location.hash.match(/^#task=(.+)$/);
    if (!match || !this.taskById.size) return;
    const task = this.taskById.get(decodeURIComponent(match[1]));
    if (task && this.currentTask?.id !== task.id) this.openTask(task, { updateHash: false });
  }

  renderTaskDialog() {
    const task = this.currentTask;
    if (!task) return;
    const category = this.data.categories[task.category] || task.category;
    const completed = this.getCompletedSteps(task.id);
    const requiredSteps = (task.steps || []).filter(step => !step.optional);
    const completedRequired = requiredSteps.filter(step => completed.has(step.id)).length;
    const progressPercent = requiredSteps.length ? Math.round((completedRequired / requiredSteps.length) * 100) : 0;

    this.e.dialogContent.innerHTML = `
      <div class="dialog-body">
        <section class="dialog-hero">
          <div class="dialog-hero__badges">
            <span class="type-badge type-${task.content_level}">${ArabicText.escape(this.typeLabels[task.content_level] || task.content_level)}</span>
            <span class="category-badge">${ArabicText.escape(category)}</span>
            <span class="risk-badge risk-${task.risk}">الخطورة: ${ArabicText.escape(this.riskLabels[task.risk] || task.risk)}</span>
          </div>
          <h2>${ArabicText.escape(task.title_ar)}</h2>
          <p class="dialog-goal">${ArabicText.escape(task.goal_ar)}</p>
          <p class="dialog-summary">${ArabicText.escape(task.summary_ar)}</p>
          <div class="dialog-meta">
            <span class="difficulty-badge">${ArabicText.escape(this.difficultyLabels[task.difficulty] || task.difficulty)}</span>
            <span class="time-badge">الوقت المتوقع: ${task.estimated_minutes} دقيقة</span>
            <span class="steps-badge">${task.steps?.length || 0} خطوة</span>
            <span class="steps-badge">RHEL ${(task.supported_versions || []).join(" / ")}</span>
            <span class="steps-badge">الحالة: ${this.statusLabel(task.status)}</span>
          </div>
          <div class="progress-panel">
            <div class="progress-panel__header"><span>تقدم التنفيذ</span><span id="progressText">${completedRequired} من ${requiredSteps.length} — ${progressPercent}%</span></div>
            <div class="progress-track"><div id="progressBar" class="progress-bar" style="width:${progressPercent}%"></div></div>
          </div>
        </section>

        ${this.renderSafety(task)}
        ${this.renderPrerequisites(task)}
        ${this.renderVariables(task)}
        ${this.renderSteps(task, completed)}
        ${this.renderVerification(task)}
        ${this.renderErrors(task)}
        ${this.renderResources(task)}
        ${this.renderRollback(task)}
        ${this.renderRelated(task)}
      </div>
    `;
    this.updateDialogFavoriteButton();
  }

  renderSafety(task) {
    if (!(task.safety_notes_ar || []).length) return "";
    return `
      <section class="dialog-section safety-box">
        <h3>تنبيهات السلامة</h3>
        <ul class="safety-list">${task.safety_notes_ar.map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul>
      </section>`;
  }

  renderPrerequisites(task) {
    if (!(task.prerequisites_ar || []).length) return "";
    return `
      <section class="dialog-section">
        <div class="dialog-section__heading"><div><h3>قبل أن تبدأ</h3><p class="section-help">تأكد من هذه المتطلبات قبل التنفيذ.</p></div></div>
        <ul class="prerequisites-list">${task.prerequisites_ar.map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul>
      </section>`;
  }

  renderVariables(task) {
    if (!(task.variables || []).length) return "";
    return `
      <section class="dialog-section">
        <div class="dialog-section__heading"><div><h3>بيانات المهمة</h3><p class="section-help">أدخل القيم وسيتم تحديث جميع الأوامر تلقائياً.</p></div></div>
        <div class="variables-grid">
          ${task.variables.map(variable => `
            <div class="variable-field">
              <label for="var-${ArabicText.escape(variable.name)}">${ArabicText.escape(variable.label_ar)} ${variable.required ? "*" : ""}</label>
              <input id="var-${ArabicText.escape(variable.name)}" data-variable="${ArabicText.escape(variable.name)}" type="text" placeholder="مثال: ${ArabicText.escape(variable.example)}" value="${ArabicText.escape(this.currentVariables[variable.name] || "")}">
            </div>`).join("")}
        </div>
      </section>`;
  }

  renderSteps(task, completed) {
    return `
      <section class="dialog-section">
        <div class="dialog-section__heading"><div><h3>خطوات التنفيذ</h3><p class="section-help">نفّذها بالترتيب، ثم ضع علامة عند اكتمال كل خطوة.</p></div></div>
        <div class="steps-list">
          ${(task.steps || []).map((step, index) => {
            const isComplete = completed.has(step.id);
            const resolved = this.resolveCommand(step.command);
            return `
              <article class="step-card ${isComplete ? "is-complete" : ""}" data-step-id="${ArabicText.escape(step.id)}">
                <input class="step-check" type="checkbox" data-step-check="${ArabicText.escape(step.id)}" ${isComplete ? "checked" : ""} aria-label="تحديد الخطوة كمكتملة">
                <div class="step-content">
                  <div class="step-heading">
                    <div>
                      <span class="step-number">الخطوة ${index + 1} ${step.optional ? '<span class="optional-badge">اختيارية</span>' : ""}</span>
                      <h4>${ArabicText.escape(step.title_ar)}</h4>
                    </div>
                    <span class="risk-badge risk-${step.risk}">${ArabicText.escape(this.riskLabels[step.risk] || step.risk)}</span>
                  </div>
                  <p class="step-explanation">${ArabicText.escape(step.explanation_ar)}</p>
                  <div class="command-box">
                    <code data-command-template="${ArabicText.escape(step.command)}">${ArabicText.escape(resolved)}</code>
                    <button class="command-copy" type="button" data-copy-step="${ArabicText.escape(step.id)}">نسخ</button>
                  </div>
                  ${step.expected_result_ar ? `<div class="expected-result"><strong>النتيجة المتوقعة:</strong> ${ArabicText.escape(step.expected_result_ar)}</div>` : ""}
                  ${step.notes_ar ? `<div class="expected-result"><strong>ملاحظة:</strong> ${ArabicText.escape(step.notes_ar)}</div>` : ""}
                </div>
              </article>`;
          }).join("")}
        </div>
      </section>`;
  }

  renderVerification(task) {
    if (!(task.verification || []).length) return "";
    return `
      <section class="dialog-section">
        <div class="dialog-section__heading"><div><h3>التحقق بعد التنفيذ</h3><p class="section-help">لا تعتبر المهمة مكتملة قبل التأكد من النتيجة.</p></div></div>
        <div class="check-grid">
          ${task.verification.map((item, index) => `
            <article class="check-card">
              <strong>${ArabicText.escape(item.title_ar)}</strong>
              <code data-verification-template="${ArabicText.escape(item.command)}">${ArabicText.escape(this.resolveCommand(item.command))}</code>
              <p>${ArabicText.escape(item.expected_result_ar)}</p>
              <button class="quick-copy-button" type="button" data-copy-verification="${index}">نسخ أمر التحقق</button>
            </article>`).join("")}
        </div>
      </section>`;
  }

  renderErrors(task) {
    if (!(task.common_errors || []).length) return "";
    return `
      <section class="dialog-section">
        <div class="dialog-section__heading"><div><h3>الأخطاء الشائعة</h3><p class="section-help">افتح العَرَض المطابق لتشخيص السبب.</p></div></div>
        <div class="error-list">
          ${task.common_errors.map(error => `
            <details class="error-case">
              <summary>${ArabicText.escape(error.symptom_ar)}</summary>
              <div class="error-case__body">
                <h5>الأسباب المحتملة</h5>
                <ul>${(error.likely_causes_ar || []).map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul>
                <h5>خطوات الفحص</h5>
                ${(error.checks || []).map(check => `
                  <div class="error-check">
                    <strong>${ArabicText.escape(check.title_ar)}</strong>
                    <code>${ArabicText.escape(this.resolveCommand(check.command))}</code>
                    <small>${ArabicText.escape(check.expected_result_ar)}</small>
                  </div>`).join("")}
                ${(error.fixes_ar || []).length ? `<h5>الإصلاحات المقترحة</h5><ul>${error.fixes_ar.map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul>` : ""}
              </div>
            </details>`).join("")}
        </div>
      </section>`;
  }

  renderResources(task) {
    const files = task.files || [];
    const ports = task.ports || [];
    if (!files.length && !ports.length) return "";
    return `
      <section class="dialog-section">
        <div class="dialog-section__heading"><div><h3>الموارد المرتبطة</h3><p class="section-help">ملفات الإعداد والمنافذ المهمة لهذه المهمة.</p></div></div>
        <div class="resource-grid">
          ${files.map(file => `<article class="resource-card"><strong>ملف أو مسار</strong><code>${ArabicText.escape(file)}</code></article>`).join("")}
          ${ports.map(port => `<article class="resource-card"><strong>منفذ ${port.port}/${ArabicText.escape(port.protocol)}</strong><p>${ArabicText.escape(port.purpose_ar)}</p></article>`).join("")}
        </div>
      </section>`;
  }

  renderRollback(task) {
    if (!(task.rollback_ar || []).length) return "";
    return `
      <section class="dialog-section">
        <div class="dialog-section__heading"><div><h3>التراجع أو الإلغاء</h3><p class="section-help">استخدمها لإعادة الوضع السابق عند الحاجة.</p></div></div>
        <ul class="rollback-list">${task.rollback_ar.map(item => `<li>${ArabicText.escape(item)}</li>`).join("")}</ul>
      </section>`;
  }

  renderRelated(task) {
    if (!(task.related_tasks || []).length) return "";
    const related = task.related_tasks.map(id => this.taskById.get(id)).filter(Boolean);
    if (!related.length) return "";
    return `
      <section class="dialog-section">
        <div class="dialog-section__heading"><div><h3>مهام مرتبطة</h3><p class="section-help">انتقل إلى المسار التالي دون العودة للبحث.</p></div></div>
        <div class="related-list">${related.map(item => `<button class="related-button" type="button" data-related-task="${ArabicText.escape(item.id)}">${ArabicText.escape(item.title_ar)}</button>`).join("")}</div>
      </section>`;
  }

  statusLabel(status) {
    return ({ draft: "مسودة", reviewed: "مراجعة أولية", verified: "موثقة" })[status] || status;
  }

  resolveCommand(command) {
    let result = String(command || "");
    for (const [name, value] of Object.entries(this.currentVariables)) {
      if (value.trim()) result = result.replaceAll(`<${name}>`, value.trim());
    }
    return result;
  }

  handleDialogInput(event) {
    const input = event.target.closest("[data-variable]");
    if (!input || !this.currentTask) return;
    this.currentVariables[input.dataset.variable] = input.value;
    this.refreshResolvedCommands();
  }

  refreshResolvedCommands() {
    this.e.dialogContent.querySelectorAll("[data-command-template]").forEach(code => {
      code.textContent = this.resolveCommand(code.dataset.commandTemplate);
    });
    this.e.dialogContent.querySelectorAll("[data-verification-template]").forEach(code => {
      code.textContent = this.resolveCommand(code.dataset.verificationTemplate);
    });
  }

  handleDialogChange(event) {
    const checkbox = event.target.closest("[data-step-check]");
    if (!checkbox || !this.currentTask) return;
    const set = this.getCompletedSteps(this.currentTask.id);
    if (checkbox.checked) set.add(checkbox.dataset.stepCheck);
    else set.delete(checkbox.dataset.stepCheck);
    this.progress[this.currentTask.id] = [...set];
    SafeStorage.set("rhel-kb:progress", this.progress);
    checkbox.closest(".step-card")?.classList.toggle("is-complete", checkbox.checked);
    this.updateProgressDisplay();
  }

  handleDialogClick(event) {
    const copyStep = event.target.closest("[data-copy-step]");
    if (copyStep && this.currentTask) {
      const step = this.currentTask.steps.find(item => item.id === copyStep.dataset.copyStep);
      if (step) this.copy(this.resolveCommand(step.command), "تم نسخ الأمر");
      return;
    }

    const copyVerification = event.target.closest("[data-copy-verification]");
    if (copyVerification && this.currentTask) {
      const item = this.currentTask.verification[Number(copyVerification.dataset.copyVerification)];
      if (item) this.copy(this.resolveCommand(item.command), "تم نسخ أمر التحقق");
      return;
    }

    const related = event.target.closest("[data-related-task]");
    if (related) {
      const task = this.taskById.get(related.dataset.relatedTask);
      if (task) this.openTask(task);
    }
  }

  getCompletedSteps(taskId) { return new Set(this.progress[taskId] || []); }

  updateProgressDisplay() {
    if (!this.currentTask) return;
    const required = this.currentTask.steps.filter(step => !step.optional);
    const completed = this.getCompletedSteps(this.currentTask.id);
    const count = required.filter(step => completed.has(step.id)).length;
    const percent = required.length ? Math.round((count / required.length) * 100) : 0;
    const text = this.e.dialogContent.querySelector("#progressText");
    const bar = this.e.dialogContent.querySelector("#progressBar");
    if (text) text.textContent = `${count} من ${required.length} — ${percent}%`;
    if (bar) bar.style.width = `${percent}%`;
  }

  updateDialogFavoriteButton() {
    if (!this.currentTask) return;
    const favorite = this.favorites.has(this.currentTask.id);
    this.e.dialogFavoriteButton.textContent = favorite ? "★ إزالة من المفضلة" : "☆ المفضلة";
  }

  copyAllCommands() {
    if (!this.currentTask) return;
    const text = this.currentTask.steps.map((step, index) =>
      `# ${index + 1}. ${step.title_ar}\n${this.resolveCommand(step.command)}`
    ).join("\n\n");
    this.copy(text, "تم نسخ جميع أوامر المهمة");
  }

  copyTaskLink() {
    if (!this.currentTask) return;
    const url = new URL(location.href);
    url.hash = `task=${encodeURIComponent(this.currentTask.id)}`;
    this.copy(url.toString(), "تم نسخ رابط المهمة");
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

document.addEventListener("DOMContentLoaded", () => new RhelKnowledgeApp());
