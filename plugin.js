// src/plugin.js
import {
  host,
  atom,
  useValue,
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  SESSION_ROW_AREAS,
  PALETTE_AREA,
  KEYBINDS_AREA,
  TITLEBAR_AREAS
} from "@hermes/plugin-sdk";
import { useEffect, useRef, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

// src/recent-reader.js
function createRecentReader(getDesktop = () => globalThis.window?.hermesDesktop) {
  return async (route) => {
    const desktop = getDesktop();
    if (typeof desktop?.api !== "function") throw new Error("\u6700\u8FD1\u306E\u6D3B\u52D5\u3092\u53D6\u5F97\u3059\u308BDesktop\u901A\u4FE1API\u304C\u3042\u308A\u307E\u305B\u3093\u3002");
    if (!route || !["connectionId", "profile", "targetProfile"].every((key) => typeof route[key] === "string" && route[key].length > 0 && route[key] === route[key].trim())) {
      throw new Error("\u8AAD\u53D6\u5148\u306E\u6240\u6709\u8005\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002");
    }
    const query = new URLSearchParams({
      limit: "500",
      offset: "0",
      min_messages: "0",
      archived: "exclude",
      order: "recent",
      profile: route.targetProfile
    });
    return desktop.api({
      connectionId: route.connectionId,
      method: "GET",
      path: `/api/profiles/sessions?${query}`,
      timeoutMs: 6e4,
      passive: true
    });
  };
}

// src/core.js
var STATES = Object.freeze({ unclassified: "\u72B6\u614B\u3092\u89E3\u9664", working: "\u4F5C\u696D\u4E2D", paused: "\u4FDD\u7559", done: "\u5B8C\u4E86" });
var STORAGE_KEY = "work-status-v1";
var PLUGIN_ID = "session-work-status";
var RAW_KEY = `hermes.plugin.${PLUGIN_ID}.${STORAGE_KEY}`;
var nonempty = (value) => typeof value === "string" && value.length > 0 && value === value.trim();
var ownerKey = (route) => JSON.stringify([route.connectionId, route.targetProfile]);
var identityKey = (item) => JSON.stringify([item.route.connectionId, item.route.targetProfile, item.sessionId]);
function validRoute(route) {
  return route && nonempty(route.connectionId) && nonempty(route.profile) && nonempty(route.targetProfile) && ["local", "remote"].includes(route.mode);
}
function decode(value) {
  if (value === null) return { version: 1, entries: {} };
  if (!value || value.version !== 1 || Object.keys(value).some((key) => !["version", "entries", "details"].includes(key)) || !value.entries || typeof value.entries !== "object" || Array.isArray(value.entries)) {
    throw new Error("\u4FDD\u5B58\u30C7\u30FC\u30BF\u306E\u5F62\u5F0F\u304C\u4E0D\u660E\u3067\u3059\u3002\u4E0A\u66F8\u304D\u305B\u305A\u505C\u6B62\u3057\u307E\u3057\u305F\u3002");
  }
  for (const [key, state] of Object.entries(value.entries)) {
    let identity;
    try {
      identity = JSON.parse(key);
    } catch {
      throw new Error("\u4FDD\u5B58\u3055\u308C\u305F\u8B58\u5225\u5B50\u304C\u4E0D\u6B63\u3067\u3059\u3002");
    }
    if (!Array.isArray(identity) || identity.length !== 3 || !identity.every(nonempty) || JSON.stringify(identity) !== key || !Object.hasOwn(STATES, state)) {
      throw new Error("\u4FDD\u5B58\u30C7\u30FC\u30BF\u306B\u672A\u77E5\u306E\u72B6\u614B\u307E\u305F\u306F\u8B58\u5225\u5B50\u304C\u3042\u308A\u307E\u3059\u3002");
    }
  }
  if (value.details != null) {
    if (typeof value.details !== "object" || Array.isArray(value.details)) throw new Error("\u4FDD\u5B58\u3055\u308C\u305F\u8868\u793A\u60C5\u5831\u304C\u4E0D\u6B63\u3067\u3059\u3002");
    for (const [key, item] of Object.entries(value.details)) {
      if (!item || !validRoute(item.route) || !nonempty(item.sessionId) || identityKey(item) !== key || typeof item.title !== "string") throw new Error("\u4FDD\u5B58\u3055\u308C\u305F\u6240\u6709\u8005\u60C5\u5831\u304C\u4E0D\u6B63\u3067\u3059\u3002");
    }
  }
  return value;
}
function readStatuses(storage, rawStorage) {
  const raw = rawStorage.getItem(RAW_KEY);
  const value = storage.get(STORAGE_KEY, null);
  if (raw !== null && value === null) throw new Error("\u4FDD\u5B58\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093\u3002\u4E0A\u66F8\u304D\u305B\u305A\u505C\u6B62\u3057\u307E\u3057\u305F\u3002");
  return decode(value);
}
function saveStatus(storage, rawStorage, item, state) {
  if (!Object.hasOwn(STATES, state) || !nonempty(item.route?.connectionId) || !nonempty(item.route?.targetProfile) || !nonempty(item.sessionId)) throw new Error("\u72B6\u614B\u307E\u305F\u306F\u6240\u6709\u8005\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  const current = readStatuses(storage, rawStorage);
  const entries = { ...current.entries };
  const key = identityKey(item);
  if (!validRoute(item.route) && !Object.hasOwn(entries, key)) throw new Error("\u6240\u6709\u8005\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002");
  if (state === "unclassified") delete entries[key];
  else entries[key] = state;
  const details = { ...current.details };
  if (state === "unclassified") delete details[key];
  else if (validRoute(item.route)) details[key] = {
    sessionId: item.sessionId,
    route: { ...item.route },
    title: item.title || item.sessionId,
    last_active: item.last_active || current.details?.[key]?.last_active || 0,
    started_at: item.started_at || current.details?.[key]?.started_at || 0
  };
  const next = { version: 1, entries, details };
  storage.set(STORAGE_KEY, next);
  if (JSON.stringify(storage.get(STORAGE_KEY, null)) !== JSON.stringify(next)) {
    throw new Error("\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u72B6\u614B\u306F\u5909\u66F4\u3057\u3066\u3044\u307E\u305B\u3093\u3002");
  }
  return next;
}
async function readCatalog(host2, isCurrent = () => true, readPage = createRecentReader()) {
  if (typeof host2.profileRoutes !== "function") {
    throw new Error("\u3053\u306EDesktop\u306F\u5FC5\u8981\u306ASDK\u306B\u672A\u5BFE\u5FDC\u3067\u3059\u3002");
  }
  const routes = await host2.profileRoutes();
  if (!Array.isArray(routes) || routes.length === 0 || routes.some((route) => !validRoute(route))) {
    throw new Error("\u63A5\u7D9A\u30FB\u30D7\u30ED\u30D5\u30A1\u30A4\u30EB\u306E\u6240\u6709\u8005\u4E00\u89A7\u3092\u78BA\u5B9A\u3067\u304D\u307E\u305B\u3093\u3002");
  }
  const unique = [...new Map(routes.map((route) => [ownerKey(route), { ...route }])).values()];
  const items = /* @__PURE__ */ new Map();
  const issues = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, unique.length) }, async () => {
    while (isCurrent() && cursor < unique.length) {
      const route = unique[cursor++];
      const label = `${route.connectionId} / ${route.targetProfile}`;
      try {
        const page = await readPage(route);
        if (!page || !Array.isArray(page.sessions) || !Number.isInteger(page.total) || page.total < 0 || page.offset !== 0) {
          throw new Error("\u4E00\u89A7\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059");
        }
        if (page.errors?.length || Object.keys(page.storage ?? {}).length) throw new Error("\u5C65\u6B74DB\u306E\u4E00\u90E8\u3092\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093");
        if (page.sessions.length >= 500) issues.push(`${label}: \u53D6\u5F97\u4E0A\u9650500\u4EF6\u306B\u9054\u3057\u3066\u3044\u307E\u3059\uFF08pin\u8FFD\u52A0\u5206\u3092\u542B\u3080\uFF09\u3002\u5168\u5C65\u6B74\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002`);
        for (const session of page.sessions) {
          const sessionId = session._lineage_root_id ?? session.id;
          if (!nonempty(session.id) || !nonempty(sessionId) || session.profile != null && session.profile !== route.targetProfile || session.connection_id != null && session.connection_id !== route.connectionId) {
            throw new Error("\u30BB\u30C3\u30B7\u30E7\u30F3\u6240\u6709\u8005\u307E\u305F\u306FID\u304C\u4E0D\u660E\u3067\u3059");
          }
          if (session.hidden || session.archived) continue;
          const item = { route, sessionId, liveId: session.id, title: session.title || session.preview || sessionId, last_active: session.last_active || 0, started_at: session.started_at || 0 };
          items.set(identityKey(item), item);
        }
      } catch (error) {
        issues.push(`${label}: ${error.message}`);
        for (const [key, item] of items) if (ownerKey(item.route) === ownerKey(route)) items.delete(key);
      }
    }
  }));
  return { items: [...items.values()], routes: unique, issues, complete: issues.length === 0 };
}
function resolveRow(catalog, sessionId) {
  const candidates = catalog.items.filter((item) => item.sessionId === sessionId);
  if (candidates.length > 1) return { issue: "\u540C\u3058ID\u304C\u8907\u6570\u306E\u6240\u6709\u8005\u306B\u3042\u308A\u307E\u3059\u3002\u884C\u304B\u3089\u306F\u5909\u66F4\u3067\u304D\u307E\u305B\u3093\u3002" };
  if (!catalog.complete) return { issue: "\u4E00\u89A7\u306E\u8AAD\u53D6\u304C\u672A\u5B8C\u4E86\u3067\u3059\u3002\u6240\u6709\u8005\u3092\u78BA\u5B9A\u3067\u304D\u307E\u305B\u3093\u3002" };
  if (candidates.length !== 1) return { issue: "\u53D6\u5F97\u7BC4\u56F2\u5185\u306B\u3053\u306E\u4F1A\u8A71\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u767B\u9332\u6E08\u307F\u306A\u3089\u4F5C\u696D\u7BA1\u7406\u3067\u64CD\u4F5C\u3067\u304D\u307E\u3059\u3002" };
  return { item: candidates[0] };
}
function registeredItems(catalog, entries, details = {}) {
  const items = new Map(catalog.items.map((item) => {
    const key = identityKey(item);
    return [key, {
      ...item,
      last_active: item.last_active || details[key]?.last_active || 0,
      started_at: item.started_at || details[key]?.started_at || 0,
      available: true
    }];
  }));
  for (const [key, state] of Object.entries(entries)) {
    if (state === "unclassified" || items.has(key)) continue;
    const [connectionId, targetProfile, sessionId] = JSON.parse(key);
    const route = catalog.routes?.find((route2) => route2.connectionId === connectionId && route2.targetProfile === targetProfile);
    const saved = details[key];
    items.set(key, {
      ...saved,
      sessionId,
      route: route || saved?.route || { connectionId, targetProfile },
      title: saved?.title || sessionId,
      available: Boolean(route),
      outsideWindow: true
    });
  }
  return filterItems([...items.values()], entries, "all");
}
function sortItems(items, sort) {
  return [...items].sort((a, b) => {
    const delta = sort === "title" ? a.title.localeCompare(b.title, "ja") : sort === "created" ? (b.started_at || 0) - (a.started_at || 0) : (b.last_active || b.started_at || 0) - (a.last_active || a.started_at || 0);
    return delta || identityKey(a).localeCompare(identityKey(b));
  });
}
function filterItems(items, entries, filter) {
  return items.filter((item) => entries[identityKey(item)] && entries[identityKey(item)] !== "unclassified" && (filter === "all" || entries[identityKey(item)] === filter));
}

// src/controller.js
function createController(ctx, host2, makeAtom, rawStorage, readPage) {
  const state = makeAtom({ entries: {}, details: {}, storageIssue: "", message: "", catalog: { items: [], issues: [], complete: false }, loading: false });
  let disposed = false;
  let inFlight = null;
  let epoch = 0;
  let loaded = false;
  let loadedAt = 0;
  const update = (patch) => {
    if (!disposed) state.set({ ...state.get(), ...patch });
  };
  function reloadStorage() {
    try {
      const saved = readStatuses(ctx.storage, rawStorage);
      update({ entries: saved.entries, details: saved.details || {}, storageIssue: "" });
    } catch (error) {
      update({ storageIssue: error.message });
    }
  }
  reloadStorage();
  async function refresh() {
    if (disposed) return;
    if (inFlight) return inFlight;
    update({ loading: true, catalog: { ...state.get().catalog, complete: false }, message: "" });
    inFlight = (async () => {
      let generation;
      do {
        generation = epoch;
        try {
          const catalog = await readCatalog(host2, () => !disposed && generation === epoch, readPage);
          if (generation === epoch) {
            loaded = true;
            loadedAt = Date.now();
            update({ catalog });
          }
        } catch (error) {
          if (generation === epoch) update({ catalog: { items: [], issues: [error.message], complete: false } });
        }
      } while (!disposed && generation !== epoch);
    })().finally(() => {
      inFlight = null;
      update({ loading: false });
    });
    return inFlight;
  }
  function invalidate() {
    if (disposed) return;
    epoch++;
    loaded = false;
    update({ catalog: { items: [], issues: [], complete: false } });
    void refresh();
  }
  function setStatus(item, next, fromRow = false) {
    if (disposed) return;
    try {
      const current = state.get();
      if (!validRoute(item.route) && (fromRow || !Object.hasOwn(current.entries, identityKey(item)))) throw new Error("\u6240\u6709\u8005\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002");
      if (fromRow) {
        const resolved = resolveRow(current.catalog, item.sessionId);
        if (current.loading || !resolved.item || identityKey(resolved.item) !== identityKey(item)) throw new Error(resolved.issue || "\u6240\u6709\u8005\u304C\u5909\u66F4\u3055\u308C\u307E\u3057\u305F\u3002\u30E1\u30CB\u30E5\u30FC\u3092\u958B\u304D\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
        item = resolved.item;
      } else if (!registeredItems(current.catalog, current.entries, current.details).some((entry) => identityKey(entry) === identityKey(item))) throw new Error("\u767B\u9332\u6E08\u307F\u306E\u72B6\u614B\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      const catalogItem = current.catalog.items.find((entry) => identityKey(entry) === identityKey(item));
      const saved = saveStatus(ctx.storage, rawStorage, {
        ...item,
        last_active: catalogItem?.last_active || item.last_active,
        started_at: catalogItem?.started_at || item.started_at
      }, next);
      update({ entries: saved.entries, details: saved.details || {}, storageIssue: "", message: "" });
    } catch (error) {
      reloadStorage();
      update({ message: error.message });
      host2.notify({ kind: "error", message: error.message });
    }
  }
  ctx.onDispose(() => {
    disposed = true;
    epoch++;
  });
  for (const source of [host2.state?.profile, host2.state?.connectionId]) {
    if (source?.listen) ctx.onDispose(source.listen(invalidate));
  }
  if (typeof window !== "undefined") {
    ctx.addEventListener(window, "storage", (event) => {
      if (event.key === null || event.key === "hermes.plugin.session-work-status.work-status-v1") reloadStorage();
    });
  }
  const ensure = () => !loaded || Date.now() - loadedAt >= 3e4 ? refresh() : Promise.resolve();
  return {
    state,
    refresh,
    ensure,
    setStatus: (item, next) => setStatus(item, next),
    setRowStatus: (item, next) => setStatus(item, next, true)
  };
}

// src/plugin.js
var quiet = { color: "var(--ui-text-secondary)", fontSize: "11px" };
var marks = { working: "\u25CF", paused: "\u2161", done: "\u2713" };
var states = Object.entries(STATES).filter(([value]) => value !== "unclassified");
var SORT_KEY = "work-status-sort-v1";
var sorts = { recent: "\u6700\u8FD1\u306E\u6D3B\u52D5", created: "\u4F5C\u6210\u65E5\u6642", title: "\u30BF\u30A4\u30C8\u30EB" };
function retainOrder(previous, fresh) {
  const present = new Set(fresh);
  const seen = new Set(previous);
  return [...previous.filter((key) => present.has(key)), ...fresh.filter((key) => !seen.has(key))];
}
var colors = { working: "var(--ui-accent)", paused: "var(--ui-yellow)", done: "var(--ui-green)" };
function RowMark({ controller, sessionId, openManager }) {
  const data = useValue(controller.state);
  const [open, setOpen] = useState(false);
  const parent = useRef(null);
  useEffect(() => {
    void controller.ensure();
  }, [controller]);
  const { item, issue } = resolveRow(data.catalog, sessionId);
  const current = item ? data.entries[identityKey(item)] : void 0;
  const blocked = data.loading || !item || Boolean(data.storageIssue);
  return jsxs(DropdownMenu, { open, onOpenChange: setOpen, children: [
    jsx(DropdownMenuTrigger, { asChild: true, children: jsx("span", {
      "data-work-status": sessionId,
      title: `\u4F5C\u696D\u72B6\u614B${current ? `: ${STATES[current]}` : "\u3092\u8A2D\u5B9A\uFF08\u5DE6\u30AF\u30EA\u30C3\u30AF\uFF09"}`,
      // Pointer-only decoration inside the native RowButton, not a nested
      // button or independent keyboard stop. Keyboard status editing is in Dialog.
      style: { display: "inline-flex", padding: "2px 5px", cursor: "pointer", color: colors[current] || "var(--ui-text-quaternary)", fontSize: "12px" },
      onPointerDown: (event) => {
        if (event.button === 0) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        parent.current = event.currentTarget.closest("button");
        setOpen((value) => !value);
        void controller.ensure();
      },
      children: marks[current] || "\u25C7"
    }) }),
    jsx(DropdownMenuContent, {
      align: "end",
      onPointerDown: (event) => event.stopPropagation(),
      onClick: (event) => event.stopPropagation(),
      onKeyDown: (event) => event.stopPropagation(),
      onCloseAutoFocus: (event) => {
        event.preventDefault();
        if (parent.current?.isConnected) parent.current.focus();
      },
      children: [
        jsx("div", { style: { ...quiet, padding: "5px 8px" }, children: "\u4F5C\u696D\u72B6\u614B" }, "heading"),
        ...states.map(([value, label]) => jsx(DropdownMenuItem, {
          disabled: blocked,
          onSelect: () => controller.setRowStatus(item, value),
          children: jsxs("span", { children: [jsx("span", { style: { color: colors[value] }, children: `${marks[value]} ` }), label, current === value ? " \u2713" : ""] })
        }, value)),
        jsx(DropdownMenuItem, {
          disabled: blocked || !current || current === "unclassified",
          onSelect: () => controller.setRowStatus(item, "unclassified"),
          children: STATES.unclassified
        }, "reset"),
        ...blocked ? [
          jsx("div", {
            role: "status",
            style: { ...quiet, maxWidth: "260px", padding: "6px 8px" },
            children: data.storageIssue || (data.loading ? "\u6240\u6709\u8005\u3092\u78BA\u8A8D\u4E2D\u2026" : data.catalog.issues[0] || issue)
          }, "issue"),
          jsx(DropdownMenuItem, { onSelect: openManager, children: "\u4F5C\u696D\u7BA1\u7406\u3092\u958B\u304F" }, "manager")
        ] : []
      ]
    })
  ] });
}
function StatusMenu({ controller, item }) {
  const data = useValue(controller.state);
  const current = data.entries[identityKey(item)];
  const blocked = Boolean(data.storageIssue);
  return jsxs(DropdownMenu, { children: [
    jsx(DropdownMenuTrigger, { asChild: true, children: jsx(Button, {
      size: "xs",
      variant: "chip",
      disabled: blocked,
      style: { color: colors[current] },
      "aria-label": `\u4F5C\u696D\u72B6\u614B: ${STATES[current] || ""}`,
      children: `${marks[current] || ""} ${STATES[current] || ""}`
    }) }),
    jsx(DropdownMenuContent, { align: "end", children: [
      ...states.map(([value, label]) => jsx(DropdownMenuItem, {
        disabled: blocked,
        onSelect: () => controller.setStatus(item, value),
        children: label
      }, value)),
      jsx(DropdownMenuItem, { disabled: blocked, onSelect: () => controller.setStatus(item, "unclassified"), children: STATES.unclassified }, "reset")
    ] })
  ] });
}
function WorkDialog({ ctx, controller, surface, openerRef }) {
  const data = useValue(controller.state);
  const open = useValue(surface);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState(() => {
    const saved = ctx.storage.get(SORT_KEY, "recent");
    return Object.hasOwn(sorts, saved) ? saved : "recent";
  });
  const [snapshot, setSnapshot] = useState([]);
  const [selected, setSelected] = useState("");
  const interaction = useRef(0);
  const pending = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const dispose = surface.listen(() => {
      generation.current++;
    });
    return () => {
      mounted.current = false;
      generation.current++;
      dispose();
    };
  }, [surface]);
  const searchRef = useRef(null);
  const rowRefs = useRef(/* @__PURE__ */ new Map());
  const readItems = () => {
    const current = controller.state.get();
    return registeredItems(current.catalog, current.entries, current.details);
  };
  useEffect(() => {
    if (!open) return;
    let current = true;
    const initialInteraction = interaction.current;
    setSearch("");
    setFilter("all");
    setSelected("");
    setSnapshot(sortItems(readItems(), sort).map(identityKey));
    void controller.refresh().then(() => {
      if (!current) return;
      const fresh = sortItems(readItems(), sort).map(identityKey);
      setSnapshot((previous) => {
        if (interaction.current === initialInteraction || previous.length === 0) return fresh;
        return retainOrder(previous, fresh);
      });
    });
    return () => {
      current = false;
    };
  }, [open]);
  const liveItems = registeredItems(data.catalog, data.entries, data.details);
  const byKey = new Map(liveItems.map((item) => [identityKey(item), item]));
  const keys = [...byKey.keys()];
  useEffect(() => {
    if (open) setSnapshot((previous) => retainOrder(previous, keys));
  }, [open, data.catalog, data.entries, data.details]);
  const items = filterItems(retainOrder(snapshot, keys).map((key) => byKey.get(key)), data.entries, filter).filter((item) => `${item.title} ${item.sessionId} ${item.route.connectionId} ${item.route.targetProfile}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const openItem = async (item) => {
    if (!item.route || pending.current) return;
    const latest = controller.state.get();
    if (latest.loading || latest.storageIssue) return;
    const fresh = registeredItems(latest.catalog, latest.entries, latest.details).find((entry) => identityKey(entry) === identityKey(item));
    if (!fresh?.available) return;
    pending.current = true;
    setOpening(true);
    const started = generation.current;
    const current = () => mounted.current && generation.current === started && surface.get();
    try {
      await host.openSession(fresh.sessionId, { route: fresh.route, intent: "in-place" });
      if (current()) surface.set(false);
    } catch (error) {
      if (current()) host.notify({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      pending.current = false;
      if (mounted.current) setOpening(false);
    }
  };
  const move = (event, direction) => {
    if (!items.length) return;
    event.preventDefault();
    const index = items.findIndex((item) => identityKey(item) === selected);
    const nextIndex = index < 0 ? direction > 0 ? 0 : items.length - 1 : (index + direction + items.length) % items.length;
    const next = items[nextIndex];
    const key = identityKey(next);
    setSelected(key);
    rowRefs.current.get(key)?.focus();
  };
  return jsx(Dialog, { open, onOpenChange: (value) => surface.set(value), children: jsxs(DialogContent, {
    bodyClassName: "overscroll-contain",
    style: { width: "min(560px, 92vw)", maxHeight: "80vh" },
    onPointerDown: () => {
      interaction.current++;
    },
    onKeyDown: () => {
      interaction.current++;
    },
    onCloseAutoFocus: (event) => {
      event.preventDefault();
      openerRef.current?.focus();
    },
    onOpenAutoFocus: (event) => {
      event.preventDefault();
      searchRef.current?.focus();
    },
    children: [
      jsxs(DialogHeader, { children: [
        jsx(DialogTitle, { children: "\u4F5C\u696D\u7BA1\u7406" }),
        jsx(DialogDescription, { children: "\u72B6\u614B\u3092\u8A2D\u5B9A\u3057\u305F\u4F1A\u8A71\u3060\u3051\u3092\u8868\u793A\u3057\u307E\u3059\u3002\u89E3\u9664\u3057\u3066\u3082\u4F1A\u8A71\u306F\u6B8B\u308A\u307E\u3059\u3002" })
      ] }),
      jsx(Input, {
        ref: searchRef,
        "aria-label": "\u4F5C\u696D\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u691C\u7D22",
        placeholder: "\u767B\u9332\u6E08\u307F\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u691C\u7D22\u2026",
        value: search,
        onChange: (event) => {
          interaction.current++;
          setSearch(event.target.value);
          setSelected("");
        },
        onKeyDown: (event) => {
          if (event.key === "ArrowDown") move(event, 1);
          if (event.key === "ArrowUp") move(event, -1);
          if (event.key === "Enter") openItem(items.find((item) => identityKey(item) === selected) || items[0] || {});
        }
      }),
      jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }, children: [
        ...Object.entries({ all: "\u3059\u3079\u3066", ...Object.fromEntries(states) }).map(([value, label]) => jsx(Button, {
          size: "xs",
          variant: filter === value ? "secondary" : "ghost",
          "aria-pressed": filter === value,
          onClick: () => {
            interaction.current++;
            setFilter(value);
            setSelected("");
          },
          children: label
        }, value)),
        jsx("label", { children: jsxs("span", { children: ["\u4E26\u3073\u9806 ", jsx("select", {
          "aria-label": "\u4E26\u3073\u9806",
          value: sort,
          style: { color: "var(--ui-text-primary)", background: "var(--ui-bg-secondary)" },
          onChange: (event) => {
            interaction.current++;
            const value = event.target.value;
            ctx.storage.set(SORT_KEY, value);
            if (ctx.storage.get(SORT_KEY, null) !== value) {
              host.notify({ kind: "error", message: "\u4E26\u3073\u9806\u3092\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002" });
              return;
            }
            setSort(value);
            setSnapshot(sortItems(readItems(), value).map(identityKey));
            setSelected("");
          },
          children: Object.entries(sorts).map(([value, label]) => jsx("option", { value, children: label }, value))
        })] }) }),
        jsx(Button, { size: "xs", variant: "outline", disabled: data.loading, onClick: async () => {
          const started = generation.current;
          const initialInteraction = interaction.current;
          await controller.refresh();
          if (mounted.current && surface.get() && generation.current === started && interaction.current === initialInteraction) setSnapshot(sortItems(readItems(), sort).map(identityKey));
        }, children: data.loading ? "\u66F4\u65B0\u4E2D\u2026" : "\u4E00\u89A7\u3092\u66F4\u65B0" })
      ] }),
      ...[data.storageIssue, data.message, ...data.catalog.issues].filter(Boolean).map((message, index) => jsx("div", {
        role: "alert",
        style: quiet,
        children: message
      }, `issue-${index}`)),
      jsx("p", { style: quiet, children: "\u6700\u8FD1\u6D3B\u52D5500\u4EF6\uFF0Bpin\u8FFD\u52A0\u5206\uFF0F\u6240\u6709\u8005\u3068\u4FDD\u5B58\u6E08\u307F\u767B\u9332\u3002\u53D6\u5F97\u7BC4\u56F2\u5916\u306F\u4FDD\u5B58\u60C5\u5831\u3067\u3059\u3002\u64CD\u4F5C\u4E2D\u306F\u9806\u5E8F\u3092\u56FA\u5B9A\u3057\u307E\u3059\u3002" }),
      jsx("div", { "aria-label": "\u767B\u9332\u6E08\u307F\u30BB\u30C3\u30B7\u30E7\u30F3", children: items.length ? items.map((item) => {
        const key = identityKey(item);
        return jsxs("article", { "data-session": item.sessionId, style: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 4px", borderBottom: "1px solid var(--ui-stroke-secondary)", background: selected === key ? "var(--ui-bg-card)" : "transparent" }, children: [
          jsx("span", { "aria-hidden": true, style: { color: colors[data.entries[key]] }, children: marks[data.entries[key]] }),
          jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
            jsx(Button, {
              ref: (node) => {
                if (node) rowRefs.current.set(key, node);
                else rowRefs.current.delete(key);
              },
              variant: "ghost",
              style: { maxWidth: "100%", textAlign: "left", whiteSpace: "normal", overflowWrap: "anywhere", justifyContent: "flex-start" },
              disabled: opening || data.loading || !item.available || Boolean(data.storageIssue),
              "aria-label": `\u4F1A\u8A71\u3092\u9078\u629E: ${item.title}`,
              onFocus: () => setSelected(key),
              onClick: () => setSelected(key),
              onKeyDown: (event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  openItem(item);
                }
                if (event.key === "ArrowDown") move(event, 1);
                if (event.key === "ArrowUp") move(event, -1);
              },
              children: item.title
            }),
            jsx("div", { style: quiet, children: `${item.route.connectionId} / ${item.route.targetProfile}${item.outsideWindow ? " \xB7 \u53D6\u5F97\u7BC4\u56F2\u5916\uFF08\u4FDD\u5B58\u60C5\u5831\uFF09" : ""}${data.loading ? " \xB7 \u6240\u6709\u8005\u3092\u78BA\u8A8D\u4E2D\u2026" : !item.available ? " \xB7 \u63A5\u7D9A\u672A\u78BA\u8A8D" : ""}` })
          ] }),
          jsx(StatusMenu, { controller, item })
        ] }, key);
      }) : jsx("p", { style: quiet, children: data.loading ? "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026" : "\u3053\u306E\u6761\u4EF6\u306E\u767B\u9332\u6E08\u307F\u30BB\u30C3\u30B7\u30E7\u30F3\u306F\u3042\u308A\u307E\u305B\u3093\u3002" }) }),
      jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "12px" }, children: [
        jsx("span", { style: quiet, children: `${items.length}\u4EF6\u306E\u767B\u9332\u6E08\u307F\u30BB\u30C3\u30B7\u30E7\u30F3` }),
        jsx(Button, {
          size: "sm",
          disabled: opening || data.loading || !items.some((item) => identityKey(item) === selected && item.available) || Boolean(data.storageIssue),
          onClick: () => openItem(items.find((item) => identityKey(item) === selected) || {}),
          children: opening ? "\u958B\u3044\u3066\u3044\u307E\u3059\u2026" : "\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u958B\u304F"
        })
      ] })
    ]
  }) });
}
var plugin_default = {
  id: PLUGIN_ID,
  name: "Session Work Status",
  description: "\u884C\u672B\u30DE\u30FC\u30AF\u306E\u5DE6\u30AF\u30EA\u30C3\u30AF\u3067\u624B\u52D5\u72B6\u614B\u3092\u8A2D\u5B9A\u3057\u3001\u767B\u9332\u6E08\u307F\u306E\u4F1A\u8A71\u3092Dialog\u3067\u7BA1\u7406\u3002",
  register(ctx) {
    const controller = createController(ctx, host, atom, { getItem: (key) => window.localStorage.getItem(key) });
    const surface = atom(false);
    const open = () => surface.set(true);
    ctx.register({
      id: "session-status-mark",
      area: SESSION_ROW_AREAS.trailing,
      data: { render: ({ sessionId }) => jsx(RowMark, { controller, sessionId, openManager: open }) }
    });
    function Manager() {
      const openerRef = useRef(null);
      return jsxs("div", { style: { WebkitAppRegion: "no-drag" }, children: [
        jsx(Button, { ref: openerRef, size: "xs", variant: "ghost", onClick: open, children: "\u4F5C\u696D\u7BA1\u7406" }),
        jsx(WorkDialog, { ctx, controller, surface, openerRef })
      ] });
    }
    ctx.register({ id: "manager", area: TITLEBAR_AREAS.right, order: 50, render: () => jsx(Manager, {}) });
    ctx.register({ id: "open-manager", area: PALETTE_AREA, data: {
      id: `${PLUGIN_ID}.open-manager`,
      label: "\u4F5C\u696D\u7BA1\u7406",
      action: `${PLUGIN_ID}.open-manager`,
      run: open,
      keywords: ["work", "status", "\u4F5C\u696D", "\u72B6\u614B"]
    } });
    ctx.register({ id: "manager-keybind", area: KEYBINDS_AREA, data: {
      id: `${PLUGIN_ID}.open-manager`,
      label: "\u4F5C\u696D\u7BA1\u7406",
      category: "view",
      defaults: [],
      run: open
    } });
  }
};
export {
  plugin_default as default
};
