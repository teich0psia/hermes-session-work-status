// src/plugin.js
import {
  host,
  atom,
  useValue,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  SESSION_ROW_AREAS,
  PANES_AREA
} from "@hermes/plugin-sdk";
import { forwardRef, useEffect, useRef, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

// src/core.js
var STATES = Object.freeze({ unclassified: "\u672A\u5206\u985E", working: "\u4F5C\u696D\u4E2D", paused: "\u4FDD\u7559", done: "\u5B8C\u4E86" });
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
  if (!value || value.version !== 1 || Object.keys(value).some((key) => !["version", "entries"].includes(key)) || !value.entries || typeof value.entries !== "object" || Array.isArray(value.entries)) {
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
  return value;
}
function readStatuses(storage, rawStorage) {
  const raw = rawStorage.getItem(RAW_KEY);
  const value = storage.get(STORAGE_KEY, null);
  if (raw !== null && value === null) throw new Error("\u4FDD\u5B58\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093\u3002\u4E0A\u66F8\u304D\u305B\u305A\u505C\u6B62\u3057\u307E\u3057\u305F\u3002");
  return decode(value);
}
function saveStatus(storage, rawStorage, item, state) {
  if (!Object.hasOwn(STATES, state) || !validRoute(item.route) || !nonempty(item.sessionId)) throw new Error("\u72B6\u614B\u307E\u305F\u306F\u6240\u6709\u8005\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  const current = readStatuses(storage, rawStorage);
  const entries = { ...current.entries };
  const key = identityKey(item);
  if (state === "unclassified") delete entries[key];
  else entries[key] = state;
  const next = { version: 1, entries };
  storage.set(STORAGE_KEY, next);
  if (JSON.stringify(storage.get(STORAGE_KEY, null)) !== JSON.stringify(next)) {
    throw new Error("\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u72B6\u614B\u306F\u5909\u66F4\u3057\u3066\u3044\u307E\u305B\u3093\u3002");
  }
  return next;
}
async function readCatalog(host2, isCurrent = () => true) {
  if (typeof host2.profileRoutes !== "function" || typeof host2.listPersistedSessions !== "function") {
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
        const page = await host2.listPersistedSessions(route, { profile: route.targetProfile, limit: 500 });
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
          const item = { route, sessionId, liveId: session.id, title: session.title || session.preview || sessionId };
          items.set(identityKey(item), item);
        }
      } catch (error) {
        issues.push(`${label}: ${error.message}`);
        for (const [key, item] of items) if (ownerKey(item.route) === ownerKey(route)) items.delete(key);
      }
    }
  }));
  return { items: [...items.values()].sort((a, b) => a.title.localeCompare(b.title, "ja")), issues, complete: issues.length === 0 };
}
function resolveRow(catalog, sessionId) {
  if (!catalog.complete) return { reason: "\u6240\u6709\u8005\u4E00\u89A7\u304C\u672A\u5B8C\u4E86\u3067\u3059\u3002\u4F5C\u696D\u30BB\u30C3\u30B7\u30E7\u30F3\u3067\u66F4\u65B0\u30FB\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002" };
  const matches = catalog.items.filter((item) => item.sessionId === sessionId);
  if (matches.length !== 1) return { reason: matches.length ? "\u8907\u6570\u306E\u6240\u6709\u8005\u306B\u540C\u3058ID\u304C\u3042\u308A\u307E\u3059\u3002\u4F5C\u696D\u30BB\u30C3\u30B7\u30E7\u30F3\u3067\u6240\u6709\u8005\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002" : "\u6240\u6709\u8005\u672A\u78BA\u8A8D\u3067\u3059\u3002\u4F5C\u696D\u30BB\u30C3\u30B7\u30E7\u30F3\u3067\u4E00\u89A7\u3092\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044\u3002" };
  return { item: matches[0] };
}
function filterItems(items, entries, filter) {
  return filter === "all" ? items : items.filter((item) => (entries[identityKey(item)] ?? "unclassified") === filter);
}

// src/controller.js
function createController(ctx, host2, makeAtom, rawStorage) {
  const state = makeAtom({ entries: {}, storageIssue: "", message: "", catalog: { items: [], issues: [], complete: false }, loading: false });
  let disposed = false;
  let inFlight = null;
  let epoch = 0;
  let loaded = false;
  const update = (patch) => {
    if (!disposed) state.set({ ...state.get(), ...patch });
  };
  function reloadStorage() {
    try {
      update({ entries: readStatuses(ctx.storage, rawStorage).entries, storageIssue: "" });
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
          const catalog = await readCatalog(host2, () => !disposed && generation === epoch);
          if (generation === epoch) {
            loaded = true;
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
      if (current.loading || !current.catalog.items.some((entry) => identityKey(entry) === identityKey(item))) throw new Error("\u4E00\u89A7\u3092\u66F4\u65B0\u3057\u3066\u304B\u3089\u5909\u66F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      if (fromRow) {
        const resolved = resolveRow(current.catalog, item.sessionId);
        if (!resolved.item || identityKey(resolved.item) !== identityKey(item)) throw new Error(resolved.reason || "\u6240\u6709\u8005\u304C\u5909\u308F\u308A\u307E\u3057\u305F\u3002");
      }
      const saved = saveStatus(ctx.storage, rawStorage, item, next);
      update({ entries: saved.entries, storageIssue: "", message: "" });
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
  return { state, refresh, setStatus, ensure: () => {
    if (!loaded) void refresh();
  } };
}

// src/plugin.js
var quiet = { color: "var(--ui-text-secondary)", fontSize: "11px" };
var stop = (event) => event.stopPropagation();
var cancel = (event) => {
  event.stopPropagation();
  event.preventDefault();
};
var isolate = { onClick: stop, onPointerDown: stop, onMouseDown: stop, onDoubleClick: cancel, onAuxClick: cancel, onContextMenu: cancel, onKeyDown: stop, onKeyUp: stop };
var marks = { unclassified: "\u25CB", working: "\u25CF", paused: "\u2161", done: "\u2713" };
var RowTrigger = forwardRef(function RowTrigger2({ type, disabled, ...props }, ref) {
  return jsx("span", { ...props, ref, "aria-disabled": disabled, "data-work-status": true });
});
function StatusMenu({ controller, item, reason = "", fromRow = false }) {
  const triggerRef = useRef(null);
  const data = useValue(controller.state);
  const state = item ? data.entries[identityKey(item)] ?? "unclassified" : null;
  const blocked = reason || data.storageIssue || (data.loading ? "\u4E00\u89A7\u3092\u66F4\u65B0\u4E2D\u3067\u3059\u3002" : "");
  const text = state ? `${marks[state]} ${STATES[state]}` : "\u72B6\u614B\u672A\u78BA\u8A8D";
  return jsx("span", {
    ...isolate,
    title: blocked || "\u624B\u52D5\u306E\u4F5C\u696D\u72B6\u614B\u3092\u5909\u66F4",
    style: { display: "inline-flex", flexShrink: 0 },
    children: jsxs(DropdownMenu, { onOpenChange: (open) => {
      if (open) void controller.refresh();
    }, children: [
      jsx(DropdownMenuTrigger, { asChild: true, disabled: Boolean(blocked), children: jsx(fromRow ? RowTrigger : Button, {
        ref: triggerRef,
        type: "button",
        ...fromRow ? {} : { size: "xs", variant: "chip" },
        disabled: Boolean(blocked),
        title: blocked || "\u624B\u52D5\u306E\u4F5C\u696D\u72B6\u614B\u3092\u5909\u66F4\uFF08\u4F1A\u8A71\u306E\u7A3C\u50CD\u72B6\u614B\u3068\u306F\u5225\uFF09",
        ...fromRow ? {} : { "aria-label": `\u4F5C\u696D\u72B6\u614B: ${text}${blocked ? ` (${blocked})` : ""}` },
        style: { fontSize: "10px", padding: "1px 4px", cursor: blocked ? "default" : "pointer", color: state === "working" ? "var(--ui-accent)" : "var(--ui-text-secondary)" },
        children: text
      }) }),
      jsxs(DropdownMenuContent, { ...isolate, align: "end", onCloseAutoFocus: fromRow ? (event) => {
        event.preventDefault();
        triggerRef.current?.closest("button")?.focus();
      } : void 0, style: { minWidth: "180px" }, children: [
        jsx("div", { style: { ...quiet, padding: "4px 8px" }, children: "\u81EA\u5206\u306E\u4F5C\u696D\u72B6\u614B\uFF08\u624B\u52D5\uFF09" }),
        ...Object.entries(STATES).map(([value, label]) => jsx(DropdownMenuItem, {
          disabled: Boolean(blocked),
          onSelect: () => {
            if (item) controller.setStatus(item, value, fromRow);
          },
          children: `${marks[value]} ${label}${state === value ? "\uFF08\u73FE\u5728\uFF09" : ""}`
        }, value))
      ] })
    ] })
  });
}
function RowBadge({ controller, sessionId }) {
  const data = useValue(controller.state);
  useEffect(() => controller.ensure(), [controller]);
  const resolved = resolveRow(data.catalog, sessionId);
  return jsx(StatusMenu, { controller, ...resolved, fromRow: true });
}
function WorkPane({ controller }) {
  const data = useValue(controller.state);
  const [filter, setFilter] = useState("working");
  const [owner, setOwner] = useState("all");
  useEffect(() => controller.ensure(), [controller]);
  const ownerOf = (item) => JSON.stringify([item.route.connectionId, item.route.targetProfile]);
  const owners = [...new Map(data.catalog.items.map((item) => [ownerOf(item), `${item.route.connectionId} / ${item.route.targetProfile}`])).entries()];
  const scoped = data.catalog.items.filter((item) => owner === "all" || ownerOf(item) === owner);
  const items = filterItems(scoped, data.entries, filter);
  return jsxs("section", {
    "aria-label": "\u4F5C\u696D\u30BB\u30C3\u30B7\u30E7\u30F3",
    style: { height: "100%", minWidth: 0, display: "flex", flexDirection: "column", gap: "8px", padding: "12px", color: "var(--ui-text-primary)", fontSize: "12px", boxSizing: "border-box" },
    children: [
      jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }, children: [
        jsx("strong", { children: "\u4F5C\u696D\u30BB\u30C3\u30B7\u30E7\u30F3" }),
        jsx(Button, { size: "xs", variant: "outline", type: "button", disabled: data.loading, onClick: () => void controller.refresh(), children: data.loading ? "\u66F4\u65B0\u4E2D\u2026" : "\u4E00\u89A7\u3092\u66F4\u65B0" })
      ] }),
      jsx("div", { style: quiet, children: "\u624B\u52D5\u306E\u76EE\u5370\u3067\u3059\u3002\u5B8C\u4E86\u306B\u3057\u3066\u3082\u4F1A\u8A71\u306F\u505C\u6B62\u30FB\u524A\u9664\u30FB\u30A2\u30FC\u30AB\u30A4\u30D6\u3057\u307E\u305B\u3093\u3002" }),
      jsx("div", {
        role: "group",
        "aria-label": "\u72B6\u614B\u3067\u7D5E\u308A\u8FBC\u307F",
        style: { display: "flex", flexWrap: "wrap", gap: "4px" },
        children: Object.entries({ all: "\u3059\u3079\u3066", ...STATES }).map(([value, label]) => jsx(Button, {
          type: "button",
          size: "xs",
          variant: filter === value ? "secondary" : "ghost",
          "aria-pressed": filter === value,
          onClick: () => setFilter(value),
          children: `${label} ${filterItems(scoped, data.entries, value).length}`
        }, value))
      }),
      jsx("label", { style: quiet, children: jsxs("span", { children: ["\u6240\u6709\u8005 ", jsx("select", {
        "aria-label": "\u6240\u6709\u8005",
        value: owner,
        onChange: (event) => setOwner(event.target.value),
        style: { width: "100%", maxWidth: "100%", background: "var(--ui-bg-secondary)", color: "var(--ui-text-primary)", border: "1px solid var(--ui-stroke-secondary)", padding: "4px" },
        children: [jsx("option", { value: "all", children: "\u3059\u3079\u3066\u306E\u53D6\u5F97\u6E08\u307F\u6240\u6709\u8005" }, "all"), ...owners.map(([value, label]) => jsx("option", { value, children: label }, value))]
      })] }) }),
      ...[data.storageIssue, data.message, ...data.catalog.issues].filter(Boolean).map((message, index) => jsx("div", { role: "alert", style: { ...quiet, overflowWrap: "anywhere" }, children: message }, `issue-${index}`)),
      jsx("div", { style: quiet, children: `\u53D6\u5F97\u6E08\u307F ${data.catalog.items.length}\u4EF6 / \u8868\u793A ${items.length}\u4EF6\u3002\u5404\u6240\u6709\u8005\u306E\u6700\u65B0\u4F5C\u6210500\u4EF6\uFF0Bbackend\u306Epin\u8FFD\u52A0\u5206\u30FB\u30A2\u30FC\u30AB\u30A4\u30D6\u5BFE\u8C61\u5916\u3002` }),
      jsx("div", { style: { flex: 1, overflowY: "auto", minHeight: 0 }, children: items.length ? items.map((item) => jsxs("article", {
        style: { display: "flex", flexDirection: "column", gap: "4px", padding: "8px 0", borderBottom: "1px solid var(--ui-stroke-secondary)" },
        children: [
          jsx("div", { title: item.title, style: { overflowWrap: "anywhere", fontWeight: 500 }, children: item.title }),
          jsx("div", { style: { ...quiet, overflowWrap: "anywhere" }, children: `${item.route.connectionId} / ${item.route.targetProfile}` }),
          jsx("div", { title: item.sessionId, style: { ...quiet, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }, children: item.sessionId }),
          jsx("div", { children: jsx(StatusMenu, { controller, item }) })
        ]
      }, identityKey(item))) : jsx("p", { style: quiet, children: data.loading ? "\u4E00\u89A7\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026" : "\u3053\u306E\u6761\u4EF6\u306E\u30BB\u30C3\u30B7\u30E7\u30F3\u306F\u3042\u308A\u307E\u305B\u3093\u3002" }) })
    ]
  });
}
var plugin_default = {
  id: PLUGIN_ID,
  name: "Session Work Status",
  description: "\u30BB\u30C3\u30B7\u30E7\u30F3\u306E\u624B\u52D5\u4F5C\u696D\u72B6\u614B\u3092\u30ED\u30FC\u30AB\u30EB\u7BA1\u7406\u3002\u4F1A\u8A71\u306E\u7A3C\u50CD\u30FB\u30A2\u30FC\u30AB\u30A4\u30D6\u3068\u306F\u72EC\u7ACB\u3002",
  register(ctx) {
    const controller = createController(ctx, host, atom, { getItem: (key) => window.localStorage.getItem(key) });
    ctx.register({ id: "row-status", area: SESSION_ROW_AREAS.trailing, order: 50, data: { render: (props) => jsx(RowBadge, { controller, ...props }) } });
    ctx.register({ id: "work-sessions", area: PANES_AREA, title: "\u4F5C\u696D\u30BB\u30C3\u30B7\u30E7\u30F3", data: { placement: "left", width: "300px" }, render: () => jsx(WorkPane, { controller }) });
  }
};
export {
  plugin_default as default
};
