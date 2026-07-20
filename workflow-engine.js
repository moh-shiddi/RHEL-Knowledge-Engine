"use strict";

class GuidedWorkflowRunner {
  constructor(app) {
    this.app = app;
    this.sessions = SafeStorage.get("rhel-ke:workflow-sessions", {});
    this.task = null;
    this.session = null;
    this.mode = "library";
    this.query = "";
    this.filter = "all";
    this.stageMeta = {
      prepare: ["1", "قبل البدء", "المتطلبات والبيانات"],
      execute: ["2", "التنفيذ", "الأوامر خطوة بخطوة"],
      verify: ["3", "التحقق", "التأكد من النتيجة"],
      issues: ["4", "التشخيص", "نتائج التحليل والفحوصات"],
      rollback: ["5", "التراجع", "العودة للوضع السابق"],
      complete: ["✓", "الإنهاء", "الملخص والتقرير"]
    };
    this.labels = {
      PACKAGE:"اسم الحزمة", SERVICE:"اسم الخدمة", USER:"اسم المستخدم",
      GROUP:"اسم المجموعة", PATH:"المسار", FILE:"اسم الملف",
      DIR:"اسم المجلد", PORT:"رقم المنفذ", PROTOCOL:"البروتوكول",
      HOST:"عنوان الخادم", ZONE:"منطقة الجدار الناري", COMMAND:"الأمر",
      TEXT:"النص", SIZE:"الحجم", TIME:"الوقت", DEVICE:"الجهاز",
      MOUNT_POINT:"نقطة الربط", SOURCE:"المصدر", DESTINATION:"الوجهة"
    };
    this.examples = {
      PACKAGE:"nginx", SERVICE:"nginx", USER:"ahmed", GROUP:"developers",
      PATH:"/var/log", FILE:"report.txt", DIR:"/srv/app", PORT:"8080",
      PROTOCOL:"tcp", HOST:"192.168.1.10", ZONE:"public",
      COMMAND:"/usr/local/bin/backup.sh", TEXT:"error", SIZE:"500M",
      TIME:"02:00", DEVICE:"/dev/sdb1", MOUNT_POINT:"/mnt/data",
      SOURCE:"/data", DESTINATION:"/backup"
    };
    this.bindElements();
    this.bindEvents();
  }

  bindElements() {
    const ids = [
      "workflowDialog","workflowDialogTitle","workflowLibraryButton",
      "workflowReportButton","workflowPauseButton","workflowCloseButton",
      "workflowSidebar","workflowContent","workflowFooter",
      "workflowPreviousButton","workflowNextButton","workflowFooterStatus",
      "workflowShortcut","activeWorkflowCount","startWorkflowButton",
      "browseWorkflowsButton","resumeWorkflowButton","workflowMetric",
      "workflowAvailableCount","workflowActiveCount","workflowCompletedCount",
      "workflowResumeSummary","workflowExamples"
    ];
    this.e = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  }

  bindEvents() {
    this.e.workflowShortcut?.addEventListener("click", () => this.openLibrary());
    this.e.startWorkflowButton?.addEventListener("click", () => this.openLibrary());
    this.e.browseWorkflowsButton?.addEventListener("click", () => this.openLibrary());
    this.e.resumeWorkflowButton?.addEventListener("click", () => this.resumeLatest());
    this.e.workflowLibraryButton?.addEventListener("click", () => this.openLibrary(false));
    this.e.workflowReportButton?.addEventListener("click", () => this.go("complete"));
    this.e.workflowPauseButton?.addEventListener("click", () => this.pause());
    this.e.workflowCloseButton?.addEventListener("click", () => this.close());
    this.e.workflowPreviousButton?.addEventListener("click", () => this.previous());
    this.e.workflowNextButton?.addEventListener("click", () => this.next());
    this.e.workflowContent?.addEventListener("input", e => this.onInput(e));
    this.e.workflowContent?.addEventListener("change", e => this.onChange(e));
    this.e.workflowContent?.addEventListener("click", e => this.onClick(e));
    this.e.workflowSidebar?.addEventListener("click", e => this.onSidebarClick(e));
  }

  workflows() {
    return this.app.entities.filter(x =>
      ["task","troubleshooting"].includes(x.entity_type) &&
      Array.isArray(x.steps) && x.steps.length
    );
  }

  variables(task) {
    const map = new Map((task.variables || []).map(v => [v.name, {
      name:v.name, label_ar:v.label_ar || this.labels[v.name] || v.name,
      example:v.example || this.examples[v.name] || "", required:v.required !== false
    }]));
    const text = [
      ...(task.steps || []).map(x => x.command),
      ...(task.verification || []).map(x => x.command),
      ...(task.common_errors || []).flatMap(x => (x.checks || []).map(y => y.command)),
      ...(task.rollback_ar || [])
    ].join("\n");
    for (const match of text.matchAll(/<([A-Z][A-Z0-9_]*)>/g)) {
      const name = match[1];
      if (!map.has(name)) map.set(name, {
        name, label_ar:this.labels[name] || name,
        example:this.examples[name] || "", required:true
      });
    }
    return [...map.values()];
  }

  newSession(task, variables={}) {
    const values = {};
    this.variables(task).forEach(v => values[v.name] = variables[v.name] || "");
    return {
      taskId:task.id, state:"active", stage:"prepare",
      stepIndex:0, verificationIndex:0,
      startedAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
      completedAt:null, prerequisites:{}, variables:values,
      stepStatus:{}, stepNotes:{}, stepDiagnostics:{}, verificationStatus:{},
      verificationNotes:{}, verificationDiagnostics:{}, rollbackStatus:{}, issueNotes:"",
      visited:["prepare"]
    };
  }

  normalizedSession(task, saved, variables={}) {
    const base = this.newSession(task, variables);
    const result = {
      ...base, ...saved,
      variables:{...base.variables,...(saved?.variables||{}),...variables},
      prerequisites:{...(saved?.prerequisites||{})},
      stepStatus:{...(saved?.stepStatus||{})},
      stepNotes:{...(saved?.stepNotes||{})},
      stepDiagnostics:{...(saved?.stepDiagnostics||{})},
      verificationStatus:{...(saved?.verificationStatus||{})},
      verificationNotes:{...(saved?.verificationNotes||{})},
      verificationDiagnostics:{...(saved?.verificationDiagnostics||{})},
      rollbackStatus:{...(saved?.rollbackStatus||{})},
      visited:Array.isArray(saved?.visited) ? saved.visited : ["prepare"]
    };
    if (!this.stages(task).includes(result.stage)) result.stage = "prepare";
    return result;
  }

  start(task, {variables={}, resume=true}={}) {
    if (!task) return;
    this.task = task;
    const saved = this.sessions[task.id];
    this.session = resume && saved && saved.state !== "completed"
      ? this.normalizedSession(task, saved, variables)
      : this.newSession(task, variables);
    this.mode = "runner";
    this.save();
    this.open();
    this.render();
  }

  restart() {
    if (!this.task) return;
    delete this.sessions[this.task.id];
    this.session = this.newSession(this.task);
    this.save();
    this.render();
  }

  openLibrary(open=true) {
    this.mode = "library";
    this.task = null;
    this.session = null;
    if (open) this.open();
    this.render();
  }

  open() {
    if (typeof this.e.workflowDialog.showModal === "function" && !this.e.workflowDialog.open)
      this.e.workflowDialog.showModal();
    else this.e.workflowDialog.setAttribute("open","");
  }

  close() {
    this.save();
    if (this.e.workflowDialog.open && typeof this.e.workflowDialog.close === "function")
      this.e.workflowDialog.close();
    else this.e.workflowDialog.removeAttribute("open");
    this.updateDashboard();
  }

  pause() {
    if (!this.session) return;
    if (this.session.state !== "completed") this.session.state = "paused";
    this.save();
    this.close();
    this.app.showToast("تم حفظ المسار ويمكن استكماله لاحقاً");
  }

  resumeLatest() {
    const session = this.latest(["active","paused"]);
    const task = session && this.app.entityById.get(session.taskId);
    task ? this.start(task,{resume:true}) : this.openLibrary();
  }

  latest(states=[]) {
    const allowed = new Set(states);
    return Object.values(this.sessions)
      .filter(x => !states.length || allowed.has(x.state))
      .sort((a,b) => new Date(b.updatedAt||0)-new Date(a.updatedAt||0))[0] || null;
  }

  save() {
    if (!this.task || !this.session) return;
    this.session.updatedAt = new Date().toISOString();
    this.sessions[this.task.id] = this.session;
    SafeStorage.set("rhel-ke:workflow-sessions",this.sessions);
    this.updateDashboard();
  }

  stages(task) {
    const list = ["prepare","execute"];
    if ((task.verification||[]).length) list.push("verify");
    if ((task.common_errors||[]).length) list.push("issues");
    if ((task.rollback_ar||[]).length) list.push("rollback");
    list.push("complete");
    return list;
  }

  go(stage) {
    if (!this.task || !this.stages(this.task).includes(stage)) return;
    this.session.stage = stage;
    if (!this.session.visited.includes(stage)) this.session.visited.push(stage);
    this.save(); this.render();
  }

  render() {
    this.mode === "library" ? this.renderLibrary() : this.renderRunner();
  }

  renderLibrary() {
    const q = ArabicText.normalize(this.query);
    const items = this.workflows().filter(task => {
      const session = this.sessions[task.id];
      if (this.filter === "active" && !["active","paused"].includes(session?.state)) return false;
      if (this.filter === "completed" && session?.state !== "completed") return false;
      if (this.filter === "task" && task.entity_type !== "task") return false;
      if (this.filter === "troubleshooting" && task.entity_type !== "troubleshooting") return false;
      if (!q) return true;
      const text = ArabicText.normalize([task.title_ar,task.summary_ar,task.goal_ar,...(task.keywords_ar||[])].join(" "));
      return text.includes(q) || ArabicText.tokenize(this.query).some(t => text.includes(t));
    }).sort((a,b) => {
      const sa=this.sessions[a.id], sb=this.sessions[b.id];
      const aa=["active","paused"].includes(sa?.state)?1:0, ab=["active","paused"].includes(sb?.state)?1:0;
      return ab-aa || a.title_ar.localeCompare(b.title_ar,"ar");
    });

    this.e.workflowDialogTitle.textContent = "مسارات التنفيذ الموجهة";
    this.e.workflowLibraryButton.hidden = true;
    this.e.workflowPauseButton.hidden = true;
    this.e.workflowReportButton.hidden = true;
    this.e.workflowFooter.hidden = true;
    this.e.workflowSidebar.innerHTML = `
      <span class="wf-side-label">الجلسات</span>
      ${[["all","كل المسارات"],["active","قيد التنفيذ"],["completed","المكتملة"]].map(([v,l]) =>
        `<button data-wf-filter="${v}" class="${this.filter===v?"active":""}"><span>${l}</span><b>${
          v==="all"?this.workflows().length:v==="active"?this.activeCount():this.completedCount()
        }</b></button>`).join("")}
      ${this.latest(["active","paused"]) ? `<button class="wf-resume" data-wf-resume>استكمال آخر جلسة</button>` : ""}
    `;
    this.e.workflowContent.innerHTML = `
      <section class="wf-library">
        <header><span class="eyebrow">Guided Workflow Library</span><h2>اختر مهمة لبدء جلسة منظمة</h2>
          <p>الأداة تعرض الأوامر وتحفظ التقدم، لكنها لا تنفذ شيئاً على جهازك.</p></header>
        <div class="wf-library-controls">
          <input id="wfSearch" type="search" value="${ArabicText.escape(this.query)}" placeholder="ابحث عن مهمة أو مشكلة...">
          <div>${[["all","الكل"],["active","قيد التنفيذ"],["completed","المكتملة"],["task","المهام"],["troubleshooting","حل المشكلات"]].map(([v,l]) =>
            `<button data-wf-filter="${v}" class="${this.filter===v?"active":""}">${l}</button>`).join("")}</div>
        </div>
        <div class="wf-cards">${items.length?items.map(t=>this.libraryCard(t)).join(""):`<div class="wf-empty">لا توجد نتائج مطابقة</div>`}</div>
      </section>`;
    const input=this.e.workflowContent.querySelector("#wfSearch");
    input?.addEventListener("input",e=>{this.query=e.target.value;this.renderLibrary();this.e.workflowContent.querySelector("#wfSearch")?.focus();});
  }

  libraryCard(task) {
    const s=this.sessions[task.id], progress=s?this.progress(task,s):0;
    return `<article class="wf-card">
      <header><div><span class="type-badge type-${task.entity_type}">${task.entity_type==="troubleshooting"?"⚕ حل مشكلة":"✓ مهمة"}</span>
      <span class="category-badge">${ArabicText.escape(this.app.data.categories[task.category]||task.category)}</span></div>
      ${s?`<b class="wf-state ${s.state}">${this.stateLabel(s.state)}</b>`:""}</header>
      <h3>${ArabicText.escape(task.title_ar)}</h3><p>${ArabicText.escape(task.summary_ar)}</p>
      <div class="wf-meta"><span>${task.steps.length} خطوات</span><span>${task.estimated_minutes||0} دقيقة</span><span>${this.app.difficultyLabels[task.difficulty]||task.difficulty}</span></div>
      ${s?`<div class="wf-mini"><span>التقدم ${progress}%</span><i><b style="width:${progress}%"></b></i></div>`:""}
      <footer><button data-wf-start="${task.id}">${s&&s.state!=="completed"?"استكمال":"بدء المسار"}</button>
      <button data-wf-details="${task.id}">صفحة المعرفة</button>
      ${s?`<button class="delete" data-wf-delete="${task.id}" title="حذف الجلسة">×</button>`:""}</footer>
    </article>`;
  }

  renderRunner() {
    if (!this.task || !this.session) return this.openLibrary(false);
    const stages=this.stages(this.task);
    this.e.workflowDialogTitle.textContent=this.task.title_ar;
    this.e.workflowLibraryButton.hidden=false;
    this.e.workflowPauseButton.hidden=this.session.state==="completed";
    this.e.workflowReportButton.hidden=false;
    this.e.workflowSidebar.innerHTML=this.sidebar(stages);
    this.e.workflowContent.innerHTML=this.stageContent();
    this.e.workflowFooter.hidden=this.session.stage==="complete";
    this.footer(stages);
  }

  sidebar(stages) {
    const p=this.progress(this.task,this.session);
    return `<div class="wf-progress"><strong>${p}%</strong><span>${this.stateLabel(this.session.state)}</span></div>
      <nav class="wf-stages">${stages.map(stage=>{
        const [icon,label,desc]=this.stageMeta[stage], current=this.session.stage===stage, done=this.stageDone(stage);
        return `<button data-wf-stage="${stage}" class="${current?"current":""} ${done?"done":""}">
          <span>${done?"✓":icon}</span><div><strong>${label}</strong><small>${desc}</small></div></button>`;
      }).join("")}</nav>
      <div class="wf-side-meta"><span>المدة <b>${this.task.estimated_minutes||0}د</b></span><span>الخطوات <b>${this.task.steps.length}</b></span></div>`;
  }

  stageContent() {
    const stage=this.session.stage;
    if(stage==="prepare") return this.prepare();
    if(stage==="execute") return this.execute();
    if(stage==="verify") return this.verify();
    if(stage==="issues") return this.issues();
    if(stage==="rollback") return this.rollback();
    return this.completeView();
  }

  heading(label,title,text) {
    return `<header class="wf-heading"><span class="eyebrow">${label}</span><h2>${ArabicText.escape(title)}</h2><p>${ArabicText.escape(text)}</p></header>`;
  }

  prepare() {
    const t=this.task,s=this.session,vars=this.variables(t),pre=t.prerequisites_ar||[];
    return `<section class="wf-stage">${this.heading("المرحلة 1","جهز المهمة قبل التنفيذ","راجع المتطلبات وأدخل القيم التي ستستبدل المتغيرات داخل الأوامر.")}
      <div class="wf-goal"><strong>${ArabicText.escape(t.goal_ar||t.title_ar)}</strong><p>${ArabicText.escape(t.summary_ar||"")}</p></div>
      ${pre.length?`<div class="wf-panel"><h3>قائمة الاستعداد</h3><div class="wf-checklist">${pre.map((x,i)=>`<label class="${s.prerequisites[i]?"checked":""}"><input type="checkbox" data-wf-pre="${i}" ${s.prerequisites[i]?"checked":""}><span>✓</span><strong>${ArabicText.escape(x)}</strong></label>`).join("")}</div></div>`:""}
      ${vars.length?`<div class="wf-panel"><h3>بيانات المهمة</h3><p>تتغير الأوامر تلقائياً عند إدخال القيم.</p><div class="wf-vars">${vars.map(v=>`<label><span>${ArabicText.escape(v.label_ar)} ${v.required?"<b>مطلوب</b>":""}</span><input data-wf-var="${v.name}" value="${ArabicText.escape(s.variables[v.name]||"")}" placeholder="مثال: ${ArabicText.escape(v.example)}"><code>&lt;${v.name}&gt;</code></label>`).join("")}</div></div>`:""}
      <div class="wf-warning"><strong>تنبيه</strong><p>مستوى الخطورة: ${ArabicText.escape(this.app.riskLabels[t.risk]||t.risk||"منخفضة")}. راجع كل أمر قبل تنفيذه.</p></div>
    </section>`;
  }


  execute() {
    const t=this.task,s=this.session,steps=t.steps,index=Math.min(s.stepIndex,steps.length-1),step=steps[index],status=s.stepStatus[step.id]||"pending";
    const command=this.resolve(step.command), unresolved=this.unresolved(command);
    const record=this.diagnosticRecord("step",step.id);
    return `<section class="wf-stage">${this.heading(`المرحلة 2 — ${index+1}/${steps.length}`,step.title_ar,step.explanation_ar)}
      <div class="wf-dots">${steps.map((x,i)=>`<button data-wf-step="${i}" class="${i===index?"current":""} ${s.stepStatus[x.id]||"pending"}">${s.stepStatus[x.id]==="success"?"✓":s.stepStatus[x.id]==="issue"?"!":s.stepStatus[x.id]==="skipped"?"↷":i+1}</button>`).join("")}</div>
      <article class="wf-command ${status}">
        <header><div><b>${index+1}</b><div><h3>${ArabicText.escape(step.title_ar)}</h3><p>${ArabicText.escape(step.explanation_ar)}</p></div></div>
        <div>${step.requires_sudo?"<span>sudo</span>":""}${step.optional?"<span>اختيارية</span>":""}<span>${this.app.riskLabels[step.risk]||step.risk}</span></div></header>
        <div class="wf-code"><code>${ArabicText.escape(command)}</code><button data-wf-copy-step>نسخ</button></div>
        ${unresolved.length?`<div class="wf-unresolved">أكمل المتغيرات: ${unresolved.map(x=>`<code>&lt;${x}&gt;</code>`).join(" ")} <button data-wf-prepare>تعديل البيانات</button></div>`:""}
        ${step.expected_result_ar?`<div class="wf-expected"><strong>النتيجة المتوقعة</strong><p>${ArabicText.escape(step.expected_result_ar)}</p></div>`:""}
        <section class="wf-output-analyzer">
          <header><div><span>⌁</span><div><strong>الصق نتيجة الأمر</strong><small>يتم التحليل محلياً داخل المتصفح</small></div></div><b>لا يتم إرسال البيانات</b></header>
          <textarea data-wf-step-output="${ArabicText.escape(step.id)}" spellcheck="false" placeholder="الصق هنا كل ما ظهر في الطرفية...">${ArabicText.escape(record.output||"")}</textarea>
          <div class="wf-analyzer-actions">
            <button class="analyze" data-wf-analyze-step ${unresolved.length?"disabled":""}>تحليل النتيجة</button>
            <button data-wf-silent-step ${unresolved.length?"disabled":""}>الأمر نجح بلا مخرجات</button>
            <button data-wf-clear-analysis>مسح التحليل</button>
            ${step.optional?`<button data-wf-outcome="skipped">تخطي الخطوة</button>`:""}
          </div>
        </section>
        ${this.diagnosticHtml(record,"step",step.id)}
      </article>
      <div class="wf-step-list">${steps.map((x,i)=>`<button data-wf-step="${i}" class="${i===index?"current":""} ${s.stepStatus[x.id]||"pending"}"><b>${s.stepStatus[x.id]==="success"?"✓":s.stepStatus[x.id]==="issue"?"!":i+1}</b><span>${ArabicText.escape(x.title_ar)}<small>${this.statusLabel(s.stepStatus[x.id]||"pending")}</small></span></button>`).join("")}</div>
    </section>`;
  }

  verify() {
    const list=this.task.verification||[],i=Math.min(this.session.verificationIndex,list.length-1),item=list[i];
    if(!item) return `<section class="wf-stage">${this.heading("المرحلة 3","لا توجد فحوصات تحقق","يمكن الانتقال إلى التقرير النهائي.")}</section>`;
    const status=this.session.verificationStatus[i]||"pending";
    const record=this.diagnosticRecord("verify",String(i));
    return `<section class="wf-stage">${this.heading(`المرحلة 3 — ${i+1}/${list.length}`,"تحقق من نجاح المهمة","نفذ أمر التحقق والصق نتيجته ليحدد النظام النجاح أو سبب الفشل.")}
      <div class="wf-verify-tabs">${list.map((x,n)=>`<button data-wf-verify="${n}" class="${n===i?"current":""} ${this.session.verificationStatus[n]||"pending"}"><b>${this.session.verificationStatus[n]==="success"?"✓":this.session.verificationStatus[n]==="failed"?"!":n+1}</b>${ArabicText.escape(x.title_ar)}</button>`).join("")}</div>
      <article class="wf-command ${status}"><h3>${ArabicText.escape(item.title_ar)}</h3><div class="wf-code"><code>${ArabicText.escape(this.resolve(item.command))}</code><button data-wf-copy-verify>نسخ</button></div>
      <div class="wf-expected"><strong>المتوقع</strong><p>${ArabicText.escape(item.expected_result_ar||"نتيجة تؤكد نجاح العملية.")}</p></div>
      <section class="wf-output-analyzer">
        <header><div><span>⌁</span><div><strong>الصق نتيجة التحقق</strong><small>سيحدد النظام هل النتيجة ناجحة أو تكشف مشكلة</small></div></div><b>تحليل محلي</b></header>
        <textarea data-wf-verify-output="${i}" spellcheck="false" placeholder="الصق نتيجة أمر التحقق...">${ArabicText.escape(record.output||"")}</textarea>
        <div class="wf-analyzer-actions"><button class="analyze" data-wf-analyze-verify>تحليل التحقق</button><button data-wf-clear-analysis>مسح التحليل</button></div>
      </section>
      ${this.diagnosticHtml(record,"verify",String(i))}
      </article>
    </section>`;
  }

  issues() {
    const errors=this.task.common_errors||[],findings=this.allDiagnosticFindings();
    return `<section class="wf-stage">${this.heading("المرحلة 4","مركز التشخيص","يعرض النتائج التي استنتجها المحرك، إضافة إلى المشكلات المسجلة في قاعدة المعرفة.")}
      ${findings.length?`<div class="wf-collected-findings"><h3>نتائج اكتشفها المحرك أثناء الجلسة</h3>${findings.map(f=>`<article class="${f.result.status}"><header><span>${f.result.status==="success"?"✓":f.result.status==="issue"?"!":"?"}</span><div><strong>${ArabicText.escape(f.result.title_ar)}</strong><small>${ArabicText.escape(f.source)} — ثقة ${f.result.confidence||0}%</small></div></header><p>${ArabicText.escape(f.result.explanation_ar||"")}</p>${(f.result.evidence||[]).length?`<pre>${ArabicText.escape(f.result.evidence.join("\\n"))}</pre>`:""}</article>`).join("")}</div>`:""}
      ${errors.length?`<div class="wf-errors"><h3>قاعدة المشكلات الخاصة بالمهمة</h3>${errors.map((e,ei)=>`<details ${ei===0&&!findings.length?"open":""}><summary><b>!</b><strong>${ArabicText.escape(e.symptom_ar)}</strong></summary><div>
        <h4>الأسباب المحتملة</h4><ul>${(e.likely_causes_ar||[]).map(x=>`<li>${ArabicText.escape(x)}</li>`).join("")}</ul>
        ${(e.checks||[]).map((c,ci)=>`<article><strong>${ArabicText.escape(c.title_ar)}</strong><div class="wf-code"><code>${ArabicText.escape(this.resolve(c.command))}</code><button data-wf-copy-error="${ei}:${ci}">نسخ</button></div><small>المتوقع: ${ArabicText.escape(c.expected_result_ar||"")}</small></article>`).join("")}
        ${(e.fixes_ar||[]).length?`<h4>الإصلاحات المقترحة</h4><ol>${e.fixes_ar.map(x=>`<li>${ArabicText.escape(x)}</li>`).join("")}</ol>`:""}
      </div></details>`).join("")}</div>`:`<div class="wf-empty">لا توجد أخطاء خاصة بالمهمة، لكن المحرك العام ما زال متاحاً داخل كل خطوة.</div>`}
      <div class="wf-inline"><button data-wf-return>العودة إلى الخطوة المتعثرة</button>${(this.task.rollback_ar||[]).length?`<button data-wf-rollback>فتح التراجع</button>`:""}<button data-wf-doctor>فتح Linux Doctor</button></div>
    </section>`;
  }
  rollback() {
    const list=this.task.rollback_ar||[];
    return `<section class="wf-stage">${this.heading("المرحلة 5","التراجع والعودة للوضع السابق","راجع أثر كل بند قبل تنفيذه.")}
      <div class="wf-danger"><strong>منطقة حساسة</strong><p>قد تتضمن حذف حزمة أو إيقاف خدمة. أنشئ نسخة احتياطية عند الحاجة.</p></div>
      ${list.length?`<div class="wf-rollback">${list.map((x,i)=>`<article class="${this.session.rollbackStatus[i]==="done"?"done":""}"><input type="checkbox" data-wf-rollback-item="${i}" ${this.session.rollbackStatus[i]==="done"?"checked":""}><div><strong>بند ${i+1}</strong>${this.commandLike(this.resolve(x))?`<div class="wf-code"><code>${ArabicText.escape(this.resolve(x))}</code><button data-wf-copy-rollback="${i}">نسخ</button></div>`:`<p>${ArabicText.escape(this.resolve(x))}</p>`}</div></article>`).join("")}</div>`:`<div class="wf-empty">لا توجد خطة تراجع مسجلة</div>`}
    </section>`;
  }

  completeView() {
    const t=this.task,s=this.session,required=t.steps.filter(x=>!x.optional),ok=required.filter(x=>s.stepStatus[x.id]==="success").length;
    const failed=Object.values(s.verificationStatus).filter(x=>x==="failed").length,ready=ok===required.length&&!failed;
    return `<section class="wf-stage">${this.heading("المرحلة الأخيرة",s.state==="completed"?"المسار مكتمل":"الملخص والتقرير","راجع النتيجة واحفظ التقرير.")}
      <div class="wf-final ${ready?"ready":"gaps"}"><b>${ready?"✓":"!"}</b><div><strong>${ready?"جميع الخطوات المطلوبة ناجحة":"توجد عناصر تحتاج مراجعة"}</strong><p>التقدم الحالي ${this.progress(t,s)}%</p></div></div>
      <div class="wf-summary"><article><span>الخطوات</span><strong>${ok}/${required.length}</strong></article><article><span>التحقق الناجح</span><strong>${Object.values(s.verificationStatus).filter(x=>x==="success").length}</strong></article><article><span>فشل التحقق</span><strong>${failed}</strong></article><article><span>الحالة</span><strong>${this.stateLabel(s.state)}</strong></article></div>
      <pre class="wf-report">${ArabicText.escape(this.report())}</pre>
      <div class="wf-final-actions">${s.state!=="completed"?`<button class="complete" data-wf-complete>${ready?"إنهاء كمكتمل":"إنهاء مع ملاحظات"}</button>`:""}<button data-wf-copy-report>نسخ التقرير</button><button data-wf-download>تنزيل TXT</button><button data-wf-restart>جلسة جديدة</button></div>
    </section>`;
  }

  footer(stages) {
    const i=stages.indexOf(this.session.stage);
    this.e.workflowPreviousButton.disabled=i<=0;
    this.e.workflowPreviousButton.textContent=i>0?`السابق: ${this.stageMeta[stages[i-1]][1]}`:"السابق";
    this.e.workflowNextButton.hidden=i>=stages.length-1;
    if(i<stages.length-1)this.e.workflowNextButton.textContent=`التالي: ${this.stageMeta[stages[i+1]][1]}`;
    this.e.workflowFooterStatus.innerHTML=`<span>${i+1}/${stages.length}</span><i><b style="width:${Math.round((i+1)/stages.length*100)}%"></b></i>`;
  }

  next() {
    const stages=this.stages(this.task),i=stages.indexOf(this.session.stage);
    if(this.session.stage==="prepare"){
      const missing=this.missing();
      if(missing.length){this.app.showToast(`أكمل الحقول: ${missing.join("، ")}`);return;}
    }
    if(i<stages.length-1)this.go(stages[i+1]);
  }
  previous(){const s=this.stages(this.task),i=s.indexOf(this.session.stage);if(i>0)this.go(s[i-1]);}


  onInput(e) {
    const v=e.target.closest("[data-wf-var]"); if(v){this.session.variables[v.dataset.wfVar]=v.value.trim();this.save();return;}
    const n=e.target.closest("[data-wf-step-note]"); if(n){this.session.stepNotes[n.dataset.wfStepNote]=n.value;this.save();return;}
    const q=e.target.closest("[data-wf-verify-note]"); if(q){this.session.verificationNotes[q.dataset.wfVerifyNote]=q.value;this.save();return;}
    const so=e.target.closest("[data-wf-step-output]"); if(so){const r=this.diagnosticRecord("step",so.dataset.wfStepOutput);r.output=so.value;this.save();return;}
    const vo=e.target.closest("[data-wf-verify-output]"); if(vo){const r=this.diagnosticRecord("verify",vo.dataset.wfVerifyOutput);r.output=vo.value;this.save();return;}
    const follow=e.target.closest("[data-wf-followup-output]"); if(follow){const {scope,key}=this.currentDiagnosticScope();const r=this.diagnosticRecord(scope,key);r.followupOutput=follow.value;this.save();return;}
    if(e.target.matches("[data-wf-issue-notes]")){this.session.issueNotes=e.target.value;this.save();}
  }
  onChange(e) {
    const p=e.target.closest("[data-wf-pre]"); if(p){this.session.prerequisites[p.dataset.wfPre]=p.checked;this.save();this.render();return;}
    const r=e.target.closest("[data-wf-rollback-item]"); if(r){this.session.rollbackStatus[r.dataset.wfRollbackItem]=r.checked?"done":"pending";this.save();r.closest("article")?.classList.toggle("done",r.checked);}
  }

  onClick(e) {
    const filter=e.target.closest("[data-wf-filter]");if(filter){this.filter=filter.dataset.wfFilter;this.renderLibrary();return;}
    const start=e.target.closest("[data-wf-start]");if(start){const t=this.app.entityById.get(start.dataset.wfStart);if(t)this.start(t,{resume:true});return;}
    const details=e.target.closest("[data-wf-details]");if(details){const t=this.app.entityById.get(details.dataset.wfDetails);this.close();if(t)this.app.openEntity(t);return;}
    const del=e.target.closest("[data-wf-delete]");if(del&&confirm("حذف الجلسة المحفوظة؟")){delete this.sessions[del.dataset.wfDelete];SafeStorage.set("rhel-ke:workflow-sessions",this.sessions);this.updateDashboard();this.renderLibrary();return;}
    const step=e.target.closest("[data-wf-step]");if(step){this.session.stepIndex=Number(step.dataset.wfStep);this.save();this.render();return;}
    const verify=e.target.closest("[data-wf-verify]");if(verify){this.session.verificationIndex=Number(verify.dataset.wfVerify);this.save();this.render();return;}
    if(e.target.closest("[data-wf-copy-step]")){const x=this.task.steps[this.session.stepIndex];this.app.copy(this.resolve(x.command),"تم نسخ أمر الخطوة");return;}
    if(e.target.closest("[data-wf-copy-verify]")){const x=this.task.verification[this.session.verificationIndex];this.app.copy(this.resolve(x.command),"تم نسخ أمر التحقق");return;}
    if(e.target.closest("[data-wf-analyze-step]")){this.analyzeCurrent("step");return;}
    if(e.target.closest("[data-wf-analyze-verify]")){this.analyzeCurrent("verify");return;}
    if(e.target.closest("[data-wf-silent-step]")){this.silentStepSuccess();return;}
    if(e.target.closest("[data-wf-clear-analysis]")){this.clearCurrentAnalysis();return;}
    const diagCheck=e.target.closest("[data-wf-diag-check]");if(diagCheck){this.selectDiagnosticAction("checks",Number(diagCheck.dataset.wfDiagCheck));return;}
    const diagVerify=e.target.closest("[data-wf-diag-verify]");if(diagVerify){this.selectDiagnosticAction("verification",Number(diagVerify.dataset.wfDiagVerify));return;}
    if(e.target.closest("[data-wf-analyze-followup]")){this.analyzeFollowup();return;}
    if(e.target.closest("[data-wf-copy-followup]")){const {scope,key}=this.currentDiagnosticScope(),r=this.diagnosticRecord(scope,key);if(r.activeAction)this.app.copy(this.resolve(r.activeAction.command),"تم نسخ أمر الفحص");return;}
    if(e.target.closest("[data-wf-accept-step]")){this.stepOutcome("success");return;}
    if(e.target.closest("[data-wf-accept-verify]")){this.verifyOutcome("success");return;}
    if(e.target.closest("[data-wf-open-diagnosis]")){this.go("issues");return;}
    const outcome=e.target.closest("[data-wf-outcome]");if(outcome){this.stepOutcome(outcome.dataset.wfOutcome);return;}
    const vo=e.target.closest("[data-wf-verify-outcome]");if(vo){this.verifyOutcome(vo.dataset.wfVerifyOutcome);return;}
    if(e.target.closest("[data-wf-prepare]")){this.go("prepare");return;}
    if(e.target.closest("[data-wf-return]")){this.go("execute");return;}
    if(e.target.closest("[data-wf-rollback]")){this.go("rollback");return;}
    if(e.target.closest("[data-wf-doctor]")){this.close();this.app.doctor?.openHome(this.task.title_ar);return;}
    const er=e.target.closest("[data-wf-copy-error]");if(er){const [a,b]=er.dataset.wfCopyError.split(":").map(Number),x=this.task.common_errors[a].checks[b];this.app.copy(this.resolve(x.command),"تم نسخ أمر الفحص");return;}
    const rb=e.target.closest("[data-wf-copy-rollback]");if(rb){this.app.copy(this.resolve(this.task.rollback_ar[Number(rb.dataset.wfCopyRollback)]),"تم نسخ بند التراجع");return;}
    if(e.target.closest("[data-wf-complete]")){this.session.state="completed";this.session.completedAt=new Date().toISOString();this.save();this.render();return;}
    if(e.target.closest("[data-wf-copy-report]")){this.app.copy(this.report(),"تم نسخ التقرير");return;}
    if(e.target.closest("[data-wf-download]")){this.download();return;}
    if(e.target.closest("[data-wf-restart]")&&confirm("مسح التقدم وبدء جلسة جديدة؟")){this.restart();}
  }

  onSidebarClick(e) {
    const st=e.target.closest("[data-wf-stage]");if(st){this.go(st.dataset.wfStage);return;}
    const f=e.target.closest("[data-wf-filter]");if(f){this.filter=f.dataset.wfFilter;this.renderLibrary();return;}
    if(e.target.closest("[data-wf-resume]"))this.resumeLatest();
  }

  stepOutcome(value) {
    const steps=this.task.steps,step=steps[this.session.stepIndex];
    this.session.stepStatus[step.id]=value;this.save();
    if(value==="issue"&&(this.task.common_errors||[]).length)return this.go("issues");
    if(this.session.stepIndex<steps.length-1){this.session.stepIndex++;this.save();return this.render();}
    (this.task.verification||[]).length?this.go("verify"):this.go("complete");
  }

  verifyOutcome(value) {
    const list=this.task.verification||[],i=this.session.verificationIndex;
    this.session.verificationStatus[i]=value;this.save();
    if(value==="failed"&&(this.task.common_errors||[]).length)return this.go("issues");
    if(i<list.length-1){this.session.verificationIndex++;this.save();return this.render();}
    this.go("complete");
  }


  diagnosticRecord(scope,key) {
    const store=scope==="verify"?this.session.verificationDiagnostics:this.session.stepDiagnostics;
    if(!store[key])store[key]={output:"",followupOutput:"",activeAction:null,history:[]};
    if(!Array.isArray(store[key].history))store[key].history=[];
    return store[key];
  }

  currentDiagnosticScope() {
    if(this.session.stage==="verify")return {scope:"verify",key:String(this.session.verificationIndex)};
    const step=this.task.steps[this.session.stepIndex];
    return {scope:"step",key:step?.id||""};
  }

  currentDiagnosticCommand(scope) {
    if(scope==="verify"){
      const item=this.task.verification?.[this.session.verificationIndex];
      return {command:this.resolve(item?.command||""),title:item?.title_ar||"فحص التحقق"};
    }
    const step=this.task.steps[this.session.stepIndex];
    return {command:this.resolve(step?.command||""),title:step?.title_ar||"خطوة التنفيذ"};
  }

  analyzeCurrent(scope) {
    if(!this.app.executionDiagnosticEngine)return this.app.showToast("محرك التحليل غير متاح");
    const key=scope==="verify"?String(this.session.verificationIndex):this.task.steps[this.session.stepIndex].id;
    const record=this.diagnosticRecord(scope,key),output=String(record.output||"").trim();
    if(!output)return this.app.showToast("الصق نتيجة الأمر أولاً، أو استخدم خيار النجاح بلا مخرجات");
    const context=this.currentDiagnosticCommand(scope);
    const result=this.app.executionDiagnosticEngine.analyze({
      output,command:context.command,task:this.task,
      step:scope==="step"?this.task.steps[this.session.stepIndex]:{},
      variables:this.session.variables,sourceTitle:context.title
    });
    this.mergeExtractedVariables(result.extracted_variables);
    record.history.push({at:new Date().toISOString(),source:context.title,command:context.command,output,result});
    record.activeAction=null;record.followupOutput="";
    if(scope==="step")this.session.stepStatus[key]=result.status==="success"?"success":result.status==="issue"?"issue":"pending";
    else this.session.verificationStatus[key]=result.status==="success"?"success":result.status==="issue"?"failed":"pending";
    this.save();this.render();
  }

  silentStepSuccess() {
    const step=this.task.steps[this.session.stepIndex],record=this.diagnosticRecord("step",step.id);
    const result={status:"success",confidence:70,id:"silent-manual-success",title_ar:"تم تأكيد نجاح أمر بلا مخرجات",
      explanation_ar:"المستخدم أكد أن الأمر انتهى دون رسالة خطأ. يبقى فحص التحقق اللاحق هو الدليل الأقوى.",
      evidence:["لم يطبع الأمر أي مخرجات"],likely_causes_ar:[],checks:[],fixes_ar:[],
      verification:(this.task.verification||[]).slice(0,2),alternatives:[]};
    record.history.push({at:new Date().toISOString(),source:step.title_ar,command:this.resolve(step.command),output:"",result});
    this.session.stepStatus[step.id]="success";this.save();this.render();
  }

  clearCurrentAnalysis() {
    const {scope,key}=this.currentDiagnosticScope(),record=this.diagnosticRecord(scope,key);
    record.output="";record.followupOutput="";record.activeAction=null;record.history=[];
    if(scope==="step")this.session.stepStatus[key]="pending";
    else this.session.verificationStatus[key]="pending";
    this.save();this.render();
  }

  selectDiagnosticAction(group,index) {
    const {scope,key}=this.currentDiagnosticScope(),record=this.diagnosticRecord(scope,key),latest=record.history.at(-1)?.result;
    const action=latest?.[group]?.[index];if(!action)return;
    record.activeAction={...action,group,index};record.followupOutput="";
    this.save();this.render();
  }

  analyzeFollowup() {
    if(!this.app.executionDiagnosticEngine)return;
    const {scope,key}=this.currentDiagnosticScope(),record=this.diagnosticRecord(scope,key),action=record.activeAction;
    if(!action)return;
    const output=String(record.followupOutput||"").trim();
    if(!output)return this.app.showToast("الصق نتيجة الفحص التالي");
    const result=this.app.executionDiagnosticEngine.analyze({
      output,command:this.resolve(action.command),task:this.task,
      step:scope==="step"?this.task.steps[this.session.stepIndex]:{},
      variables:this.session.variables,sourceTitle:action.title_ar
    });
    this.mergeExtractedVariables(result.extracted_variables);
    record.history.push({at:new Date().toISOString(),source:action.title_ar,command:this.resolve(action.command),output,result});
    record.activeAction=null;record.followupOutput="";
    if(scope==="step")this.session.stepStatus[key]=result.status==="success"?"success":result.status==="issue"?"issue":this.session.stepStatus[key]||"pending";
    else this.session.verificationStatus[key]=result.status==="success"?"success":result.status==="issue"?"failed":this.session.verificationStatus[key]||"pending";
    this.save();this.render();
  }

  mergeExtractedVariables(values) {
    for(const [name,value] of Object.entries(values||{}))if(value&&!this.session.variables[name])this.session.variables[name]=value;
  }

  diagnosticHtml(record,scope,key) {
    if(!record.history.length)return `<div class="wf-analysis-placeholder"><span>⌁</span><div><strong>بانتظار نتيجة الطرفية</strong><p>بعد التحليل سيظهر مكان الفشل والسبب المرجح والفحص التالي والعلاج.</p></div></div>`;
    const latest=record.history.at(-1),result=latest.result,status=result.status||"unknown";
    const statusLabel=status==="success"?"النتيجة ناجحة":status==="issue"?"تم اكتشاف مشكلة":status==="empty"?"لا توجد مخرجات":"النتيجة غير حاسمة";
    const icon=status==="success"?"✓":status==="issue"?"!":"?",checks=result.checks||[],verification=result.verification||[];
    return `<section class="wf-diagnosis ${status}">
      <header><span>${icon}</span><div><small>${statusLabel}</small><h3>${ArabicText.escape(result.title_ar||"نتيجة التحليل")}</h3></div><b>ثقة ${result.confidence||0}%</b></header>
      <p class="wf-diagnosis-explanation">${ArabicText.escape(result.explanation_ar||"")}</p>
      ${(result.evidence||[]).length?`<div class="wf-evidence"><strong>الدليل من المخرجات</strong><pre>${ArabicText.escape(result.evidence.join("\n"))}</pre></div>`:""}
      ${(result.likely_causes_ar||[]).length?`<div class="wf-diagnosis-list"><h4>الأسباب المحتملة</h4><ul>${result.likely_causes_ar.map(x=>`<li>${ArabicText.escape(x)}</li>`).join("")}</ul></div>`:""}
      ${(result.alternatives||[]).length?`<div class="wf-alternatives"><strong>احتمالات أخرى</strong>${result.alternatives.map(x=>`<span>${ArabicText.escape(x.title_ar)} <b>${x.confidence}%</b></span>`).join("")}</div>`:""}
      ${checks.length?`<div class="wf-next-checks"><h4>الفحص التالي المقترح</h4>${checks.map((x,i)=>this.diagnosticActionCard(x,"check",i)).join("")}</div>`:""}
      ${(result.fixes_ar||[]).length?`<div class="wf-fixes"><h4>المعالجة المقترحة</h4><ol>${result.fixes_ar.map(x=>`<li>${ArabicText.escape(x)}</li>`).join("")}</ol></div>`:""}
      ${verification.length?`<div class="wf-next-checks verification"><h4>إثبات نجاح المعالجة</h4>${verification.map((x,i)=>this.diagnosticActionCard(x,"verify",i)).join("")}</div>`:""}
      ${record.activeAction?this.followupHtml(record):""}
      ${record.history.length>1?`<details class="wf-analysis-history"><summary>سجل التحليل (${record.history.length})</summary>${record.history.map((h,i)=>`<article><b>${i+1}</b><div><strong>${ArabicText.escape(h.source)}</strong><small>${ArabicText.escape(h.result.title_ar)} — ${h.result.confidence||0}%</small></div></article>`).join("")}</details>`:""}
      <div class="wf-diagnosis-actions">
        ${status==="success"?(scope==="step"?`<button class="accept" data-wf-accept-step>اعتماد النجاح والانتقال</button>`:`<button class="accept" data-wf-accept-verify>اعتماد التحقق والانتقال</button>`):""}
        ${status==="issue"?`<button data-wf-open-diagnosis>عرض مركز التشخيص</button>`:""}
      </div>
    </section>`;
  }

  diagnosticActionCard(item,type,index) {
    const attr=type==="verify"?`data-wf-diag-verify="${index}"`:`data-wf-diag-check="${index}"`;
    return `<article><div><strong>${ArabicText.escape(item.title_ar||"فحص")}</strong><small>${ArabicText.escape(item.expected_result_ar||"")}</small></div><div class="wf-code"><code>${ArabicText.escape(this.resolve(item.command||""))}</code><button ${attr}>استخدام الفحص</button></div></article>`;
  }

  followupHtml(record) {
    const action=record.activeAction;
    return `<section class="wf-followup"><header><span>→</span><div><strong>${ArabicText.escape(action.title_ar)}</strong><small>نفذ الفحص ثم الصق نتيجته لإكمال التشخيص</small></div></header>
      <div class="wf-code"><code>${ArabicText.escape(this.resolve(action.command||""))}</code><button data-wf-copy-followup>نسخ</button></div>
      ${action.expected_result_ar?`<p>المتوقع: ${ArabicText.escape(action.expected_result_ar)}</p>`:""}
      <textarea data-wf-followup-output spellcheck="false" placeholder="الصق نتيجة الفحص هنا...">${ArabicText.escape(record.followupOutput||"")}</textarea>
      <button class="analyze" data-wf-analyze-followup>تحليل نتيجة الفحص</button>
    </section>`;
  }

  allDiagnosticFindings() {
    const output=[];
    for(const step of this.task.steps||[]){
      const record=this.session.stepDiagnostics?.[step.id];
      for(const item of record?.history||[])output.push({source:step.title_ar,result:item.result,at:item.at});
    }
    for(const [key,record] of Object.entries(this.session.verificationDiagnostics||{})){
      const title=this.task.verification?.[Number(key)]?.title_ar||`تحقق ${Number(key)+1}`;
      for(const item of record?.history||[])output.push({source:title,result:item.result,at:item.at});
    }
    return output.sort((a,b)=>new Date(b.at)-new Date(a.at));
  }
  resolve(text) {
    let out=String(text||"");
    for(const [k,v] of Object.entries(this.session?.variables||{}))if(v)out=out.replaceAll(`<${k}>`,v);
    return out;
  }
  unresolved(text){return [...String(text).matchAll(/<([A-Z][A-Z0-9_]*)>/g)].map(x=>x[1]).filter((x,i,a)=>a.indexOf(x)===i);}
  missing(){return this.variables(this.task).filter(v=>v.required&&!String(this.session.variables[v.name]||"").trim()).map(v=>v.name);}
  commandLike(x){return /^(sudo\s+)?[a-z0-9_.-]+(\s|$)/i.test(String(x).trim())&&!/[،؛؟]/.test(x);}

  stageDone(stage) {
    if(stage==="prepare")return !this.missing().length&&(this.task.prerequisites_ar||[]).every((_,i)=>this.session.prerequisites[i]);
    if(stage==="execute")return this.task.steps.filter(x=>!x.optional).every(x=>this.session.stepStatus[x.id]==="success");
    if(stage==="verify")return !(this.task.verification||[]).length||(this.task.verification||[]).every((_,i)=>this.session.verificationStatus[i]==="success");
    if(stage==="issues")return this.session.visited.includes("issues");
    if(stage==="rollback")return (this.task.rollback_ar||[]).length&&(this.task.rollback_ar||[]).every((_,i)=>this.session.rollbackStatus[i]==="done");
    return this.session.state==="completed";
  }

  progress(task,session) {
    if(session.state==="completed")return 100;
    const steps=task.steps.filter(x=>!x.optional),checks=task.verification||[];
    const ready=this.variables(task).filter(x=>x.required).every(x=>session.variables[x.name])&&(task.prerequisites_ar||[]).every((_,i)=>session.prerequisites[i]);
    const done=steps.filter(x=>session.stepStatus[x.id]==="success").length;
    const verified=checks.filter((_,i)=>session.verificationStatus[i]==="success").length;
    return Math.min(99,Math.round(((ready?1:0)+done+(checks.length?verified:1))/(1+Math.max(1,steps.length)+Math.max(1,checks.length))*100));
  }

  stateLabel(s){return({active:"قيد التنفيذ",paused:"محفوظة",completed:"مكتملة"})[s]||"لم تبدأ";}
  statusLabel(s){return({pending:"لم تبدأ",success:"ناجحة",issue:"توجد مشكلة",skipped:"تم التخطي",failed:"فشل"})[s]||s;}
  activeCount(){return Object.values(this.sessions).filter(x=>["active","paused"].includes(x.state)).length;}
  completedCount(){return Object.values(this.sessions).filter(x=>x.state==="completed").length;}

  report() {
    const t=this.task,s=this.session,lines=["تقرير مسار تنفيذ RHEL","================================",`المهمة: ${t.title_ar}`,`الحالة: ${this.stateLabel(s.state)}`,`التقدم: ${this.progress(t,s)}%`,`بدأت: ${this.date(s.startedAt)}`,"","خطوات التنفيذ","----------------"];
    t.steps.forEach((x,i)=>{
      lines.push(`${i+1}. ${x.title_ar} — ${this.statusLabel(s.stepStatus[x.id]||"pending")}`,`   ${this.resolve(x.command)}`);
      const history=s.stepDiagnostics?.[x.id]?.history||[];
      if(history.length){const last=history.at(-1).result;lines.push(`   التشخيص: ${last.title_ar} — ثقة ${last.confidence||0}%`);if(last.evidence?.length)lines.push(`   الدليل: ${last.evidence.join(" | ")}`);}
      if(s.stepNotes[x.id])lines.push(`   ملاحظة: ${s.stepNotes[x.id]}`);
    });
    if((t.verification||[]).length){lines.push("","التحقق","----------------");t.verification.forEach((x,i)=>lines.push(`${i+1}. ${x.title_ar} — ${this.statusLabel(s.verificationStatus[i]||"pending")}`,`   ${this.resolve(x.command)}`));}
    if(s.issueNotes)lines.push("","ملاحظات المشكلة",s.issueNotes);
    lines.push("","تنبيه: هذه جلسة تعليمية ولا تعني أن الأوامر نُفذت تلقائياً.");
    return lines.join("\n");
  }

  download() {
    const blob=new Blob([this.report()],{type:"text/plain;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=`rhel-workflow-${this.task.id}.txt`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    this.app.showToast("تم تنزيل التقرير");
  }

  date(v){if(!v)return"—";return new Date(v).toLocaleString("ar-SA",{dateStyle:"medium",timeStyle:"short"});}

  updateDashboard() {
    const count=this.app?.entities?.length?this.workflows().length:0,active=this.activeCount(),completed=this.completedCount(),latest=this.latest(["active","paused"]);
    if(this.e.workflowMetric)this.e.workflowMetric.textContent=count||"—";
    if(this.e.workflowAvailableCount)this.e.workflowAvailableCount.textContent=count;
    if(this.e.workflowActiveCount)this.e.workflowActiveCount.textContent=active;
    if(this.e.workflowCompletedCount)this.e.workflowCompletedCount.textContent=completed;
    if(this.e.activeWorkflowCount)this.e.activeWorkflowCount.textContent=active;
    if(this.e.resumeWorkflowButton)this.e.resumeWorkflowButton.hidden=!latest;
    if(this.e.workflowResumeSummary)this.e.workflowResumeSummary.innerHTML=latest?`<strong>${ArabicText.escape(this.app.entityById.get(latest.taskId)?.title_ar||latest.taskId)}</strong><span>${this.stateLabel(latest.state)} — ${this.app.entityById.get(latest.taskId)?this.progress(this.app.entityById.get(latest.taskId),latest):0}%</span>`:`<strong>لم تبدأ أي جلسة بعد</strong><span>اختر مهمة عملية لبدء أول مسار.</span>`;
    if(this.e.workflowExamples&&count){const items=this.workflows().filter(x=>x.content_level!=="legacy").slice(0,4);this.e.workflowExamples.innerHTML=items.map(x=>`<button data-wf-home="${x.id}"><span>▶</span><div><strong>${ArabicText.escape(x.title_ar)}</strong><small>${x.steps.length} خطوات</small></div></button>`).join("");this.e.workflowExamples.querySelectorAll("[data-wf-home]").forEach(b=>b.onclick=()=>this.start(this.app.entityById.get(b.dataset.wfHome),{resume:true}));}
  }
}
window.GuidedWorkflowRunner=GuidedWorkflowRunner;
