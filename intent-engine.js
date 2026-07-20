"use strict";

(function (root, factory) {
  const Engine = factory();
  if (typeof module === "object" && module.exports) module.exports = Engine;
  root.RhelIntentEngine = Engine;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  class RhelIntentEngine {
    constructor(config, entities = []) {
      this.config = config || {};
      this.entities = entities || [];
      this.entityById = new Map(this.entities.map(entity => [entity.id, entity]));
      this.minimumScore = Number(this.config.minimum_score || 18);
      this.aliasToCanonical = new Map();
      this.technicalTerms = new Set();
      this.buildDictionary();
    }

    normalize(value = "") {
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

    buildDictionary() {
      for (const [canonicalRaw, aliasesRaw] of Object.entries(this.config.canonical_terms || {})) {
        const canonical = this.normalize(canonicalRaw);
        this.technicalTerms.add(canonical);
        this.aliasToCanonical.set(canonical, canonicalRaw);
        for (const aliasRaw of aliasesRaw || []) {
          const alias = this.normalize(aliasRaw);
          if (!this.aliasToCanonical.has(alias)) this.aliasToCanonical.set(alias, canonicalRaw);
        }
      }
      for (const item of [...(this.config.known_services || []), ...(this.config.known_packages || [])]) {
        this.technicalTerms.add(this.normalize(item));
      }
    }

    tokenize(value) {
      return this.normalize(value).split(" ").filter(Boolean);
    }

    correctQuery(query) {
      let normalized = this.normalize(query);
      const phraseAliases = [...this.aliasToCanonical.entries()]
        .filter(([alias]) => alias.includes(" "))
        .sort((a, b) => b[0].length - a[0].length);
      const corrections = [];

      for (const [alias, canonicalRaw] of phraseAliases) {
        if (normalized.includes(alias)) {
          const canonical = this.normalize(canonicalRaw);
          if (alias !== canonical) corrections.push({ from: alias, to: canonicalRaw });
          normalized = normalized.replaceAll(alias, canonical);
        }
      }

      const tokens = normalized.split(" ").filter(Boolean);
      const correctedTokens = tokens.map(token => {
        const stripped = token.startsWith("ال") && token.length > 4 ? token.slice(2) : token;
        const direct = this.aliasToCanonical.get(token) || this.aliasToCanonical.get(stripped);
        if (direct) {
          const canonical = this.normalize(direct);
          if (canonical !== token) corrections.push({ from: token, to: direct });
          return canonical;
        }

        if (!/[a-z]/i.test(token) || token.length < 4) return token;
        let best = null;
        for (const candidate of this.technicalTerms) {
          if (!/[a-z]/i.test(candidate)) continue;
          const distance = this.damerauLevenshtein(token, candidate);
          const limit = token.length <= 5 ? 1 : 2;
          if (distance <= limit && (!best || distance < best.distance)) best = { candidate, distance };
        }
        if (best && best.candidate !== token) {
          corrections.push({ from: token, to: best.candidate });
          return best.candidate;
        }
        return token;
      });

      return {
        original: String(query || "").trim(),
        normalized: this.normalize(query),
        corrected: correctedTokens.join(" "),
        tokens: correctedTokens,
        corrections: this.uniqueCorrections(corrections)
      };
    }

    uniqueCorrections(items) {
      const seen = new Set();
      return items.filter(item => {
        const key = `${item.from}>${item.to}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    damerauLevenshtein(a, b) {
      const da = {};
      const max = a.length + b.length;
      const matrix = Array.from({ length: a.length + 2 }, () => Array(b.length + 2).fill(0));
      matrix[0][0] = max;
      for (let i = 0; i <= a.length; i++) { matrix[i + 1][0] = max; matrix[i + 1][1] = i; }
      for (let j = 0; j <= b.length; j++) { matrix[0][j + 1] = max; matrix[1][j + 1] = j; }
      for (let i = 1; i <= a.length; i++) {
        let db = 0;
        for (let j = 1; j <= b.length; j++) {
          const i1 = da[b[j - 1]] || 0;
          const j1 = db;
          let cost = 1;
          if (a[i - 1] === b[j - 1]) { cost = 0; db = j; }
          matrix[i + 1][j + 1] = Math.min(
            matrix[i][j] + cost,
            matrix[i + 1][j] + 1,
            matrix[i][j + 1] + 1,
            matrix[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1)
          );
        }
        da[a[i - 1]] = i;
      }
      return matrix[a.length + 1][b.length + 1];
    }

    extractEntities(corrected) {
      const text = corrected.corrected;
      const tokens = corrected.tokens;
      const values = {};
      const evidence = [];

      const markedPort = text.match(/(?:port|بورت|منفذ)\s*[:=]?\s*(\d{1,5})\b/);
      const hasAddress = /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text);
      const standalonePort = !hasAddress ? text.match(/\b(\d{1,5})\b/) : null;
      const portMatch = markedPort || standalonePort;
      if (portMatch) {
        const port = Number(portMatch[1]);
        if (port >= 1 && port <= 65535) { values.PORT = String(port); evidence.push(["PORT", String(port)]); }
      }

      if (/\budp\b/.test(text)) values.PROTOCOL = "udp";
      else if (/\btcp\b/.test(text)) values.PROTOCOL = "tcp";
      if (values.PROTOCOL) evidence.push(["PROTOCOL", values.PROTOCOL]);

      const zoneMatch = text.match(/(?:zone|منطقه|منطقة)\s+([a-z0-9_-]+)/i);
      if (zoneMatch) values.ZONE = zoneMatch[1];

      const pathMatch = String(corrected.original).match(/(?:^|\s)(\/(?:[^\s"']+))/);
      if (pathMatch) { values.PATH = pathMatch[1]; evidence.push(["PATH", values.PATH]); }

      const ipv4 = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
      const domain = !pathMatch ? text.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i) : null;
      if (ipv4 || domain) { values.HOST = (ipv4 || domain)[0]; evidence.push(["HOST", values.HOST]); }

      const service = this.findKnown(tokens, this.config.known_services || []);
      if (service) { values.SERVICE = service; evidence.push(["SERVICE", service]); }
      const serviceAfter = this.afterMarker(tokens, ["service", "خدمه", "سيرفس"]);
      if (!values.SERVICE && serviceAfter) { values.SERVICE = serviceAfter; evidence.push(["SERVICE", serviceAfter]); }

      const packageName = this.findKnown(tokens, this.config.known_packages || []);
      if (packageName) { values.PACKAGE = packageName; evidence.push(["PACKAGE", packageName]); }
      const packageAfter = this.afterMarker(tokens, ["install", "package", "برنامج", "تطبيق", "حزمه"]);
      if (!values.PACKAGE && packageAfter && !this.isGeneric(packageAfter)) {
        values.PACKAGE = packageAfter; evidence.push(["PACKAGE", packageAfter]);
      }

      const userAfter = this.afterMarker(tokens, ["user", "يوزر", "مستخدم", "حساب", "password", "passwd", "باسورد"]);
      if (userAfter && !this.isGeneric(userAfter)) { values.USER = userAfter; evidence.push(["USER", userAfter]); }
      const groupAfter = this.afterMarker(tokens, ["group", "مجموعه", "قروب"]);
      if (groupAfter && !this.isGeneric(groupAfter)) { values.GROUP = groupAfter; evidence.push(["GROUP", groupAfter]); }

      const textMatch = String(corrected.original).match(/["“](.+?)["”]/);
      if (textMatch) { values.TEXT = textMatch[1]; evidence.push(["TEXT", values.TEXT]); }

      if (!values.PORT && tokens.includes("ssh")) values.PORT = "22";
      if (!values.PROTOCOL && /(port|بورت|منفذ|firewall)/.test(text)) values.PROTOCOL = "tcp";
      if (!values.ZONE && /(firewall|بورت|منفذ)/.test(text)) values.ZONE = "public";

      return { values, evidence };
    }

    findKnown(tokens, knownItems) {
      const normalizedMap = new Map((knownItems || []).map(item => [this.normalize(item), item]));
      for (const token of tokens) if (normalizedMap.has(token)) return normalizedMap.get(token);
      return null;
    }

    afterMarker(tokens, markers) {
      const normalizedMarkers = new Set(markers.map(item => this.normalize(item)));
      for (let i = 0; i < tokens.length - 1; i++) {
        if (normalizedMarkers.has(tokens[i])) {
          const candidate = tokens[i + 1];
          if (candidate && !this.isGeneric(candidate)) return candidate;
        }
      }
      return null;
    }

    isGeneric(token) {
      return new Set(["جديد","جديده","ما","هو","لا","في","من","الي","على","كل","البرنامج","الخدمه","الملف","المجلد","نظام","لينكس","ريد","هات","rhel","enable","start","stop","restart","failed","open","close","install","remove","update","service","package","user","port"]).has(token);
    }

    scoreIntent(intent, corrected, extracted) {
      const correctedText = corrected.corrected;
      const originalText = corrected.normalized;
      const combinedText = `${correctedText} ${originalText}`;
      const correctedTokens = new Set(corrected.tokens);
      const originalTokens = new Set(originalText.split(" ").filter(Boolean));
      const hasTerm = termRaw => {
        const term = this.normalize(termRaw);
        if (!term) return false;
        if (term.includes(" ")) return combinedText.includes(term);
        return correctedTokens.has(term) || originalTokens.has(term);
      };
      const signals = intent.signals || {};
      let score = 0;
      let phraseMatches = 0;
      let groupMatches = 0;
      let anyMatches = 0;
      const reasons = [];

      for (const phraseRaw of signals.phrases_ar || []) {
        const phrase = this.normalize(phraseRaw);
        if (phrase && originalText.includes(phrase)) {
          score += 64; phraseMatches++; reasons.push(`عبارة: ${phraseRaw}`);
        }
      }

      for (const termRaw of signals.any_terms || []) {
        if (hasTerm(termRaw)) { score += 8; anyMatches++; reasons.push(`كلمة: ${termRaw}`); }
      }

      for (const groupRaw of signals.all_groups || []) {
        if (groupRaw.length && groupRaw.every(hasTerm)) {
          score += 42 + groupRaw.length * 3; groupMatches++; reasons.push(`ترابط: ${groupRaw.join(" + ")}`);
        }
      }

      for (const termRaw of signals.exclude_terms || []) {
        if (hasTerm(termRaw)) score -= 40;
      }

      // A single generic word such as "برنامج" or "ssh" is not enough to infer intent.
      const matchedRequired = (intent.required_variables || []).filter(variable => extracted.values[variable]).length;
      if (phraseMatches === 0 && groupMatches === 0 && anyMatches < 2 && !(anyMatches >= 1 && matchedRequired >= 1)) return { score: 0, reasons: [] };

      for (const variable of intent.required_variables || []) {
        if (extracted.values[variable]) score += 7;
      }

      if ((intent.target_entities || []).some(id => this.entityById.has(id))) score += 2;
      return { score, reasons };
    }

    analyze(query) {
      const corrected = this.correctQuery(query);
      if (!corrected.corrected) return this.emptyAnalysis(corrected);
      const extracted = this.extractEntities(corrected);
      const ranked = (this.config.intents || [])
        .map(intent => ({ intent, ...this.scoreIntent(intent, corrected, extracted) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.intent.title_ar.localeCompare(b.intent.title_ar, "ar"));

      const top = ranked[0] || null;
      if (!top || top.score < this.minimumScore) return { ...this.emptyAnalysis(corrected), extracted, alternatives: ranked.slice(0, 3) };
      const second = ranked[1]?.score || 0;
      const confidence = this.confidence(top.score, top.score - second);
      const target = (top.intent.target_entities || []).map(id => this.entityById.get(id)).find(Boolean) || null;
      const missing = (top.intent.required_variables || []).filter(name => !extracted.values[name]);
      const searchTerms = [corrected.corrected, ...(top.intent.query_expansions || []), ...Object.values(extracted.values)].filter(Boolean);

      return {
        query: corrected.original,
        corrected,
        extracted,
        intent: top.intent,
        intentScore: top.score,
        confidence,
        target,
        missingVariables: missing,
        searchQuery: [...new Set(searchTerms)].join(" "),
        reasons: top.reasons.slice(0, 5),
        alternatives: ranked.slice(1, 4)
      };
    }

    emptyAnalysis(corrected) {
      return { query: corrected.original, corrected, extracted: { values: {}, evidence: [] }, intent: null, intentScore: 0, confidence: "none", target: null, missingVariables: [], searchQuery: corrected.corrected, reasons: [], alternatives: [] };
    }

    confidence(score, margin) {
      if (score >= Number(this.config.high_confidence_score || 58) && margin >= 8) return "high";
      if (score >= Number(this.config.medium_confidence_score || 34)) return "medium";
      return "low";
    }

    scoreEntity(entity, analysis) {
      if (!analysis?.intent) return 0;
      const intent = analysis.intent;
      let score = 0;
      const targetIndex = (intent.target_entities || []).indexOf(entity.id);
      if (targetIndex >= 0) score += 700 - targetIndex * 70;
      if ((intent.preferred_types || []).includes(entity.entity_type)) score += 115;
      if ((intent.preferred_categories || []).includes(entity.category)) score += 65;
      const blob = this.normalize(JSON.stringify(entity));
      for (const value of Object.values(analysis.extracted?.values || {})) {
        const normalizedValue = this.normalize(value);
        if (normalizedValue && blob.includes(normalizedValue)) score += 20;
      }
      return score;
    }

    variableDefaults(analysis, entity = null) {
      const values = { ...(analysis?.extracted?.values || {}) };
      for (const variable of entity?.variables || []) {
        const prompt = this.config.variable_prompts?.[variable.name];
        if (!values[variable.name] && prompt?.default) values[variable.name] = prompt.default;
      }
      for (const name of analysis?.intent?.required_variables || []) {
        const prompt = this.config.variable_prompts?.[name];
        if (!values[name] && prompt?.default) values[name] = prompt.default;
      }
      return values;
    }
  }
  return RhelIntentEngine;
});
