(() => {
  "use strict";

  /* ------------------------------------------------------------------
     Constants & utilities
     ------------------------------------------------------------------ */

  const API = "https://api.github.com";
  const STORE_KEY = "projetract.v1";
  const TOKEN_KEY = "projetract.token";
  const DAY = 86400000;
  const SEED = window.PROJETRACT_SEED || {};
  const SEED_REPOS = Array.isArray(SEED.repos) ? SEED.repos : [];
  const SEED_TIME = SEED.generated_at || null;
  const DEFAULT_USER = SEED.user || "lulgabc";

  const STATUS = {
    pulling: { label: "牵引", en: "PULLING", order: 0 },
    coasting: { label: "滑行", en: "COASTING", order: 1 },
    drifting: { label: "漂流", en: "DRIFTING", order: 2 },
    parked: { label: "停泊", en: "PARKED", order: 3 },
  };

  const LANG_COLORS = {
    TypeScript: "#3178c6",
    JavaScript: "#e8d44d",
    HTML: "#e34c26",
    CSS: "#663399",
    Astro: "#ff5a03",
    Swift: "#f05138",
    Rust: "#dea584",
    Python: "#3572a5",
    Ada: "#02f88c",
    Shell: "#89e051",
    Vue: "#41b883",
    Svelte: "#ff3e00",
    Go: "#00add8",
    "Jupyter Notebook": "#da5b0b",
    MDX: "#fcb32c",
    SCSS: "#c6538c",
    Ruby: "#701516",
    Java: "#b07219",
    "C++": "#f34b7d",
    C: "#555555",
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const pad2 = (n) => String(n).padStart(2, "0");
  const sum = (arr) => arr.reduce((total, value) => total + (Number(value) || 0), 0);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const numberFormat = new Intl.NumberFormat("en-US");

  function startOfDay(input) {
    const date = new Date(input);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function localDayKey(input) {
    const date = new Date(input);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function daySerial(input) {
    const date = new Date(input);
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
  }

  function daysAgo(input) {
    if (!input) return 9999;
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return 9999;
    return daySerial(new Date()) - daySerial(date);
  }

  function relTime(input) {
    if (!input) return "未知";
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return "未知";
    const diff = Date.now() - date.getTime();
    if (diff < 0) return "刚刚";
    if (diff < 3600000) return "刚刚";
    if (diff < DAY) return `${Math.max(1, Math.floor(diff / 3600000))} 小时前`;
    const days = daysAgo(date);
    if (days <= 1) return "昨天";
    if (days < 7) return `${days} 天前`;
    if (days < 30) return `${Math.floor(days / 7)} 周前`;
    if (days < 365) return `${Math.floor(days / 30)} 个月前`;
    return `${Math.floor(days / 365)} 年前`;
  }

  function fmtDate(input) {
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return "—";
    return `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
  }

  function fmtShortDate(input) {
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return "—";
    return `${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
  }

  function fmtClock(input) {
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return "—";
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function fmtCount(n) {
    return numberFormat.format(Number(n) || 0);
  }

  function niceMax(value) {
    if (!value || value <= 0) return 4;
    if (value <= 5) return 5;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const step = magnitude / 2;
    return Math.ceil(value / step) * step;
  }

  function safeHttpUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(String(value));
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch (error) {
      return "";
    }
    return "";
  }

  function githubUrl(fullName) {
    return `https://github.com/${String(fullName)
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")}`;
  }

  function langColor(language) {
    return LANG_COLORS[language] || "var(--muted)";
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }

  /* ------------------------------------------------------------------
     State
     ------------------------------------------------------------------ */

  const state = {
    repos: [],
    model: null,
    filter: "all",
    search: "",
    settings: {
      theme: "day",
      sort: "traction",
      handle: DEFAULT_USER,
      tokenLogin: null,
    },
    token: "",
    tokenRemember: false,
    rate: null,
    rateNotified: false,
    sync: { active: false, done: 0, total: 0 },
    scan: { items: [], handle: "", loading: false, allSelected: false },
    adding: false,
    activeDetail: null,
    pendingRemove: null,
    toastTimer: null,
    chartRaf: 0,
    countsLoading: new Set(),
    bannerDismissed: false,
  };

  const refs = {
    clock: $("#clock"),
    syncBtn: $("#syncBtn"),
    syncLabel: $("#syncLabel"),
    addBtn: $("#addBtn"),
    settingsBtn: $("#settingsBtn"),
    themeBtn: $("#themeBtn"),
    banner: $("#banner"),
    bannerText: $("#bannerText"),
    bannerAction: $("#bannerAction"),
    bannerClose: $("#bannerClose"),
    eyebrowCount: $("#eyebrowCount"),
    statPulling: $("#statPulling"),
    statCommits: $("#statCommits"),
    statActive: $("#statActive"),
    statParked: $("#statParked"),
    gaugeTicks: $("#gaugeTicks"),
    gaugeNum: $("#gaugeNum"),
    gaugeCaption: $("#gaugeCaption"),
    gaugeMeta: $("#gaugeMeta"),
    gaugeMini: $("#gaugeMini"),
    dataStamp: $("#dataStamp"),
    seismoChart: $("#seismoChart"),
    notePeak: $("#notePeak"),
    notePeakSub: $("#notePeakSub"),
    noteActive: $("#noteActive"),
    noteLast: $("#noteLast"),
    noteLastSub: $("#noteLastSub"),
    boardSub: $("#boardSub"),
    filters: $("#filters"),
    resultCount: $("#resultCount"),
    searchInput: $("#searchInput"),
    sortSelect: $("#sortSelect"),
    grid: $("#grid"),
    emptyState: $("#emptyState"),
    emptyTitle: $("#emptyTitle"),
    emptyCopy: $("#emptyCopy"),
    emptyAddBtn: $("#emptyAddBtn"),
    emptyResetBtn: $("#emptyResetBtn"),
    footerUser: $("#footerUser"),
    settingsUser: $("#settingsUser"),
    detailDialog: $("#detailDialog"),
    detailBody: $("#detailBody"),
    addDialog: $("#addDialog"),
    settingsDialog: $("#settingsDialog"),
    tabSingleBtn: $("#tabSingleBtn"),
    tabScanBtn: $("#tabScanBtn"),
    singlePanel: $("#singlePanel"),
    scanPanel: $("#scanPanel"),
    singleForm: $("#singleForm"),
    repoInput: $("#repoInput"),
    singleError: $("#singleError"),
    singleSubmit: $("#singleSubmit"),
    handleInput: $("#handleInput"),
    scanForm: $("#scanForm"),
    scanBtn: $("#scanBtn"),
    scanResults: $("#scanResults"),
    selectAllBtn: $("#selectAllBtn"),
    scanAddBtn: $("#scanAddBtn"),
    tokenStatus: $("#tokenStatus"),
    tokenInput: $("#tokenInput"),
    tokenRemember: $("#tokenRemember"),
    tokenSaveBtn: $("#tokenSaveBtn"),
    tokenClearBtn: $("#tokenClearBtn"),
    tokenError: $("#tokenError"),
    themeChoice: $("#themeChoice"),
    dataSummary: $("#dataSummary"),
    rateStatus: $("#rateStatus"),
    settingsSyncBtn: $("#settingsSyncBtn"),
    exportBtn: $("#exportBtn"),
    restoreSeedBtn: $("#restoreSeedBtn"),
    toast: $("#toast"),
  };

  /* ------------------------------------------------------------------
     Persistence
     ------------------------------------------------------------------ */

  function normalizeRepo(raw) {
    if (!raw || typeof raw !== "object" || !raw.full_name) return null;
    const weeks = Array.isArray(raw.weeks)
      ? raw.weeks
          .filter((week) => week && Number.isFinite(Number(week.start)))
          .map((week) => {
            const days = Array.isArray(week.days)
              ? week.days.slice(0, 7).map((n) => Number(n) || 0)
              : [];
            while (days.length < 7) days.push(0);
            return {
              start: Number(week.start),
              total: Number(week.total) || sum(days),
              days,
            };
          })
          .sort((a, b) => a.start - b.start)
          .slice(-52)
      : [];

    return {
      full_name: String(raw.full_name),
      name: String(raw.name || raw.full_name.split("/").pop() || "repo"),
      owner: String(raw.owner || raw.full_name.split("/")[0] || ""),
      description: String(raw.description || ""),
      homepage: String(raw.homepage || ""),
      language: raw.language ? String(raw.language) : null,
      topics: Array.isArray(raw.topics) ? raw.topics.map(String).slice(0, 20) : [],
      license: raw.license ? String(raw.license) : null,
      default_branch: String(raw.default_branch || "main"),
      stars: Number(raw.stars) || 0,
      forks: Number(raw.forks) || 0,
      watchers: Number(raw.watchers) || 0,
      open_issues_total: Number(raw.open_issues_total) || 0,
      open_issues: raw.open_issues == null ? null : Number(raw.open_issues),
      open_prs: raw.open_prs == null ? null : Number(raw.open_prs),
      created_at: raw.created_at || null,
      updated_at: raw.updated_at || null,
      pushed_at: raw.pushed_at || null,
      size: Number(raw.size) || 0,
      archived: Boolean(raw.archived),
      fork: Boolean(raw.fork),
      visibility: raw.visibility || (raw.private ? "private" : "public"),
      languages: raw.languages && typeof raw.languages === "object" ? raw.languages : {},
      weeks,
      activity_partial: Boolean(raw.activity_partial),
      _fetchedAt: raw._fetchedAt || SEED_TIME || new Date().toISOString(),
      _origin: raw._origin || "seed",
      _countsAt:
        raw._countsAt ||
        (raw.open_issues != null || raw.open_prs != null ? raw._fetchedAt || SEED_TIME : null),
    };
  }

  function loadState() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch (error) {
      saved = null;
    }

    state.token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
    state.tokenRemember = Boolean(localStorage.getItem(TOKEN_KEY));

    if (saved && saved.v === 1 && Array.isArray(saved.repos)) {
      state.repos = saved.repos.map(normalizeRepo).filter(Boolean);
      if (saved.settings) {
        state.settings.theme = saved.settings.theme === "night" ? "night" : "day";
        state.settings.sort = ["traction", "recent", "commits", "name"].includes(saved.settings.sort)
          ? saved.settings.sort
          : "traction";
        state.settings.handle = saved.settings.handle || DEFAULT_USER;
        state.settings.tokenLogin = saved.settings.tokenLogin || null;
      }
    } else {
      state.repos = SEED_REPOS.map((repo) =>
        normalizeRepo({
          ...clone(repo),
          _fetchedAt: SEED_TIME,
          _origin: "seed",
        })
      ).filter(Boolean);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          v: 1,
          saved_at: new Date().toISOString(),
          repos: state.repos,
          settings: {
            theme: state.settings.theme,
            sort: state.settings.sort,
            handle: state.settings.handle,
            tokenLogin: state.settings.tokenLogin,
          },
        })
      );
    } catch (error) {
      showToast("本地存储空间不足，最近的更改可能无法保存。", "error");
    }
  }

  function persistToken(token, remember) {
    state.token = token;
    state.tokenRemember = remember;
    if (remember) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(TOKEN_KEY);
    }
    state.rateNotified = false;
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    state.token = "";
    state.tokenRemember = false;
    state.settings.tokenLogin = null;
    state.rate = null;
    state.rateNotified = false;
    saveState();
  }

  /* ------------------------------------------------------------------
     GitHub API
     ------------------------------------------------------------------ */

  function readRate(res) {
    const limit = Number(res.headers.get("x-ratelimit-limit"));
    const remaining = Number(res.headers.get("x-ratelimit-remaining"));
    if (!limit || Number.isNaN(limit) || Number.isNaN(remaining)) return;
    state.rate = {
      limit,
      remaining,
      reset: Number(res.headers.get("x-ratelimit-reset")) * 1000,
    };
    renderRate();
  }

  async function api(path, options = {}) {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    let res;
    try {
      res = await fetch(API + path, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      const err = new Error("网络连接失败，请检查网络后重试。");
      err.network = true;
      throw err;
    }

    readRate(res);
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = null;
      }
    }

    if (!res.ok) {
      const err = new Error((data && data.message) || `GitHub 返回 ${res.status}`);
      err.status = res.status;
      err.data = data;
      err.rateLimited =
        (res.status === 403 || res.status === 429) &&
        res.headers.get("x-ratelimit-remaining") === "0";
      throw err;
    }

    return data;
  }

  function friendlyError(error) {
    if (!error) return "出了点问题，请稍后再试。";
    if (error.rateLimited) {
      const reset = state.rate && state.rate.reset ? ` · ${fmtClock(state.rate.reset)} 恢复` : "";
      return `GitHub API 配额已用完${reset}。添加 Token 可提升到 5,000 次/小时。`;
    }
    if (error.status === 404) return "找不到这个仓库。它可能是私有的，请先在设置中添加 Token。";
    if (error.status === 401) return "Token 无效或已过期。";
    if (error.status === 403) return "GitHub 拒绝了这次请求，可能是配额或权限限制。";
    if (error.network) return error.message;
    return error.message || "请求失败，请稍后再试。";
  }

  function normalizeWeeks(data) {
    if (!Array.isArray(data)) return null;
    return data
      .filter((week) => week && Number.isFinite(Number(week.week)))
      .map((week) => {
        const days = Array.isArray(week.days)
          ? week.days.slice(0, 7).map((n) => Number(n) || 0)
          : [];
        while (days.length < 7) days.push(0);
        return {
          start: Number(week.week) * 1000,
          total: Number(week.total) || sum(days),
          days,
        };
      })
      .sort((a, b) => a.start - b.start)
      .slice(-52);
  }

  function weekStartLocal(input) {
    const date = startOfDay(input);
    date.setDate(date.getDate() - date.getDay());
    return date;
  }

  function weeksFromCommits(commits) {
    const end = weekStartLocal(new Date());
    const weeks = [];
    for (let i = 51; i >= 0; i -= 1) {
      const start = new Date(end);
      start.setDate(end.getDate() - i * 7);
      weeks.push({ start: start.getTime(), total: 0, days: [0, 0, 0, 0, 0, 0, 0] });
    }
    const byKey = new Map(weeks.map((week) => [localDayKey(new Date(week.start)), week]));
    for (const commit of commits || []) {
      const rawDate = commit && commit.commit && (commit.commit.author?.date || commit.commit.committer?.date);
      if (!rawDate) continue;
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) continue;
      const start = weekStartLocal(date);
      const week = byKey.get(localDayKey(start));
      if (!week) continue;
      week.days[date.getDay()] += 1;
      week.total += 1;
    }
    return weeks;
  }

  async function fetchActivity(fullName) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const data = await api(`/repos/${fullName}/stats/commit_activity`);
      const weeks = normalizeWeeks(data);
      if (weeks && weeks.length) return { weeks, partial: false };
      if (attempt < 2) await sleep(1100 + attempt * 900);
    }
    try {
      const commits = await api(`/repos/${fullName}/commits?per_page=100`);
      return { weeks: weeksFromCommits(commits), partial: true };
    } catch (error) {
      return { weeks: weeksFromCommits([]), partial: true };
    }
  }

  async function fetchCounts(fullName) {
    const results = await Promise.allSettled([
      api(`/repos/${fullName}/issues?state=open&per_page=100`),
      api(`/repos/${fullName}/pulls?state=open&per_page=100`),
    ]);
    const issues = results[0].status === "fulfilled" ? results[0].value : null;
    const pulls = results[1].status === "fulfilled" ? results[1].value : null;
    return {
      open_issues: Array.isArray(issues) ? issues.filter((issue) => !issue.pull_request).length : null,
      open_prs: Array.isArray(pulls) ? pulls.length : null,
      _countsAt: new Date().toISOString(),
    };
  }

  async function fetchSnapshot(fullName, options = {}) {
    let repo;
    try {
      repo = await api(`/repos/${fullName}`);
    } catch (error) {
      throw error;
    }

    const realName = repo.full_name;
    const [languages, activity] = await Promise.all([
      api(`/repos/${realName}/languages`).catch(() => ({})),
      fetchActivity(realName),
    ]);

    const snapshot = {
      full_name: realName,
      name: repo.name,
      owner: repo.owner?.login || realName.split("/")[0],
      description: repo.description || "",
      homepage: repo.homepage || "",
      language: repo.language || null,
      topics: Array.isArray(repo.topics) ? repo.topics : [],
      license: repo.license?.spdx_id || null,
      default_branch: repo.default_branch || "main",
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      watchers: repo.watchers_count || 0,
      open_issues_total: repo.open_issues_count || 0,
      created_at: repo.created_at || null,
      updated_at: repo.updated_at || null,
      pushed_at: repo.pushed_at || null,
      size: repo.size || 0,
      archived: Boolean(repo.archived),
      fork: Boolean(repo.fork),
      visibility: repo.visibility || (repo.private ? "private" : "public"),
      languages: languages && typeof languages === "object" ? languages : {},
      weeks: activity.weeks,
      activity_partial: activity.partial,
      _fetchedAt: new Date().toISOString(),
      _origin: "live",
    };

    if (options.withCounts) {
      Object.assign(snapshot, await fetchCounts(realName));
    }

    return normalizeRepo(snapshot);
  }

  async function updateRepo(fullName, options = {}) {
    const index = state.repos.findIndex((repo) => repo.full_name === fullName);
    if (index === -1) return null;
    const previous = state.repos[index];
    const snapshot = await fetchSnapshot(fullName, options);
    if (!snapshot) return null;
    if (!options.withCounts) {
      snapshot.open_issues = previous.open_issues;
      snapshot.open_prs = previous.open_prs;
      snapshot._countsAt = previous._countsAt;
    }
    state.repos[index] = snapshot;
    if (options.save !== false) saveState();
    return snapshot;
  }

  /* ------------------------------------------------------------------
     Metrics
     ------------------------------------------------------------------ */

  function computeMetrics(repo) {
    const totals = (repo.weeks || []).map((week) => Number(week.total) || 0);
    const recent = sum(totals.slice(-4));
    const prior = sum(totals.slice(Math.max(0, totals.length - 8), Math.max(0, totals.length - 4)));
    const last12 = totals.slice(-12);
    const activeWeeks = last12.filter((n) => n > 0).length;
    const consistency = Math.min(1, activeWeeks / 8);
    const days = daysAgo(repo.pushed_at);
    const recency = Math.exp(-Math.max(0, days) / 21);
    const activity = Math.min(1, recent / 24);
    const momentum = clamp(0.5 + (recent - prior) / 40, 0, 1);
    const score = Math.round(100 * (0.35 * activity + 0.25 * consistency + 0.2 * recency + 0.2 * momentum));

    let streak = 0;
    const completeWeeks = totals.slice();
    if (completeWeeks.length && completeWeeks[completeWeeks.length - 1] === 0) completeWeeks.pop();
    for (let i = completeWeeks.length - 1; i >= 0; i -= 1) {
      if (completeWeeks[i] > 0) streak += 1;
      else break;
    }

    let status;
    if (recent === 0 && prior === 0) {
      if (days > 60) status = "parked";
      else if (days > 21) status = "drifting";
      else status = "coasting";
    } else if (score >= 65) status = "pulling";
    else if (score >= 40) status = "coasting";
    else if (score >= 20) status = "drifting";
    else status = "parked";

    return {
      score,
      status,
      recent,
      prior,
      activeWeeks,
      streak,
      days,
      delta: recent - prior,
      hasPrior: prior > 0,
    };
  }

  function buildDailySeries(repos, days) {
    const today = startOfDay(new Date());
    const first = new Date(today);
    first.setDate(today.getDate() - (days - 1));
    const slots = [];
    for (let i = 0; i < days; i += 1) {
      const date = new Date(first);
      date.setDate(first.getDate() + i);
      slots.push({ date, key: localDayKey(date), total: 0, top: null, topCount: 0, repoCount: 0 });
    }
    const byKey = new Map(slots.map((slot) => [slot.key, slot]));

    for (const repo of repos) {
      for (const week of repo.weeks || []) {
        const base = startOfDay(new Date(week.start));
        if (Number.isNaN(base.getTime())) continue;
        for (let i = 0; i < 7; i += 1) {
          const day = new Date(base);
          day.setDate(base.getDate() + i);
          const slot = byKey.get(localDayKey(day));
          if (!slot) continue;
          const count = Number(week.days?.[i]) || 0;
          if (count <= 0) continue;
          slot.total += count;
          slot.repoCount += 1;
          if (count > slot.topCount) {
            slot.topCount = count;
            slot.top = repo.name;
          }
        }
      }
    }

    return slots;
  }

  function commitsInLastDays(repo, days) {
    const cutoff = daySerial(new Date()) - (days - 1);
    let total = 0;
    for (const week of repo.weeks || []) {
      const base = startOfDay(new Date(week.start));
      if (Number.isNaN(base.getTime())) continue;
      for (let i = 0; i < 7; i += 1) {
        const day = new Date(base);
        day.setDate(base.getDate() + i);
        if (daySerial(day) >= cutoff) total += Number(week.days?.[i]) || 0;
      }
    }
    return total;
  }

  function computeModel() {
    const items = state.repos.map((repo) => ({ repo, metrics: computeMetrics(repo) }));
    const byName = new Map(items.map((item) => [item.repo.full_name, item]));
    const sorted = items.slice().sort((a, b) => b.metrics.score - a.metrics.score || b.metrics.recent - a.metrics.recent);
    const rank = new Map(sorted.map((item, index) => [item.repo.full_name, index + 1]));

    const score = items.length
      ? Math.round(sum(items.map((item) => item.metrics.score)) / items.length)
      : 0;
    const pulling = items.filter((item) => item.metrics.status === "pulling").length;
    const parking = items.filter((item) => item.metrics.status === "parked").length;
    const statusCounts = {
      all: items.length,
      pulling: 0,
      coasting: 0,
      drifting: 0,
      parked: 0,
    };
    items.forEach((item) => {
      statusCounts[item.metrics.status] += 1;
    });

    const daily = buildDailySeries(state.repos, 56);
    const series = daily.slice(-14);
    const series28 = daily.slice(-28);
    const commits28 = sum(series28.map((day) => day.total));
    const activeDays = series.filter((day) => day.total > 0).length;
    const active28 = series28.filter((day) => day.total > 0).length;
    const peak = series.reduce((best, day) => (day.total > best.total ? day : best), series[0] || { total: 0 });
    let last = null;
    for (let i = series.length - 1; i >= 0; i -= 1) {
      if (series[i].total > 0) {
        last = series[i];
        break;
      }
    }
    const active7 = state.repos.filter((repo) => commitsInLastDays(repo, 7) > 0).length;

    return {
      items,
      byName,
      rank,
      score,
      pulling,
      parking,
      statusCounts,
      daily,
      series,
      commits28,
      activeDays,
      active28,
      peak,
      last,
      active7,
    };
  }

  /* ------------------------------------------------------------------
     Rendering: chrome & charts
     ------------------------------------------------------------------ */

  function renderClock() {
    const now = new Date();
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    if (refs.clock) {
      refs.clock.textContent = `${fmtDate(now)} ${weekdays[now.getDay()]} · ${fmtClock(now)}`;
    }
  }

  function latestFetchTime() {
    const times = state.repos
      .map((repo) => new Date(repo._fetchedAt || 0).getTime())
      .filter((time) => Number.isFinite(time) && time > 0);
    return times.length ? new Date(Math.max(...times)) : null;
  }

  function renderStamp() {
    const latest = latestFetchTime();
    if (refs.dataStamp) {
      refs.dataStamp.textContent = latest
        ? `快照 ${fmtDate(latest)} ${fmtClock(latest)}`
        : "尚未同步";
    }
    if (refs.dataSummary) {
      refs.dataSummary.textContent = `${state.repos.length} 个项目 · 最后同步 ${
        latest ? `${fmtDate(latest)} ${fmtClock(latest)}` : "—"
      }`;
    }
    if (refs.footerUser) refs.footerUser.textContent = `@${DEFAULT_USER}`;
    if (refs.settingsUser) refs.settingsUser.textContent = `@${DEFAULT_USER}`;
  }

  function renderRate() {
    if (refs.rateStatus) {
      if (state.rate) {
        const reset = state.rate.reset ? ` · ${fmtClock(state.rate.reset)} 重置` : "";
        refs.rateStatus.textContent = `${state.rate.limit >= 1000 ? "已认证" : "公开"} · 剩余 ${
          state.rate.remaining
        }/${state.rate.limit}${reset}`;
      } else {
        refs.rateStatus.textContent = state.token ? "Token · 尚未请求" : "公开 API · 尚未请求";
      }
    }

    if (
      state.rate &&
      state.rate.remaining <= 5 &&
      state.rate.limit <= 60 &&
      !state.rateNotified &&
      !state.bannerDismissed
    ) {
      state.rateNotified = true;
      showBanner("GitHub 公开 API 配额即将用完。添加 Token 后，上限会提升到 5,000 次/小时。");
    }
  }

  function renderTokenStatus() {
    if (!refs.tokenStatus) return;
    if (state.token) {
      refs.tokenStatus.classList.add("is-connected");
      refs.tokenStatus.textContent = state.settings.tokenLogin
        ? `已连接 @${state.settings.tokenLogin} · Token 保存在此浏览器`
        : "Token 已保存 · 等待下一次验证";
    } else {
      refs.tokenStatus.classList.remove("is-connected");
      refs.tokenStatus.textContent = "未连接 · 使用公开 API";
    }
    if (refs.tokenRemember) refs.tokenRemember.checked = state.tokenRemember;
  }

  function renderSettings() {
    renderTokenStatus();
    if (refs.sortSelect) refs.sortSelect.value = state.settings.sort;
    if (refs.themeChoice) {
      $$(".theme-card", refs.themeChoice).forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.themeChoice === state.settings.theme));
      });
    }
    renderStamp();
    renderRate();
  }

  function renderHeader() {
    const model = state.model;
    if (!model) return;
    if (refs.eyebrowCount) {
      refs.eyebrowCount.textContent = model.items.length ? `${model.items.length} 个信号` : "等待第一个信号";
    }
    if (refs.statPulling) refs.statPulling.textContent = pad2(model.pulling);
    if (refs.statCommits) refs.statCommits.textContent = fmtCount(model.commits28);
    if (refs.statActive) refs.statActive.textContent = pad2(model.active7);
    if (refs.statParked) refs.statParked.textContent = pad2(model.parking);
  }

  function renderGauge() {
    const model = state.model;
    if (!model) return;
    const ticks = [];
    const filled = Math.round((model.score / 100) * 40);
    for (let i = 0; i < 40; i += 1) {
      const angle = ((150 + (240 * i) / 39) * Math.PI) / 180;
      const outer = 95;
      const inner = i % 5 === 0 ? 79 : 85;
      const x1 = (140 + Math.cos(angle) * outer).toFixed(2);
      const y1 = (105 + Math.sin(angle) * outer).toFixed(2);
      const x2 = (140 + Math.cos(angle) * inner).toFixed(2);
      const y2 = (105 + Math.sin(angle) * inner).toFixed(2);
      ticks.push(
        `<line class="gauge-tick${i < filled ? " is-on" : ""}${i % 5 === 0 ? " is-major" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`
      );
    }
    if (refs.gaugeTicks) refs.gaugeTicks.innerHTML = ticks.join("");
    if (refs.gaugeNum) refs.gaugeNum.textContent = model.items.length ? model.score : "—";
    if (refs.gaugeCaption) {
      refs.gaugeCaption.textContent = model.items.length
        ? `${model.pulling} 个在牵引 · ${model.parking} 个停泊`
        : "等待第一个信号";
    }
    if (refs.gaugeMeta) {
      refs.gaugeMeta.textContent = model.items.length
        ? `近 28 天 · ${fmtCount(model.commits28)} 次提交`
        : "还没有提交可读";
    }
    if (refs.gaugeMini) {
      refs.gaugeMini.textContent = model.items.length ? `${model.active28} 个活跃日` : "—";
    }
  }

  function attachChartHover(container, geometry, series) {
    const svg = container.querySelector("svg");
    const hover = container.querySelector(".chart-hover");
    const cursor = container.querySelector(".chart-cursor-group");
    const cursorLine = container.querySelector(".chart-cursor");
    const cursorDot = container.querySelector(".chart-cursor-dot");
    const tip = container.querySelector(".chart-tip");
    if (!svg || !hover || !cursor || !tip) return;

    const { pad, plotW, x, y } = geometry;

    const hide = () => {
      tip.hidden = true;
      cursor.style.display = "none";
    };

    const show = (event) => {
      const bounds = svg.getBoundingClientRect();
      const px = event.clientX - bounds.left;
      if (px < pad.l - 6 || px > pad.l + plotW + 6) {
        hide();
        return;
      }
      const ratio = clamp((px - pad.l) / plotW, 0, 1);
      const index = Math.round(ratio * (series.length - 1));
      const day = series[index];
      if (!day) return;
      const cx = x(index);
      const cy = y(day.total);
      cursor.style.display = "";
      cursorLine.setAttribute("x1", cx);
      cursorLine.setAttribute("x2", cx);
      cursorLine.setAttribute("y1", pad.t);
      cursorLine.setAttribute("y2", pad.t + geometry.plotH);
      cursorDot.setAttribute("cx", cx);
      cursorDot.setAttribute("cy", cy);

      const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      const top = day.top ? `最多 · ${esc(day.top)}` : "没有提交";
      tip.innerHTML = `<span class="tip-muted">${fmtDate(day.date)} ${weekdays[day.date.getDay()]}</span><strong>${day.total} <span class="tip-muted">次提交</span></strong><span class="${day.top ? "tip-accent" : "tip-muted"}">${top}</span>`;
      tip.hidden = false;
      tip.style.left = `${clamp(cx, 76, geometry.width - 76)}px`;
      tip.style.top = `${Math.max(cy, 58)}px`;
    };

    hover.addEventListener("pointermove", show);
    hover.addEventListener("pointerdown", show);
    hover.addEventListener("pointerleave", hide);
    container.onpointerleave = hide;
  }

  function renderSeismo() {
    const model = state.model;
    const container = refs.seismoChart;
    if (!model || !container) return;
    const width = container.clientWidth;
    const height = container.clientHeight || 246;
    if (width < 80) return;

    const series = model.series;
    const pad = { l: 30, r: 12, t: 20, b: 27 };
    const plotW = Math.max(10, width - pad.l - pad.r);
    const plotH = Math.max(10, height - pad.t - pad.b);
    const maxValue = niceMax(Math.max(...series.map((day) => day.total), 0));
    const x = (index) => pad.l + (index / Math.max(1, series.length - 1)) * plotW;
    const y = (value) => pad.t + plotH - (clamp(value, 0, maxValue) / maxValue) * plotH;
    const baseline = pad.t + plotH;

    const linePath = series
      .map((day, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)} ${y(day.total).toFixed(2)}`)
      .join(" ");
    const areaPath = `${linePath} L ${x(series.length - 1).toFixed(2)} ${baseline} L ${x(0).toFixed(2)} ${baseline} Z`;

    const avg = series.map((day, index) => {
      const from = Math.max(0, index - 6);
      const window = series.slice(from, index + 1);
      return sum(window.map((entry) => entry.total)) / window.length;
    });
    const avgPath = avg
      .map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)} ${y(value).toFixed(2)}`)
      .join(" ");

    const stems = series
      .map((day, index) => {
        if (!day.total) return "";
        return `<line class="chart-stem" x1="${x(index).toFixed(2)}" y1="${y(day.total).toFixed(2)}" x2="${x(index).toFixed(2)}" y2="${baseline}" />`;
      })
      .join("");

    const gridLines = [0, 0.5, 1]
      .map((fraction) => {
        const gy = pad.t + plotH * fraction;
        const value = maxValue * (1 - fraction);
        return `<line class="chart-grid-line" x1="${pad.l}" y1="${gy}" x2="${pad.l + plotW}" y2="${gy}" /><text class="chart-axis-label" x="${pad.l - 7}" y="${gy + 3}" text-anchor="end">${Math.round(value)}</text>`;
      })
      .join("");

    const labelIndexes = width < 560
      ? [0, Math.floor((series.length - 1) / 2), series.length - 1]
      : [0, Math.round((series.length - 1) / 3), Math.round(((series.length - 1) * 2) / 3), series.length - 1];
    const xLabels = labelIndexes
      .filter((index) => index < series.length)
      .map((index) => {
        const anchor = index === 0 ? "start" : index === series.length - 1 ? "end" : "middle";
        return `<text class="chart-axis-label" x="${x(index).toFixed(2)}" y="${height - 7}" text-anchor="${anchor}">${fmtShortDate(series[index].date)}</text>`;
      })
      .join("");

    let peakMarkup = "";
    let peak = null;
    for (const day of series) {
      if (!peak || day.total > peak.total) peak = day;
    }
    if (peak && peak.total > 0) {
      const index = series.indexOf(peak);
      const px = x(index);
      const py = y(peak.total);
      const anchor = px > width - 105 ? "end" : "start";
      const textX = px + (anchor === "end" ? -8 : 8);
      peakMarkup = `
        <circle class="chart-peak-halo" cx="${px}" cy="${py}" r="9" />
        <circle class="chart-dot" cx="${px}" cy="${py}" r="3.4" />
        <text class="chart-peak-text" x="${textX}" y="${Math.max(11, py - 11)}" text-anchor="${anchor}">${fmtShortDate(peak.date)} · ${peak.total}</text>
      `;
    }

    const lastIndex = series.length - 1;
    const todayMark = series[lastIndex]
      ? `
        <circle class="chart-peak-halo" cx="${x(lastIndex)}" cy="${y(series[lastIndex].total)}" r="6" opacity=".55" />
        <circle class="chart-dot" cx="${x(lastIndex)}" cy="${y(series[lastIndex].total)}" r="2.6" />
      `
      : "";

    const summary = `过去 ${series.length} 天共 ${sum(series.map((day) => day.total))} 次提交，峰值 ${peak ? peak.total : 0} 次，${model.activeDays} 个活跃日。`;
    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(summary)}">
        <defs>
          <linearGradient id="pulseFill" x1="0" y1="0" x2="0" y2="1">
            <stop class="pulse-stop-top" offset="0" />
            <stop class="pulse-stop-bottom" offset="1" />
          </linearGradient>
        </defs>
        ${gridLines}
        <path class="chart-area" d="${areaPath}" />
        ${stems}
        <path class="chart-line is-animated" pathLength="1" d="${linePath}" />
        <path class="chart-avg" d="${avgPath}" />
        ${peakMarkup}
        ${todayMark}
        ${xLabels}
        <g class="chart-cursor-group" style="display:none">
          <line class="chart-cursor" />
          <circle class="chart-cursor-dot" r="3.4" />
        </g>
        <rect class="chart-hover" x="${pad.l}" y="${pad.t}" width="${plotW}" height="${plotH}" fill="transparent" style="pointer-events:all" />
      </svg>
      <div class="chart-tip" role="tooltip" hidden></div>
    `;

    attachChartHover(container, { pad, plotW, plotH, width, x, y }, series);

    if (refs.notePeak) refs.notePeak.textContent = peak && peak.total > 0 ? `${fmtShortDate(peak.date)} · ${peak.total} 次` : "—";
    if (refs.notePeakSub) {
      refs.notePeakSub.textContent = peak && peak.total > 0
        ? peak.top
          ? `由 ${peak.top} 推动`
          : "有信号的一天"
        : "过去 28 天没有提交";
    }
    if (refs.noteActive) refs.noteActive.textContent = `${model.activeDays} / ${model.series.length}`;
    if (refs.noteLast) {
      refs.noteLast.textContent = model.last ? `${fmtShortDate(model.last.date)} · ${model.last.total} 次` : "—";
    }
    if (refs.noteLastSub) {
      refs.noteLastSub.textContent = model.last
        ? model.last.top
          ? `最近来自 ${model.last.top}`
          : "最近一次提交"
        : "等待下一次心跳";
    }
  }

  /* ------------------------------------------------------------------
     Rendering: cards & filters
     ------------------------------------------------------------------ */

  function statLabel(base, count) {
    return `${base} <span class="count">${count}</span>`;
  }

  function renderFilters() {
    if (!refs.filters || !state.model) return;
    const counts = state.model.statusCounts;
    const definitions = [
      { key: "all", label: "全部", color: "var(--ink)" },
      { key: "pulling", label: STATUS.pulling.label, color: "var(--accent)" },
      { key: "coasting", label: STATUS.coasting.label, color: "var(--olive)" },
      { key: "drifting", label: STATUS.drifting.label, color: "var(--drift)" },
      { key: "parked", label: STATUS.parked.label, color: "var(--park)" },
    ];
    refs.filters.innerHTML = definitions
      .map(
        (definition) => `
        <button class="filter-btn${state.filter === definition.key ? " is-active" : ""}" type="button" data-filter="${definition.key}" aria-pressed="${state.filter === definition.key}" style="--filter-color:${definition.color}">
          <span class="dot" aria-hidden="true"></span>${definition.label}${statLabel("", counts[definition.key] || 0)}
        </button>`
      )
      .join("");
  }

  function visibleItems() {
    if (!state.model) return [];
    const query = state.search.trim().toLowerCase();
    let items = state.model.items.filter((item) => {
      if (state.filter !== "all" && item.metrics.status !== state.filter) return false;
      if (!query) return true;
      const repo = item.repo;
      const haystack = [
        repo.name,
        repo.full_name,
        repo.description,
        repo.language,
        repo.topics.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    items = items.slice().sort((a, b) => {
      switch (state.settings.sort) {
        case "recent":
          return new Date(b.repo.pushed_at || 0) - new Date(a.repo.pushed_at || 0);
        case "commits":
          return b.metrics.recent - a.metrics.recent || b.metrics.score - a.metrics.score;
        case "name":
          return a.repo.name.localeCompare(b.repo.name);
        case "traction":
        default:
          return b.metrics.score - a.metrics.score || b.metrics.recent - a.metrics.recent;
      }
    });
    return items;
  }

  function barsMarkup(repo) {
    const totals = (repo.weeks || []).map((week) => Number(week.total) || 0).slice(-12);
    while (totals.length < 12) totals.unshift(0);
    const max = Math.max(...totals, 8);
    return totals
      .map((value, index) => {
        const isCurrent = index === totals.length - 1;
        const isRecent = index >= totals.length - 4;
        const classes = ["bar"];
        if (isCurrent) classes.push(value > 0 ? "is-current" : "is-empty");
        else if (isRecent) classes.push("is-recent");
        const height = value > 0 ? Math.max(4, Math.round((value / max) * 100)) : 2;
        return `<span class="${classes.join(" ")}" style="--h:${height}%;--i:${index}" aria-hidden="true"></span>`;
      })
      .join("");
  }

  function meterMarkup(score, className = "meter") {
    const active = Math.round((score / 100) * 20);
    return `<div class="${className}" aria-hidden="true">${Array.from({ length: 20 }, (_, index) =>
      `<i class="${index < active ? "is-on" : ""}"></i>`
    ).join("")}</div>`;
  }

  function cardMarkup(item, index) {
    const repo = item.repo;
    const metrics = item.metrics;
    const status = STATUS[metrics.status];
    const rank = state.model.rank.get(repo.full_name) || index + 1;
    const description = repo.description || "尚未写下描述。";
    const streak = metrics.streak > 0 ? `连续 ${metrics.streak} 周` : "—";
    const visibility = repo.visibility === "private" ? `<span class="card-vis">PRIVATE</span>` : "";
    return `
      <article class="card is-${metrics.status}" style="--i:${index}">
        <div class="card-top">
          <span class="card-rank">NO. ${pad2(rank)}</span>
          ${visibility}
          <span class="status-chip" title="${status.en}"><span class="status-dot" aria-hidden="true"></span>${status.label}</span>
        </div>
        <div class="card-title-line">
          <span class="card-owner">${esc(repo.owner)} /</span>
          <h3 class="card-title">${esc(repo.name)}</h3>
          <span class="card-arrow" aria-hidden="true">↗</span>
        </div>
        <p class="card-desc">${esc(description)}</p>
        <div class="card-viz">
          <div class="bars" aria-hidden="true">${barsMarkup(repo)}</div>
          <div class="score-block" aria-label="牵引力 ${metrics.score} 分">
            <span class="score-big">${pad2(metrics.score)}</span>
            <span class="score-label">TRACTION</span>
          </div>
        </div>
        ${meterMarkup(metrics.score)}
        <div class="card-foot">
          <span class="card-lang"><i class="lang-dot" style="background:${langColor(repo.language)}"></i>${esc(repo.language || "未标注")}</span>
          <span class="card-meta"><span>${relTime(repo.pushed_at)}</span><span>${streak}</span></span>
        </div>
        <button class="card-hit" type="button" data-open="${esc(repo.full_name)}" aria-label="查看 ${esc(repo.full_name)} 的信号详情"></button>
      </article>
    `;
  }

  function renderEmpty() {
    const visible = visibleItems();
    const noRepos = state.repos.length === 0;
    if (refs.grid) refs.grid.hidden = visible.length === 0;
    if (refs.emptyState) refs.emptyState.hidden = visible.length > 0;

    if (!refs.emptyState) return;
    if (noRepos) {
      refs.emptyTitle.textContent = "还没有信号";
      refs.emptyCopy.textContent = "接入一个 GitHub 仓库，开始记录它的牵引力。";
      refs.emptyAddBtn.textContent = "接入项目";
      refs.emptyResetBtn.hidden = false;
      refs.emptyResetBtn.textContent = "恢复预置项目";
    } else {
      refs.emptyTitle.textContent = "没有匹配的信号";
      refs.emptyCopy.textContent = "换一个关键词，或把筛选调回全部。它们可能只是暂时安静。";
      refs.emptyAddBtn.textContent = "清除筛选";
      refs.emptyResetBtn.hidden = true;
    }
  }

  function renderGrid() {
    if (!state.model || !refs.grid) return;
    const items = visibleItems();
    refs.grid.innerHTML = items.map((item, index) => cardMarkup(item, index)).join("");
    if (refs.resultCount) {
      refs.resultCount.textContent = `显示 ${items.length} / ${state.repos.length}`;
    }
    if (refs.boardSub) {
      refs.boardSub.textContent =
        state.filter === "all" && !state.search
          ? "按牵引力排序 · 点击卡片查看信号详情"
          : "筛选后的信号 · 点击卡片查看详情";
    }
    renderEmpty();
  }

  /* ------------------------------------------------------------------
     Rendering: detail
     ------------------------------------------------------------------ */

  function heatmapMarkup(repo) {
    const weeks = (repo.weeks || []).slice(-26);
    const today = startOfDay(new Date());
    const created = repo.created_at ? startOfDay(new Date(repo.created_at)) : null;
    const labels = ["日", "一", "二", "三", "四", "五", "六"];
    let hasBefore = false;
    const cells = weeks
      .map((week) => {
        const base = startOfDay(new Date(week.start));
        const isBirth = created && created >= base && created < new Date(base.getTime() + 7 * DAY);
        const days = Array.from({ length: 7 }, (_, index) => {
          const date = new Date(base);
          date.setDate(base.getDate() + index);
          const count = Number(week.days?.[index]) || 0;
          const future = date > today;
          const before = created && date < created;
          if (before) hasBefore = true;
          const level = count >= 8 ? 4 : count >= 4 ? 3 : count >= 2 ? 2 : count >= 1 ? 1 : 0;
          const classes = ["heat-cell"];
          if (before) classes.push("is-before");
          else if (future) classes.push("is-future");
          else if (level) classes.push(`l${level}`);
          const title = before
            ? `${fmtDate(date)} · 项目尚未创建`
            : future
              ? `${fmtDate(date)} · 未来`
              : `${fmtDate(date)} · ${count} 次提交`;
          return `<i class="${classes.join(" ")}" title="${title}"></i>`;
        }).join("");
        return `<div class="heat-week${isBirth ? " is-birth" : ""}">${days}</div>`;
      })
      .join("");

    return `
      <div class="heat-wrap">
        <div class="heat-day-labels" aria-hidden="true">${labels.map((label) => `<span>${label}</span>`).join("")}</div>
        <div class="heat-grid" role="img" aria-label="过去 26 周的提交热图">${cells}</div>
      </div>
      <div class="heat-caption">
        <span>过去 26 周 · 每格 1 天${hasBefore && created ? ` · 创建于 ${fmtShortDate(created)}` : ""}</span>
        <span class="heat-scale">少 <i class="heat-cell"></i><i class="heat-cell l1"></i><i class="heat-cell l2"></i><i class="heat-cell l3"></i><i class="heat-cell l4"></i> 多</span>
      </div>
    `;
  }

  function languageMarkup(repo) {
    const entries = Object.entries(repo.languages || {})
      .map(([name, bytes]) => [name, Number(bytes) || 0])
      .filter(([, bytes]) => bytes > 0)
      .sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      return `<p class="hint">GitHub 还没有识别出这个项目的语言。</p>`;
    }
    const total = sum(entries.map(([, bytes]) => bytes));
    const top = entries.slice(0, 4);
    const rest = sum(entries.slice(4).map(([, bytes]) => bytes));
    const parts = top.map(([name, bytes]) => ({ name, pct: (bytes / total) * 100 }));
    if (rest > 0) parts.push({ name: "其它", pct: (rest / total) * 100 });
    const bar = parts
      .map(
        (part) =>
          `<span style="width:${part.pct.toFixed(2)}%;background:${part.name === "其它" ? "var(--faint)" : langColor(part.name)}" title="${esc(part.name)} ${part.pct.toFixed(1)}%"></span>`
      )
      .join("");
    const legend = parts
      .map(
        (part) =>
          `<span class="lang-legend-item"><i style="background:${part.name === "其它" ? "var(--faint)" : langColor(part.name)}"></i>${esc(part.name)} <b>${part.pct.toFixed(0)}%</b></span>`
      )
      .join("");
    return `<div class="lang-bar">${bar}</div><div class="lang-legend">${legend}</div>`;
  }

  function removeBoxMarkup(repo) {
    return `<div class="detail-remove" id="removeBox">
      <span>不再追踪这个项目？快照会从本地移除。</span>
      <button class="btn btn-ghost" type="button" data-remove="${esc(repo.full_name)}">移除</button>
    </div>`;
  }

  function detailMarkup(repo) {
    const metrics = computeMetrics(repo);
    const status = STATUS[metrics.status];
    const homepage = safeHttpUrl(repo.homepage);
    const deltaText = metrics.hasPrior
      ? `${metrics.delta >= 0 ? "+" : ""}${metrics.delta} 次 vs 前 28 天`
      : `近 28 天 ${metrics.recent} 次提交`;
    const counts = {
      issues: repo.open_issues == null ? null : repo.open_issues,
      prs: repo.open_prs == null ? null : repo.open_prs,
    };
    const topics = repo.topics.length
      ? `<div class="topic-row">${repo.topics.map((topic) => `<span class="topic">${esc(topic)}</span>`).join("")}</div>`
      : "";
    const metaRows = [
      ["创建", fmtDate(repo.created_at)],
      ["最近提交", relTime(repo.pushed_at)],
      ["默认分支", repo.default_branch],
      ["许可证", repo.license || "未标注"],
      ["Stars", fmtCount(repo.stars)],
      ["Forks", fmtCount(repo.forks)],
      ["可见性", repo.visibility === "private" ? "Private" : "Public"],
      ["快照", fmtDate(repo._fetchedAt)],
    ];
    const meta = metaRows
      .map(([term, value]) => `<div><dt>${esc(term)}</dt><dd>${esc(value)}</dd></div>`)
      .join("");
    const homepageRow = homepage
      ? `<div><dt>主页</dt><dd><a href="${esc(homepage)}" target="_blank" rel="noopener">${esc(new URL(homepage).host.replace(/^www\./, ""))}</a></dd></div>`
      : "";

    return `
      <header class="detail-head">
        <div class="detail-kicker">
          <span>${esc(repo.owner)} / ${esc(repo.name)}</span>
          ${repo.visibility === "private" ? '<span class="card-vis">PRIVATE</span>' : ""}
          <span class="status-chip is-${metrics.status}"><span class="status-dot" aria-hidden="true"></span>${status.label} · ${status.en}</span>
        </div>
        <h2 class="detail-title" id="detailTitle">${esc(repo.name)}</h2>
        <span class="detail-owner">@${esc(repo.owner)} · 创建于 ${fmtDate(repo.created_at)}</span>
        <p class="detail-desc">${esc(repo.description || "尚未写下描述。")}</p>
        <div class="detail-actions">
          <a class="btn btn-primary" href="${githubUrl(repo.full_name)}" target="_blank" rel="noopener">打开 GitHub ↗</a>
          <button class="btn btn-ghost" type="button" data-detail-sync="${esc(repo.full_name)}">同步此项目</button>
          ${homepage ? `<a class="btn btn-ghost" href="${esc(homepage)}" target="_blank" rel="noopener">项目主页 ↗</a>` : ""}
        </div>
      </header>

      <div class="detail-score">
        <div class="detail-score-num">${metrics.score}<small>/100</small></div>
        <div class="detail-score-info">
          <span class="mono">TRACTION / 牵引力</span>
          <strong>${status.label} · ${deltaText}</strong>
          ${meterMarkup(metrics.score, "detail-meter")}
        </div>
      </div>

      <div class="detail-stats">
        <div class="detail-stat"><span class="mono">28D COMMITS</span><strong>${fmtCount(metrics.recent)}</strong></div>
        <div class="detail-stat"><span class="mono">STREAK</span><strong>${metrics.streak} <small>周</small></strong></div>
        <div class="detail-stat" ${counts.issues == null ? 'aria-busy="true"' : ""}><span class="mono">OPEN ISSUES</span><strong id="detailIssues">${counts.issues == null ? '<span class="mini-spinner" aria-label="加载中"></span>' : counts.issues >= 100 ? "100+" : counts.issues}</strong></div>
        <div class="detail-stat" ${counts.prs == null ? 'aria-busy="true"' : ""}><span class="mono">OPEN PRS</span><strong id="detailPRs">${counts.prs == null ? '<span class="mini-spinner" aria-label="加载中"></span>' : counts.prs >= 100 ? "100+" : counts.prs}</strong></div>
      </div>

      <section class="detail-section">
        <div class="detail-section-head"><h3>提交热图</h3><span>52 周中的最近 26 周</span></div>
        ${heatmapMarkup(repo)}
      </section>

      <section class="detail-section">
        <div class="detail-section-head"><h3>语言构成</h3><span>${esc(repo.language || "—")}</span></div>
        ${languageMarkup(repo)}
      </section>

      <section class="detail-section">
        <div class="detail-section-head"><h3>项目档案</h3><span>${repo.activity_partial ? "活动数据为部分快照" : "GitHub REST API"}</span></div>
        <dl class="detail-meta">${meta}${homepageRow}</dl>
        ${topics}
      </section>

      ${removeBoxMarkup(repo)}

      <p class="detail-note">
        快照获取于 ${fmtDate(repo._fetchedAt)} ${fmtClock(repo._fetchedAt)} · ${esc(repo.full_name)}<br />
        牵引力是节奏的读数，不是绩效评分。停泊并不意味着失败。
      </p>
    `;
  }

  function renderDetail(repo, options = {}) {
    if (!repo || !refs.detailBody) return;
    const scroll = options.preserveScroll ? refs.detailBody.scrollTop : 0;
    refs.detailBody.innerHTML = detailMarkup(repo);
    refs.detailBody.scrollTop = scroll;
  }

  /* ------------------------------------------------------------------
     Rendering: top level
     ------------------------------------------------------------------ */

  function renderAll() {
    state.model = computeModel();
    renderHeader();
    renderGauge();
    renderFilters();
    renderGrid();
    renderSeismo();
    renderSettings();
    renderStamp();
  }

  function setTheme(theme, persist = true) {
    state.settings.theme = theme === "night" ? "night" : "day";
    document.documentElement.dataset.theme = state.settings.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", state.settings.theme === "night" ? "#12120e" : "#f1ede3");
    if (persist) saveState();
    if (refs.themeBtn) {
      refs.themeBtn.setAttribute(
        "aria-label",
        state.settings.theme === "night" ? "切换到日间模式" : "切换到夜间模式"
      );
    }
    renderSettings();
  }

  /* ------------------------------------------------------------------
     UI helpers
     ------------------------------------------------------------------ */

  function showToast(message, type = "", duration = 3400) {
    if (!refs.toast) return;
    clearTimeout(state.toastTimer);
    refs.toast.textContent = message;
    refs.toast.classList.toggle("is-error", type === "error");
    refs.toast.classList.add("is-visible");
    state.toastTimer = setTimeout(() => {
      refs.toast.classList.remove("is-visible");
    }, duration);
  }

  function showBanner(message) {
    if (!refs.banner) return;
    refs.bannerText.textContent = message;
    refs.banner.hidden = false;
    refs.bannerAction.hidden = false;
  }

  function hideBanner() {
    if (refs.banner) refs.banner.hidden = true;
    state.bannerDismissed = true;
  }

  function openDialog(dialog) {
    if (!dialog) return;
    $$("dialog[open]").forEach((other) => {
      if (other !== dialog) other.close();
    });
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("is-locked");
    dialog.addEventListener(
      "close",
      () => {
        if (!document.querySelector("dialog[open]")) document.body.classList.remove("is-locked");
      },
      { once: true }
    );
  }

  function closeDialog(id) {
    const dialog = typeof id === "string" ? document.getElementById(id) : id;
    if (dialog && dialog.open) dialog.close();
  }

  function updateSyncButton() {
    if (!refs.syncBtn || !refs.syncLabel) return;
    if (state.sync.active) {
      refs.syncBtn.classList.add("is-busy");
      refs.syncLabel.textContent = `${state.sync.done}/${state.sync.total}`;
      refs.syncBtn.setAttribute("aria-label", `正在同步 ${state.sync.done}/${state.sync.total}`);
    } else {
      refs.syncBtn.classList.remove("is-busy");
      refs.syncLabel.textContent = "同步";
      refs.syncBtn.setAttribute("aria-label", "同步全部项目");
    }
  }

  async function runPool(items, worker, concurrency = 2) {
    const queue = items.slice();
    const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        await worker(item);
      }
    });
    await Promise.all(runners);
  }

  function parseRepoInput(value) {
    let input = String(value || "").trim();
    if (!input) return null;
    input = input.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
    input = input.replace(/\.git$/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    const parts = input.split("/");
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1];
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
    return `${owner}/${repo}`;
  }

  function githubApiNeed(count) {
    if (!state.rate) return true;
    return state.rate.remaining >= count;
  }

  /* ------------------------------------------------------------------
     Sync
     ------------------------------------------------------------------ */

  async function syncAll() {
    if (state.sync.active || state.repos.length === 0) return;
    const need = state.repos.length * 3 + 1;
    if (!githubApiNeed(need)) {
      const reset = state.rate && state.rate.reset ? ` ${fmtClock(state.rate.reset)} 后` : "";
      showToast(
        `API 配额不足：同步约需 ${need} 次，当前剩余 ${state.rate.remaining} 次。${reset}恢复，或先在设置中添加 Token。`,
        "error",
        6200
      );
      return;
    }

    state.sync = { active: true, done: 0, total: state.repos.length };
    updateSyncButton();
    const failures = [];
    let rateBlocked = false;

    await runPool(
      state.repos.map((repo) => repo.full_name),
      async (fullName) => {
        if (rateBlocked) {
          state.sync.done += 1;
          updateSyncButton();
          return;
        }
        try {
          await updateRepo(fullName, { save: false });
        } catch (error) {
          failures.push({ fullName, error });
          if (error.rateLimited) rateBlocked = true;
        }
        state.sync.done += 1;
        updateSyncButton();
      },
      2
    );

    state.sync.active = false;
    updateSyncButton();
    saveState();
    renderAll();

    if (rateBlocked) {
      showBanner("同步被 GitHub API 配额中断。添加 Token 可把上限提升到 5,000 次/小时。");
      showToast("配额用尽，部分项目没有同步。", "error", 5200);
    } else if (failures.length) {
      showToast(`同步完成 · ${state.repos.length - failures.length} 个更新，${failures.length} 个失败`, "error", 5000);
    } else {
      showToast(`同步完成 · ${state.repos.length} 个项目已更新`);
    }
  }

  async function syncOne(fullName, button) {
    if (!fullName) return;
    if (button) {
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = "同步中…";
    }
    try {
      const snapshot = await updateRepo(fullName, { withCounts: true, save: true });
      state.activeDetail = snapshot ? snapshot.full_name : fullName;
      state.model = computeModel();
      renderHeader();
      renderGauge();
      renderFilters();
      renderGrid();
      renderSeismo();
      renderSettings();
      const repo = state.repos.find((item) => item.full_name === state.activeDetail) || state.repos.find((item) => item.full_name === fullName);
      if (repo && refs.detailDialog.open) renderDetail(repo, { preserveScroll: true });
      showToast(`已同步 ${fullName}`);
    } catch (error) {
      showToast(friendlyError(error), "error", 5000);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.originalText || "同步此项目";
      }
    }
  }

  /* ------------------------------------------------------------------
     Add flow
     ------------------------------------------------------------------ */

  function setAddTab(tab) {
    const scan = tab === "scan";
    refs.tabSingleBtn.classList.toggle("is-active", !scan);
    refs.tabScanBtn.classList.toggle("is-active", scan);
    refs.tabSingleBtn.setAttribute("aria-selected", String(!scan));
    refs.tabScanBtn.setAttribute("aria-selected", String(scan));
    refs.singlePanel.hidden = scan;
    refs.scanPanel.hidden = !scan;
    if (!scan) {
      setTimeout(() => refs.repoInput && refs.repoInput.focus(), 60);
    } else {
      refs.handleInput.value = state.settings.handle || DEFAULT_USER;
      setTimeout(() => refs.handleInput && refs.handleInput.focus(), 60);
    }
  }

  function openAdd(tab = "single") {
    refs.singleError.textContent = "";
    refs.singleSubmit.disabled = false;
    refs.singleSubmit.textContent = "接入项目";
    refs.tokenError.textContent = "";
    openDialog(refs.addDialog);
    setAddTab(tab);
  }

  async function submitSingleRepo(event) {
    event.preventDefault();
    if (state.adding) return;
    const parsed = parseRepoInput(refs.repoInput.value);
    if (!parsed) {
      refs.singleError.textContent = "请输入 owner/repo，或粘贴一个 GitHub 仓库链接。";
      refs.repoInput.focus();
      return;
    }
    if (state.repos.some((repo) => repo.full_name.toLowerCase() === parsed.toLowerCase())) {
      refs.singleError.textContent = "这个项目已经在看板上了。";
      return;
    }
    if (!githubApiNeed(4)) {
      refs.singleError.textContent = "GitHub API 配额不足，请稍后再试，或先在设置中添加 Token。";
      return;
    }

    state.adding = true;
    refs.singleError.textContent = "";
    refs.singleSubmit.disabled = true;
    refs.singleSubmit.textContent = "正在接入…";

    try {
      const snapshot = await fetchSnapshot(parsed, { withCounts: true });
      if (!snapshot) throw new Error("无法读取这个仓库。");
      if (state.repos.some((repo) => repo.full_name.toLowerCase() === snapshot.full_name.toLowerCase())) {
        refs.singleError.textContent = "这个项目已经在看板上了。";
        return;
      }
      state.repos.push(snapshot);
      state.settings.handle = snapshot.owner || state.settings.handle;
      saveState();
      refs.repoInput.value = "";
      closeDialog(refs.addDialog);
      renderAll();
      showToast(`已接入 ${snapshot.full_name}`);
      openDetail(snapshot.full_name);
    } catch (error) {
      refs.singleError.textContent = friendlyError(error);
    } finally {
      state.adding = false;
      refs.singleSubmit.disabled = false;
      refs.singleSubmit.textContent = "接入项目";
    }
  }

  function renderScanResults() {
    if (!refs.scanResults) return;
    const tracked = new Set(state.repos.map((repo) => repo.full_name.toLowerCase()));
    if (!state.scan.items.length) {
      refs.scanResults.innerHTML = `<div class="scan-placeholder">这个用户名下没有找到仓库，或者它还没有公开项目。</div>`;
      refs.selectAllBtn.hidden = true;
      updateScanSelection();
      return;
    }

    const sorted = state.scan.items.slice().sort((a, b) => {
      const aTracked = tracked.has(a.full_name.toLowerCase()) ? 1 : 0;
      const bTracked = tracked.has(b.full_name.toLowerCase()) ? 1 : 0;
      if (aTracked !== bTracked) return aTracked - bTracked;
      const aFork = a.fork ? 1 : 0;
      const bFork = b.fork ? 1 : 0;
      if (aFork !== bFork) return aFork - bFork;
      return new Date(b.pushed_at || 0) - new Date(a.pushed_at || 0);
    });
    const untracked = sorted.filter((repo) => !tracked.has(repo.full_name.toLowerCase())).length;
    const untrackedForks = sorted.filter(
      (repo) => repo.fork && !tracked.has(repo.full_name.toLowerCase())
    ).length;
    const trackedInList = sorted.length - untracked;

    refs.scanResults.innerHTML =
      `<div class="scan-summary mono"><span>${untracked} 个待接入${untrackedForks ? ` · ${untrackedForks} 个 fork` : ""}</span><span>${trackedInList} 个已在看板</span></div>` +
      sorted
        .map((repo) => {
          const isTracked = tracked.has(repo.full_name.toLowerCase());
          const visibility = repo.private ? "PRIVATE" : repo.fork ? "FORK" : "PUBLIC";
          return `
          <label class="scan-row${isTracked ? " is-tracked" : ""}">
            <input type="checkbox" value="${esc(repo.full_name)}" ${isTracked ? "disabled" : ""} />
            <span class="scan-row-main">
              <span class="scan-row-name">${esc(repo.name)} <small>${visibility}</small>${isTracked ? '<small>已在看板</small>' : ""}</span>
              <span class="scan-row-desc">${esc(repo.description || "尚未写下描述。")}</span>
              <span class="scan-row-meta"><span>${esc(repo.language || "—")}</span><span>${relTime(repo.pushed_at)}</span></span>
            </span>
          </label>
        `;
        })
        .join("");
    refs.selectAllBtn.hidden = untracked === 0;
    state.scan.allSelected = false;
    refs.selectAllBtn.textContent = "全选可见";
    updateScanSelection();
  }

  function updateScanSelection() {
    if (!refs.scanAddBtn || !refs.scanResults) return;
    const count = $$('input[type="checkbox"]:checked:not(:disabled)', refs.scanResults).length;
    refs.scanAddBtn.disabled = count === 0;
    refs.scanAddBtn.textContent = count ? `添加所选项目 (${count})` : "添加所选项目";
  }

  async function submitScan(event) {
    event.preventDefault();
    if (state.scan.loading) return;
    const handle = refs.handleInput.value.trim().replace(/^@/, "");
    if (!handle || !/^[\w.-]+$/.test(handle)) {
      refs.scanResults.innerHTML = `<div class="scan-placeholder">请输入一个有效的 GitHub 用户名。</div>`;
      return;
    }

    state.scan.loading = true;
    state.settings.handle = handle;
    saveState();
    refs.scanBtn.disabled = true;
    refs.scanBtn.textContent = "扫描中…";
    refs.scanResults.innerHTML = `<div class="scan-placeholder"><span class="mini-spinner" style="display:inline-block;vertical-align:-1px;margin-right:6px"></span> 正在扫描 @${esc(handle)}…</div>`;
    refs.selectAllBtn.hidden = true;
    updateScanSelection();

    try {
      let login = state.settings.tokenLogin;
      if (state.token && !login) {
        try {
          const me = await api("/user");
          login = me.login;
          state.settings.tokenLogin = login;
          saveState();
        } catch (error) {
          login = null;
        }
      }
      const isSelf = Boolean(state.token && login && login.toLowerCase() === handle.toLowerCase());
      const path = isSelf
        ? "/user/repos?affiliation=owner&sort=pushed&per_page=100&visibility=all"
        : `/users/${encodeURIComponent(handle)}/repos?sort=pushed&per_page=100&type=owner`;
      const repos = await api(path);
      state.scan.items = Array.isArray(repos)
        ? repos.filter((repo) => repo && repo.full_name).sort((a, b) => new Date(b.pushed_at || 0) - new Date(a.pushed_at || 0))
        : [];
      state.scan.handle = handle;
      renderScanResults();
    } catch (error) {
      refs.scanResults.innerHTML = `<div class="scan-placeholder">${esc(friendlyError(error))}</div>`;
      refs.selectAllBtn.hidden = true;
      updateScanSelection();
    } finally {
      state.scan.loading = false;
      refs.scanBtn.disabled = false;
      refs.scanBtn.textContent = "扫描";
    }
  }

  async function addSelectedRepos() {
    if (state.adding || !refs.scanResults) return;
    const names = $$('input[type="checkbox"]:checked:not(:disabled)', refs.scanResults).map((input) => input.value);
    if (!names.length) return;
    const need = names.length * 3 + 1;
    if (!githubApiNeed(need)) {
      showToast(`API 配额不足：接入约需 ${need} 次，当前剩余 ${state.rate.remaining} 次。可在设置中添加 Token。`, "error", 6000);
      return;
    }

    state.adding = true;
    refs.scanAddBtn.disabled = true;
    refs.selectAllBtn.hidden = true;
    const failures = [];
    let completed = 0;

    await runPool(
      names,
      async (fullName) => {
        if (state.repos.some((repo) => repo.full_name.toLowerCase() === fullName.toLowerCase())) {
          completed += 1;
          return;
        }
        try {
          const snapshot = await fetchSnapshot(fullName, { withCounts: false });
          if (snapshot) state.repos.push(snapshot);
        } catch (error) {
          failures.push(fullName);
        }
        completed += 1;
        refs.scanAddBtn.textContent = `接入中 ${completed}/${names.length}…`;
      },
      2
    );

    state.adding = false;
    saveState();
    renderAll();
    if (names.length - failures.length > 0) {
      state.filter = "all";
      state.search = "";
      if (refs.searchInput) refs.searchInput.value = "";
      renderFilters();
      renderGrid();
      closeDialog(refs.addDialog);
      showToast(`已接入 ${names.length - failures.length} 个项目${failures.length ? ` · ${failures.length} 个失败` : ""}`);
    } else {
      refs.scanAddBtn.textContent = "添加所选项目";
      refs.scanAddBtn.disabled = false;
      showToast("没有项目被接入，请稍后再试。", "error", 5000);
    }
  }

  /* ------------------------------------------------------------------
     Detail flow
     ------------------------------------------------------------------ */

  function openDetail(fullName) {
    const repo = state.repos.find((item) => item.full_name === fullName);
    if (!repo) return;
    state.activeDetail = fullName;
    state.pendingRemove = null;
    renderDetail(repo);
    openDialog(refs.detailDialog);
    if (repo.open_issues == null || repo.open_prs == null || !repo._countsAt || Date.now() - new Date(repo._countsAt).getTime() > 10 * 60000) {
      loadCounts(fullName);
    }
  }

  async function loadCounts(fullName) {
    if (state.countsLoading.has(fullName)) return;
    state.countsLoading.add(fullName);
    try {
      const counts = await fetchCounts(fullName);
      const repo = state.repos.find((item) => item.full_name === fullName);
      if (!repo) return;
      repo.open_issues = counts.open_issues;
      repo.open_prs = counts.open_prs;
      repo._countsAt = counts._countsAt;
      saveState();
      if (state.activeDetail === fullName && refs.detailDialog.open) {
        const issuesEl = $("#detailIssues");
        const prsEl = $("#detailPRs");
        if (issuesEl) issuesEl.textContent = counts.open_issues == null ? "—" : counts.open_issues >= 100 ? "100+" : counts.open_issues;
        if (prsEl) prsEl.textContent = counts.open_prs == null ? "—" : counts.open_prs >= 100 ? "100+" : counts.open_prs;
        const tiles = $$(".detail-stat[aria-busy]");
        tiles.forEach((tile) => tile.removeAttribute("aria-busy"));
      }
    } catch (error) {
      if (state.activeDetail === fullName && refs.detailDialog.open) {
        const issuesEl = $("#detailIssues");
        const prsEl = $("#detailPRs");
        if (issuesEl && !issuesEl.textContent.trim()) issuesEl.textContent = "—";
        if (prsEl && !prsEl.textContent.trim()) prsEl.textContent = "—";
      }
    } finally {
      state.countsLoading.delete(fullName);
    }
  }

  function removeRepo(fullName) {
    const repo = state.repos.find((item) => item.full_name === fullName);
    if (!repo) return;
    state.repos = state.repos.filter((item) => item.full_name !== fullName);
    state.pendingRemove = null;
    saveState();
    closeDialog(refs.detailDialog);
    renderAll();
    showToast(`已从看板移除 ${repo.name}`);
  }

  function bindDetailEvents() {
    refs.detailBody.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove]");
      if (removeButton) {
        const fullName = removeButton.dataset.remove;
        const repo = state.repos.find((item) => item.full_name === fullName);
        if (!repo) return;
        state.pendingRemove = fullName;
        const box = $("#removeBox");
        if (box) {
          box.innerHTML = `<span>确定移除「${esc(repo.name)}」？本地快照也会删除。</span><div class="remove-confirm"><button class="btn btn-ghost" type="button" data-remove-cancel>取消</button><button class="btn btn-danger" type="button" data-remove-confirm="${esc(fullName)}">移除</button></div>`;
        }
        return;
      }
      const cancel = event.target.closest("[data-remove-cancel]");
      if (cancel) {
        const repo = state.repos.find((item) => item.full_name === state.activeDetail);
        if (repo) {
          state.pendingRemove = null;
          const box = $("#removeBox");
          if (box) box.outerHTML = removeBoxMarkup(repo);
        }
        return;
      }
      const confirm = event.target.closest("[data-remove-confirm]");
      if (confirm) {
        removeRepo(confirm.dataset.removeConfirm);
        return;
      }
      const syncButton = event.target.closest("[data-detail-sync]");
      if (syncButton) {
        syncOne(syncButton.dataset.detailSync, syncButton);
      }
    });
  }

  /* ------------------------------------------------------------------
     Settings
     ------------------------------------------------------------------ */

  function openSettings() {
    refs.tokenError.textContent = "";
    refs.tokenInput.value = "";
    renderSettings();
    openDialog(refs.settingsDialog);
  }

  async function saveToken() {
    const token = refs.tokenInput.value.trim();
    const remember = refs.tokenRemember.checked;
    if (!token) {
      refs.tokenError.textContent = "请先粘贴一个 GitHub Token。";
      return;
    }
    refs.tokenSaveBtn.disabled = true;
    refs.tokenSaveBtn.textContent = "验证中…";
    refs.tokenError.textContent = "";
    try {
      const response = await fetch(`${API}/user`, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          Authorization: `Bearer ${token}`,
        },
      });
      readRate(response);
      if (!response.ok) {
        throw new Error(response.status === 401 ? "这个 Token 无效或已过期。" : `验证失败 (${response.status})`);
      }
      const user = await response.json();
      persistToken(token, remember);
      state.settings.tokenLogin = user.login;
      state.rateNotified = false;
      state.bannerDismissed = false;
      if (refs.banner) refs.banner.hidden = true;
      saveState();
      refs.tokenInput.value = "";
      refs.tokenError.textContent = "";
      renderSettings();
      showToast(`Token 已连接 · @${user.login}`);
    } catch (error) {
      refs.tokenError.textContent =
        error.message === "Failed to fetch" ? "网络连接失败，无法验证 Token。" : friendlyError(error);
    } finally {
      refs.tokenSaveBtn.disabled = false;
      refs.tokenSaveBtn.textContent = "保存";
    }
  }

  function clearSavedToken() {
    clearToken();
    refs.tokenInput.value = "";
    refs.tokenError.textContent = "";
    renderSettings();
    showToast("Token 已清除，回到公开 API。");
  }

  function downloadSnapshot() {
    try {
      const payload = {
        app: "Projetract",
        version: 1,
        exported_at: new Date().toISOString(),
        user: DEFAULT_USER,
        repos: state.repos,
        settings: {
          theme: state.settings.theme,
          sort: state.settings.sort,
          handle: state.settings.handle,
        },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `projetract-snapshot-${fmtDate(new Date()).replace(/\./g, "")}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("快照已导出。");
    } catch (error) {
      showToast("导出失败，请稍后再试。", "error");
    }
  }

  function restoreSeed() {
    if (!SEED_REPOS.length) {
      showToast("没有可恢复的预置项目。", "error");
      return;
    }
    const existing = new Set(state.repos.map((repo) => repo.full_name.toLowerCase()));
    let added = 0;
    for (const seedRepo of SEED_REPOS) {
      if (!existing.has(seedRepo.full_name.toLowerCase())) {
        const repo = normalizeRepo({
          ...clone(seedRepo),
          _fetchedAt: SEED_TIME,
          _origin: "seed",
        });
        if (repo) {
          state.repos.push(repo);
          added += 1;
        }
      }
    }
    saveState();
    state.filter = "all";
    state.search = "";
    if (refs.searchInput) refs.searchInput.value = "";
    renderAll();
    showToast(added ? `已恢复 ${added} 个预置项目` : "预置项目已经全部在看板上。");
  }

  /* ------------------------------------------------------------------
     Events
     ------------------------------------------------------------------ */

  function bindEvents() {
    refs.addBtn.addEventListener("click", () => openAdd("single"));
    refs.emptyAddBtn.addEventListener("click", () => {
      if (state.repos.length === 0) {
        openAdd("single");
      } else {
        state.filter = "all";
        state.search = "";
        refs.searchInput.value = "";
        renderFilters();
        renderGrid();
      }
    });
    refs.emptyResetBtn.addEventListener("click", restoreSeed);
    refs.syncBtn.addEventListener("click", syncAll);
    refs.settingsBtn.addEventListener("click", openSettings);
    refs.themeBtn.addEventListener("click", () => {
      setTheme(state.settings.theme === "night" ? "day" : "night");
    });
    refs.bannerClose.addEventListener("click", hideBanner);
    refs.bannerAction.addEventListener("click", () => {
      hideBanner();
      openSettings();
    });

    refs.filters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      state.filter = button.dataset.filter;
      renderFilters();
      renderGrid();
    });

    refs.searchInput.addEventListener("input", () => {
      state.search = refs.searchInput.value;
      renderGrid();
    });
    refs.searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        refs.searchInput.value = "";
        state.search = "";
        renderGrid();
        refs.searchInput.blur();
      }
    });

    refs.sortSelect.addEventListener("change", () => {
      state.settings.sort = refs.sortSelect.value;
      saveState();
      renderGrid();
    });

    refs.grid.addEventListener("click", (event) => {
      const opener = event.target.closest("[data-open]");
      if (opener) openDetail(opener.dataset.open);
    });

    $$("[data-close]").forEach((button) => {
      button.addEventListener("click", () => closeDialog(button.dataset.close));
    });

    [refs.detailDialog, refs.addDialog, refs.settingsDialog].forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
    });

    refs.tabSingleBtn.addEventListener("click", () => setAddTab("single"));
    refs.tabScanBtn.addEventListener("click", () => setAddTab("scan"));
    refs.singleForm.addEventListener("submit", submitSingleRepo);
    refs.scanForm.addEventListener("submit", submitScan);

    refs.scanResults.addEventListener("change", (event) => {
      if (event.target.matches('input[type="checkbox"]')) updateScanSelection();
    });
    refs.selectAllBtn.addEventListener("click", () => {
      const boxes = $$('input[type="checkbox"]:not(:disabled)', refs.scanResults);
      state.scan.allSelected = !state.scan.allSelected;
      boxes.forEach((box) => {
        box.checked = state.scan.allSelected;
      });
      refs.selectAllBtn.textContent = state.scan.allSelected ? "取消全选" : "全选可见";
      updateScanSelection();
    });
    refs.scanAddBtn.addEventListener("click", addSelectedRepos);

    refs.tokenSaveBtn.addEventListener("click", saveToken);
    refs.tokenClearBtn.addEventListener("click", clearSavedToken);
    refs.themeChoice.addEventListener("click", (event) => {
      const button = event.target.closest("[data-theme-choice]");
      if (button) setTheme(button.dataset.themeChoice);
    });
    refs.settingsSyncBtn.addEventListener("click", () => {
      closeDialog(refs.settingsDialog);
      syncAll();
    });
    refs.exportBtn.addEventListener("click", downloadSnapshot);
    refs.restoreSeedBtn.addEventListener("click", restoreSeed);

    refs.addDialog.addEventListener("close", () => {
      refs.singleError.textContent = "";
    });
    refs.detailDialog.addEventListener("close", () => {
      state.activeDetail = null;
      state.pendingRemove = null;
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") return;
      if (document.querySelector("dialog[open]")) return;
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        openAdd("single");
      } else if (event.key === "/") {
        event.preventDefault();
        refs.searchInput.focus();
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        syncAll();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) renderClock();
    });
  }

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */

  function init() {
    loadState();
    setTheme(state.settings.theme, false);
    bindEvents();
    bindDetailEvents();
    renderClock();
    setInterval(renderClock, 30000);
    if (refs.sortSelect) refs.sortSelect.value = state.settings.sort;
    if (refs.handleInput) refs.handleInput.value = state.settings.handle || DEFAULT_USER;
    renderAll();
    updateSyncButton();

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(state.chartRaf);
      state.chartRaf = requestAnimationFrame(() => {
        renderSeismo();
      });
    });
    observer.observe(refs.seismoChart);
  }

  init();
})();
