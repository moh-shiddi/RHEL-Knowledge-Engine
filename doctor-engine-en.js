"use strict";

/**
 * Linux Doctor V1
 * A deterministic, offline decision-tree engine for RHEL troubleshooting.
 * It never executes commands. It only explains, prepares, and copies them.
 */
class LinuxDoctor {
  constructor(data, app) {
    this.data = data;
    this.app = app;
    this.flows = Array.isArray(data?.flows) ? data.flows : [];
    this.flowById = new Map(this.flows.map(flow => [flow.id, flow]));
    this.session = null;
    this.currentFlow = null;
    this.currentNode = null;
    this.homeQuery = "";
    this.storageKey = "rhel-doctor:session-v1";
    this.reportKey = "rhel-doctor:last-report-v1";
    this.e = this.collectElements();
    this.attachEvents();
    this.updateMetric();
    this.renderLaunchExamples();
    this.openFromHash();
    window.addEventListener("hashchange", () => this.openFromHash());
  }

  collectElements() {
    const ids = [
      "doctorShortcut", "startDoctorButton", "doctorMetric", "doctorCasesCount", "doctorCasesCountInline",
      "doctorLaunchExamples", "doctorDialog", "doctorDialogTitle", "doctorContent",
      "doctorCloseButton", "doctorHomeButton", "doctorBackButton", "doctorResetButton"
    ];
    return Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  }

  attachEvents() {
    this.e.doctorShortcut?.addEventListener("click", () => this.openHome());
    this.e.startDoctorButton?.addEventListener("click", () => this.openHome());
    document.querySelectorAll("[data-doctor-launch]").forEach(button => {
      button.addEventListener("click", () => {
        const flowId = button.dataset.doctorLaunch;
        if (flowId) this.openFlow(flowId);
        else this.openHome();
      });
    });

    this.e.doctorCloseButton?.addEventListener("click", () => this.close());
    this.e.doctorHomeButton?.addEventListener("click", () => this.renderHome());
    this.e.doctorBackButton?.addEventListener("click", () => this.goBack());
    this.e.doctorResetButton?.addEventListener("click", () => this.resetSession());

    this.e.doctorDialog?.addEventListener("click", event => {
      const rect = this.e.doctorDialog.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) this.close();
    });

    this.e.doctorContent?.addEventListener("input", event => {
      const input = event.target.closest("[data-doctor-variable]");
      if (input && this.session) {
        this.session.variables[input.dataset.doctorVariable] = input.value.trim();
        this.saveSession();
        this.refreshPreparedCommands();
      }

      const search = event.target.closest("#doctorFlowSearch");
      if (search) {
        this.homeQuery = search.value;
        this.renderFlowGrid();
      }
    });

    this.e.doctorContent?.addEventListener("click", event => this.handleClick(event));
    this.e.doctorLaunchExamples?.addEventListener("click", event => {
      const button = event.target.closest("[data-doctor-flow]");
      if (button) this.openFlow(button.dataset.doctorFlow);
    });
  }

  updateMetric() {
    if (this.e.doctorMetric) this.e.doctorMetric.textContent = this.flows.length;
    if (this.e.doctorCasesCount) this.e.doctorCasesCount.textContent = this.flows.length;
    if (this.e.doctorCasesCountInline) this.e.doctorCasesCountInline.textContent = this.flows.length;
  }

  renderLaunchExamples() {
    if (!this.e.doctorLaunchExamples) return;
    const featured = this.flows.slice(0, 5);
    this.e.doctorLaunchExamples.innerHTML = featured.map(flow => `
      <button type="button" data-doctor-flow="${this.escape(flow.id)}">
        <span aria-hidden="true">${this.escape(flow.icon || "⚕")}</span>
        ${this.escape(flow.title_ar)}
      </button>
    `).join("");
  }

  openDialog() {
    if (!this.e.doctorDialog) return;
    if (typeof this.e.doctorDialog.showModal === "function" && !this.e.doctorDialog.open) {
      this.e.doctorDialog.showModal();
    } else {
      this.e.doctorDialog.setAttribute("open", "");
    }
  }

  close() {
    if (!this.e.doctorDialog) return;
    if (this.e.doctorDialog.open && typeof this.e.doctorDialog.close === "function") {
      this.e.doctorDialog.close();
    } else {
      this.e.doctorDialog.removeAttribute("open");
    }
    if (location.hash.startsWith("#doctor=")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  openHome() {
    this.openDialog();
    this.renderHome();
    history.replaceState(null, "", "#doctor=home");
  }

  openFromHash() {
    const match = location.hash.match(/^#doctor=(.+)$/);
    if (!match) return;
    const value = decodeURIComponent(match[1]);
    if (value === "home") this.openHome();
    else if (this.flowById.has(value)) this.openFlow(value, { updateHash: false });
  }

  renderHome() {
    this.currentFlow = null;
    this.currentNode = null;
    this.setTitle("Linux Doctor");
    this.setToolbar({ home: false, back: false, reset: false });
    const saved = this.getSavedSession();

    this.e.doctorContent.innerHTML = `
      <div class="doctor-home">
        <section class="doctor-home__intro">
          <span class="doctor-kicker">Safe interactive diagnostics</span>
          <h2>What problem are you experiencing?</h2>
          <p>${this.escape(this.data.disclaimer_ar || "Choose the closest problem and follow the checks in order.")}</p>
          <div class="doctor-safety-strip">
            <span aria-hidden="true">🛡</span>
            <strong>The site never executes commands.</strong>
            <span>You review, copy, and run each command yourself.</span>
          </div>
        </section>

        ${saved ? this.renderResumeCard(saved) : ""}

        <div class="doctor-search-box">
          <span aria-hidden="true">⌕</span>
          <input id="doctorFlowSearch" type="search" autocomplete="off"
                 placeholder="Search for SSH, service, storage, permissions..."
                 value="${this.escape(this.homeQuery)}">
        </div>

        <div class="doctor-home__heading">
          <div>
            <span class="doctor-kicker">${this.flows.length} diagnostic flows</span>
            <h3>Choose the closest symptom</h3>
          </div>
        </div>
        <div id="doctorFlowGrid" class="doctor-flow-grid"></div>
      </div>
    `;
    this.renderFlowGrid();
  }

  renderResumeCard(saved) {
    const flow = this.flowById.get(saved.flowId);
    if (!flow) return "";
    const node = flow.nodes?.[saved.currentNodeId];
    return `
      <section class="doctor-resume-card">
        <div class="doctor-resume-card__icon">${this.escape(flow.icon || "⚕")}</div>
        <div>
          <span>Saved session</span>
          <strong>${this.escape(flow.title_ar)}</strong>
          <small>${node ? this.escape(node.title_ar || node.diagnosis_ar || "Continue diagnosis") : "Continue diagnosis"}</small>
        </div>
        <button type="button" class="doctor-primary-button" data-doctor-resume>Continue</button>
        <button type="button" class="doctor-ghost-button" data-doctor-discard>Delete</button>
      </section>
    `;
  }

  renderFlowGrid() {
    const grid = document.getElementById("doctorFlowGrid");
    if (!grid) return;
    const normalized = this.normalize(this.homeQuery);
    const flows = this.flows.filter(flow => {
      if (!normalized) return true;
      const haystack = this.normalize([
        flow.title_ar, flow.summary_ar, flow.category,
        ...(flow.keywords_ar || [])
      ].join(" "));
      return normalized.split(" ").filter(Boolean).every(token => haystack.includes(token));
    });

    if (!flows.length) {
      grid.innerHTML = `
        <div class="doctor-empty">
          <span>⌕</span>
          <strong>No matching diagnostic flow</strong>
          <p>Try terms such as service, SSH, network, storage, DNF, or permissions.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = flows.map(flow => `
      <article class="doctor-flow-card">
        <div class="doctor-flow-card__icon" aria-hidden="true">${this.escape(flow.icon || "⚕")}</div>
        <div class="doctor-flow-card__body">
          <span>${this.escape(this.data.categories?.[flow.category] || flow.category || "Diagnostics")}</span>
          <h4>${this.escape(flow.title_ar)}</h4>
          <p>${this.escape(flow.summary_ar)}</p>
          <div class="doctor-flow-card__meta">
            <small>About ${Number(flow.estimated_minutes || 10)} minutes</small>
            <small>${this.difficultyLabel(flow.difficulty)}</small>
          </div>
        </div>
        <button type="button" data-doctor-flow="${this.escape(flow.id)}">Start diagnosis</button>
      </article>
    `).join("");
  }

  openFlow(flowId, { updateHash = true, resume = false } = {}) {
    const flow = this.flowById.get(flowId);
    if (!flow) return;
    this.openDialog();
    this.currentFlow = flow;

    if (resume) {
      const saved = this.getSavedSession();
      if (saved?.flowId === flowId) {
        this.session = saved;
        this.currentNode = flow.nodes?.[saved.currentNodeId] || null;
        if (this.currentNode) this.renderNode();
        else this.renderSetup();
        return;
      }
    }

    this.session = {
      flowId,
      currentNodeId: null,
      variables: Object.fromEntries((flow.variables || []).map(variable => [
        variable.name,
        variable.default || ""
      ])),
      answers: [],
      history: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.currentNode = null;
    this.renderSetup();
    if (updateHash) history.replaceState(null, "", `#doctor=${encodeURIComponent(flowId)}`);
  }

  renderSetup() {
    const flow = this.currentFlow;
    this.setTitle(flow.title_ar);
    this.setToolbar({ home: true, back: false, reset: true });

    const variables = (flow.variables || []).map(variable => `
      <label class="doctor-variable-field">
        <span>${this.escape(variable.label_ar)}${variable.required ? " *" : ""}</span>
        <input type="text" data-doctor-variable="${this.escape(variable.name)}"
               value="${this.escape(this.session.variables[variable.name] || variable.default || "")}"
               placeholder="Example: ${this.escape(variable.example || "")}">
        <small>&lt;${this.escape(variable.name)}&gt;</small>
      </label>
    `).join("");

    this.e.doctorContent.innerHTML = `
      <div class="doctor-setup">
        <div class="doctor-setup__hero">
          <span class="doctor-setup__icon">${this.escape(flow.icon || "⚕")}</span>
          <div>
            <span class="doctor-kicker">${this.escape(this.data.categories?.[flow.category] || "Diagnostic flow")}</span>
            <h2>${this.escape(flow.title_ar)}</h2>
            <p>${this.escape(flow.summary_ar)}</p>
          </div>
        </div>

        <div class="doctor-info-grid">
          <div><span>Estimated time</span><strong>${Number(flow.estimated_minutes || 10)} minutes</strong></div>
          <div><span>Level</span><strong>${this.difficultyLabel(flow.difficulty)}</strong></div>
          <div><span>Decision stages</span><strong>Up to ${Number(flow.max_steps || 5)} stages</strong></div>
        </div>

        ${variables ? `
          <section class="doctor-variable-panel">
            <div>
              <span class="doctor-kicker">Before you begin</span>
              <h3>Enter the information you know</h3>
              <p>Linux Doctor uses these values to prepare commands. Optional fields may be left blank.</p>
            </div>
            <div class="doctor-variable-grid">${variables}</div>
          </section>
        ` : ""}

        <section class="doctor-expectation-card">
          <h3>How does the diagnosis work?</h3>
          <ol>
            <li>Copy the check command and run it on the affected system.</li>
            <li>Choose the result that best matches the output.</li>
            <li>The flow adapts until it reaches a diagnosis and recommended actions.</li>
          </ol>
        </section>

        <div class="doctor-setup__actions">
          <button type="button" class="doctor-primary-button doctor-primary-button--large" data-doctor-start>
            Start the first check
          </button>
          ${flow.related_entity_id ? `
            <button type="button" class="doctor-ghost-button" data-doctor-open-entity="${this.escape(flow.related_entity_id)}">
              Open the full reference
            </button>
          ` : ""}
        </div>
      </div>
    `;
  }

  startCurrentFlow() {
    const missing = (this.currentFlow.variables || [])
      .filter(variable => variable.required && !String(this.session.variables[variable.name] || "").trim());
    if (missing.length) {
      this.toast(`Enter: ${missing.map(item => item.label_ar).join(", ")}`);
      const first = this.e.doctorContent.querySelector(`[data-doctor-variable="${missing[0].name}"]`);
      first?.focus();
      return;
    }

    this.session.currentNodeId = this.currentFlow.start_node;
    this.currentNode = this.currentFlow.nodes[this.session.currentNodeId];
    this.saveSession();
    this.renderNode();
  }

  renderNode() {
    const node = this.currentFlow?.nodes?.[this.session?.currentNodeId];
    if (!node) {
      this.toast("The diagnostic stage could not be found");
      this.renderHome();
      return;
    }
    this.currentNode = node;
    this.setTitle(this.currentFlow.title_ar);
    this.setToolbar({ home: true, back: this.session.history.length > 0, reset: true });

    if (node.type === "result") this.renderResult(node);
    else this.renderDecisionNode(node);
  }

  renderDecisionNode(node) {
    const stepNumber = this.session.history.length + 1;
    const max = Number(this.currentFlow.max_steps || 5);
    const progress = Math.min(88, Math.max(8, Math.round((stepNumber / max) * 100)));
    const isCheck = node.type === "check";
    const command = isCheck ? this.prepare(node.command) : "";

    this.e.doctorContent.innerHTML = `
      <div class="doctor-session">
        ${this.renderSessionHeader(progress, stepNumber, max)}

        <article class="doctor-question-card ${isCheck ? "doctor-question-card--check" : ""}">
          <span class="doctor-node-type">${isCheck ? "Check command" : "Diagnostic question"}</span>
          <h2>${this.escape(node.title_ar)}</h2>
          <p>${this.escape(node.text_ar || "")}</p>
          ${node.help_ar ? `<div class="doctor-help-note">${this.escape(node.help_ar)}</div>` : ""}

          ${isCheck ? `
            <div class="doctor-command-panel" data-doctor-command-template="${this.escape(node.command)}">
              <div class="doctor-command-panel__top">
                <span>${node.requires_sudo ? "Requires sudo" : "Read-only check"}</span>
                <span class="doctor-risk doctor-risk--${this.escape(node.risk || "low")}">${this.riskLabel(node.risk)}</span>
              </div>
              <code data-prepared-command>${this.escape(command)}</code>
              <button type="button" data-doctor-copy="${this.escape(command)}">Copy command</button>
            </div>
            ${node.explanation_ar ? `<p class="doctor-command-explanation"><strong>Why?</strong> ${this.escape(node.explanation_ar)}</p>` : ""}
            ${node.expected_result_ar ? `<div class="doctor-expected"><strong>What should you look for?</strong><span>${this.escape(node.expected_result_ar)}</span></div>` : ""}
          ` : ""}

          <div class="doctor-choice-list">
            ${(node.choices || []).map(choice => `
              <button type="button" class="doctor-choice doctor-choice--${this.escape(choice.tone || "normal")}" data-doctor-choice="${this.escape(choice.id)}">
                <span>${this.escape(choice.label_ar)}</span>
                <b aria-hidden="true">←</b>
                ${choice.note_ar ? `<small>${this.escape(choice.note_ar)}</small>` : ""}
              </button>
            `).join("")}
          </div>
        </article>

        ${this.renderVariableDrawer()}
      </div>
    `;
  }

  renderSessionHeader(progress, stepNumber, max) {
    return `
      <div class="doctor-session-header">
        <div class="doctor-session-header__identity">
          <span>${this.escape(this.currentFlow.icon || "⚕")}</span>
          <div><small>Linux Doctor</small><strong>${this.escape(this.currentFlow.title_ar)}</strong></div>
        </div>
        <div class="doctor-progress-label"><span>Stage ${stepNumber}</span><small>of up to ${max}</small></div>
        <div class="doctor-progress"><i style="width:${progress}%"></i></div>
      </div>
    `;
  }

  renderVariableDrawer() {
    if (!(this.currentFlow.variables || []).length) return "";
    return `
      <details class="doctor-variable-drawer">
        <summary>Edit command values</summary>
        <div class="doctor-variable-grid">
          ${(this.currentFlow.variables || []).map(variable => `
            <label class="doctor-variable-field">
              <span>${this.escape(variable.label_ar)}</span>
              <input type="text" data-doctor-variable="${this.escape(variable.name)}"
                     value="${this.escape(this.session.variables[variable.name] || "")}"
                     placeholder="${this.escape(variable.example || "")}">
              <small>&lt;${this.escape(variable.name)}&gt;</small>
            </label>
          `).join("")}
        </div>
      </details>
    `;
  }

  renderResult(node) {
    const progress = 100;
    const confidence = {
      high: ["High confidence", "high"],
      medium: ["Medium confidence", "medium"],
      low: ["Initial confidence", "low"]
    }[node.confidence] || ["Medium confidence", "medium"];

    this.e.doctorContent.innerHTML = `
      <div class="doctor-session doctor-result-view">
        ${this.renderSessionHeader(progress, this.session.history.length + 1, this.currentFlow.max_steps || 5)}

        <section class="doctor-result-hero">
          <div class="doctor-result-hero__mark">✓</div>
          <div>
            <span class="doctor-confidence doctor-confidence--${confidence[1]}">${confidence[0]}</span>
            <h2>${this.escape(node.diagnosis_ar)}</h2>
            <p>${this.escape(node.summary_ar)}</p>
          </div>
        </section>

        ${(node.likely_causes_ar || []).length ? `
          <section class="doctor-result-section">
            <div class="doctor-result-section__heading"><span>01</span><div><small>Interpretation</small><h3>Likely causes</h3></div></div>
            <ul class="doctor-cause-list">${node.likely_causes_ar.map(item => `<li>${this.escape(item)}</li>`).join("")}</ul>
          </section>
        ` : ""}

        ${(node.actions || []).length ? `
          <section class="doctor-result-section">
            <div class="doctor-result-section__heading"><span>02</span><div><small>Action</small><h3>Recommended actions</h3></div></div>
            <div class="doctor-action-list">
              ${node.actions.map((item, index) => this.renderAction(item, index)).join("")}
            </div>
          </section>
        ` : ""}

        ${(node.verification || []).length ? `
          <section class="doctor-result-section">
            <div class="doctor-result-section__heading"><span>03</span><div><small>Verification</small><h3>How do you verify the fix?</h3></div></div>
            <div class="doctor-verification-list">
              ${node.verification.map(item => `
                <article>
                  <strong>${this.escape(item.title_ar)}</strong>
                  <div><code>${this.escape(this.prepare(item.command))}</code><button type="button" data-doctor-copy="${this.escape(this.prepare(item.command))}">Copy</button></div>
                  <p>${this.escape(item.expected_result_ar || "")}</p>
                </article>
              `).join("")}
            </div>
          </section>
        ` : ""}

        ${(node.safety_notes_ar || []).length ? `
          <section class="doctor-safety-result">
            <strong>Safety notice</strong>
            <ul>${node.safety_notes_ar.map(item => `<li>${this.escape(item)}</li>`).join("")}</ul>
          </section>
        ` : ""}

        <section class="doctor-report-actions">
          <button type="button" class="doctor-primary-button" data-doctor-copy-report>Copy diagnostic report</button>
          <button type="button" class="doctor-ghost-button" data-doctor-download-report>Download TXT report</button>
          <button type="button" class="doctor-ghost-button" data-doctor-restart>Restart diagnosis</button>
        </section>

        ${(node.related_entity_ids || []).length ? `
          <section class="doctor-related-section">
            <h3>Related knowledge references</h3>
            <div>
              ${node.related_entity_ids.map(id => {
                const entity = this.app.entityById.get(id);
                return entity ? `<button type="button" data-doctor-open-entity="${this.escape(id)}">${this.escape(entity.title_ar)}</button>` : "";
              }).join("")}
            </div>
          </section>
        ` : ""}
      </div>
    `;

    this.session.completedAt = new Date().toISOString();
    this.saveSession();
    try { SafeStorage.set(this.reportKey, this.buildReport()); } catch { /* optional */ }
  }

  renderAction(item, index) {
    const command = item.command ? this.prepare(item.command) : "";
    return `
      <article class="doctor-action-card">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <div>
          <div class="doctor-action-card__title">
            <strong>${this.escape(item.title_ar)}</strong>
            ${item.risk ? `<small class="doctor-risk doctor-risk--${this.escape(item.risk)}">${this.riskLabel(item.risk)}</small>` : ""}
          </div>
          ${item.explanation_ar ? `<p>${this.escape(item.explanation_ar)}</p>` : ""}
          ${command ? `<div class="doctor-inline-command"><code>${this.escape(command)}</code><button type="button" data-doctor-copy="${this.escape(command)}">Copy</button></div>` : ""}
        </div>
      </article>
    `;
  }

  choose(choiceId) {
    const node = this.currentNode;
    const choice = (node.choices || []).find(item => item.id === choiceId);
    if (!choice) return;

    this.session.history.push({
      nodeId: node.id,
      nodeType: node.type,
      title_ar: node.title_ar,
      command: node.type === "check" ? this.prepare(node.command) : "",
      choiceId: choice.id,
      choiceLabel_ar: choice.label_ar,
      answeredAt: new Date().toISOString()
    });
    this.session.answers.push({ nodeId: node.id, choiceId: choice.id });
    this.session.currentNodeId = choice.next;
    this.session.updatedAt = new Date().toISOString();
    this.currentNode = this.currentFlow.nodes[choice.next];
    this.saveSession();
    this.renderNode();
    this.e.doctorContent.scrollTop = 0;
  }

  goBack() {
    if (!this.session || !this.currentFlow) return;
    if (!this.session.history.length) {
      this.renderSetup();
      return;
    }
    const previous = this.session.history.pop();
    this.session.answers.pop();
    this.session.currentNodeId = previous.nodeId;
    delete this.session.completedAt;
    this.currentNode = this.currentFlow.nodes[previous.nodeId];
    this.saveSession();
    this.renderNode();
  }

  resetSession() {
    if (!this.currentFlow) {
      this.clearSavedSession();
      this.renderHome();
      return;
    }
    const flowId = this.currentFlow.id;
    this.clearSavedSession();
    this.openFlow(flowId);
    this.toast("Diagnosis restarted from the beginning");
  }

  handleClick(event) {
    const flowButton = event.target.closest("[data-doctor-flow]");
    if (flowButton) return this.openFlow(flowButton.dataset.doctorFlow);

    if (event.target.closest("[data-doctor-start]")) return this.startCurrentFlow();
    if (event.target.closest("[data-doctor-resume]")) {
      const saved = this.getSavedSession();
      if (saved) return this.openFlow(saved.flowId, { resume: true });
    }
    if (event.target.closest("[data-doctor-discard]")) {
      this.clearSavedSession();
      this.renderHome();
      return this.toast("Saved session deleted");
    }

    const choice = event.target.closest("[data-doctor-choice]");
    if (choice) return this.choose(choice.dataset.doctorChoice);

    const copy = event.target.closest("[data-doctor-copy]");
    if (copy) return this.copy(copy.dataset.doctorCopy, "Command copied");

    const entityButton = event.target.closest("[data-doctor-open-entity]");
    if (entityButton) return this.openRelatedEntity(entityButton.dataset.doctorOpenEntity);

    if (event.target.closest("[data-doctor-copy-report]")) {
      return this.copy(this.buildReport(), "Diagnostic report copied");
    }
    if (event.target.closest("[data-doctor-download-report]")) return this.downloadReport();
    if (event.target.closest("[data-doctor-restart]")) return this.resetSession();
  }

  openRelatedEntity(id) {
    const entity = this.app.entityById.get(id);
    if (!entity) return this.toast("The reference is not available in the current knowledge base");
    this.close();
    this.app.openEntity(entity, { initialVariables: { ...(this.session?.variables || {}) } });
  }

  refreshPreparedCommands() {
    this.e.doctorContent.querySelectorAll("[data-doctor-command-template]").forEach(panel => {
      const code = panel.querySelector("[data-prepared-command]");
      const button = panel.querySelector("[data-doctor-copy]");
      const prepared = this.prepare(panel.dataset.doctorCommandTemplate || "");
      if (code) code.textContent = prepared;
      if (button) button.dataset.doctorCopy = prepared;
    });
  }

  prepare(value = "") {
    return String(value).replace(/<([A-Z0-9_]+)>/g, (match, name) => {
      const replacement = this.session?.variables?.[name];
      return replacement ? replacement : match;
    });
  }

  buildReport() {
    if (!this.currentFlow || !this.session) return "";
    const node = this.currentFlow.nodes[this.session.currentNodeId];
    const lines = [
      "Linux Doctor Report",
      "===================",
      `Flow: ${this.currentFlow.title_ar}`,
      `Started: ${new Date(this.session.startedAt).toLocaleString("en-US")}`,
      `Report generated: ${new Date().toLocaleString("en-US")}`,
      "",
      "Variables:",
      ...(Object.entries(this.session.variables || {}).map(([key, value]) => `- ${key}: ${value || "Not specified"}`)),
      "",
      "Diagnostic steps:"
    ];

    (this.session.history || []).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title_ar}`);
      if (item.command) lines.push(`   Command: ${item.command}`);
      lines.push(`   Selected result: ${item.choiceLabel_ar}`);
    });

    if (node?.type === "result") {
      lines.push("", `Diagnosis: ${node.diagnosis_ar}`, node.summary_ar || "");
      if (node.likely_causes_ar?.length) {
        lines.push("", "Likely causes:", ...node.likely_causes_ar.map(item => `- ${item}`));
      }
      if (node.actions?.length) {
        lines.push("", "Recommended actions:");
        node.actions.forEach((item, index) => {
          lines.push(`${index + 1}. ${item.title_ar}`);
          if (item.command) lines.push(`   ${this.prepare(item.command)}`);
          if (item.explanation_ar) lines.push(`   ${item.explanation_ar}`);
        });
      }
      if (node.verification?.length) {
        lines.push("", "Verification:");
        node.verification.forEach(item => {
          lines.push(`- ${item.title_ar}: ${this.prepare(item.command)}`);
          if (item.expected_result_ar) lines.push(`  Expected: ${item.expected_result_ar}`);
        });
      }
    }

    lines.push("", "Notice: This report is advisory; the site did not execute any command on the system.");
    return lines.join("\n");
  }

  downloadReport() {
    const report = this.buildReport();
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `linux-doctor-${this.currentFlow?.id || "report"}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.toast("TXT report prepared");
  }

  getSavedSession() {
    try {
      const saved = SafeStorage.get(this.storageKey, null);
      if (!saved || !this.flowById.has(saved.flowId)) return null;
      return saved;
    } catch {
      return null;
    }
  }

  saveSession() {
    if (!this.session) return;
    this.session.updatedAt = new Date().toISOString();
    SafeStorage.set(this.storageKey, this.session);
  }

  clearSavedSession() {
    this.session = null;
    try { localStorage.removeItem(this.storageKey); } catch { /* optional */ }
  }

  setTitle(title) {
    if (this.e.doctorDialogTitle) this.e.doctorDialogTitle.textContent = title;
  }

  setToolbar({ home, back, reset }) {
    if (this.e.doctorHomeButton) this.e.doctorHomeButton.hidden = !home;
    if (this.e.doctorBackButton) this.e.doctorBackButton.hidden = !back;
    if (this.e.doctorResetButton) this.e.doctorResetButton.hidden = !reset;
  }

  riskLabel(risk = "low") {
    return ({ low: "Read-only", medium: "Use caution", high: "High-impact change", critical: "Critical" })[risk] || risk;
  }

  difficultyLabel(value) {
    return ({ beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" })[value] || value || "Intermediate";
  }

  normalize(value = "") {
    return String(value).toLowerCase()
      .replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
      .replace(/[ؤ]/g, "و").replace(/[ئ]/g, "ي")
      .replace(/[\u064B-\u065F]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ").trim();
  }

  escape(value = "") {
    const element = document.createElement("div");
    element.textContent = String(value);
    return element.innerHTML;
  }

  async copy(text, message = "Copied") {
    if (this.app?.copy) return this.app.copy(text, message);
    try {
      await navigator.clipboard.writeText(text);
      this.toast(message);
    } catch {
      this.toast("Automatic copy failed");
    }
  }

  toast(message) {
    if (this.app?.showToast) this.app.showToast(message);
  }
}
