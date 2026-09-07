window.__ModuleLoader__.load({
  id: "dsh-session-monitor",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

    /**
     * dsh-session-monitor — browser half (npm-friendly, zero-core).
     *
     * Two additive registrations, no @deepseek-ai/dsh-client-ui-workspace
     * changes required:
     *   1. `sidebar.footer.action`  — a badge beside Settings that aggregates
     *      per-workspace session state (pending / running / done) across the
     *      whole session list and shows the totals.
     *   2. `shell.overlay`          — a floating panel, toggled by the badge,
     *      listing each workspace with its pending/running/done session rows;
     *      clicking a row opens that session.
     *
     * State is read reactively through the renderer-injected `useSessions` /
     * `useWorkspaces` hooks (root scope), so there is zero host RPC and no
     * dependency on the workspace browser's internals. Only `ctx.sessions.open`
     * is used, to jump to a clicked session.
     */

    var FOOTER_SLOT = "sidebar.footer.action";
    var OVERLAY_SLOT = "shell.overlay";

    var inject = ["slots", "sessions"];

    var CSS = [
      // Footer badge
      ".dsh-wsm-badge{display:inline-flex;align-items:center;gap:5px;margin-left:10px;white-space:nowrap;border:0;background:transparent;padding:3px 6px;border-radius:6px;cursor:pointer;font-family:inherit}",
      ".dsh-wsm-badge:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".dsh-wsm-chevron{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:1}",
      ".dsh-wsm-item{display:inline-flex;align-items:center;gap:3px}",
      ".dsh-wsm-dot{width:7px;height:7px;border-radius:50%;flex:none}",
      ".dsh-wsm-count{font-size:11px;line-height:1;font-weight:600;color:var(--dsw-alias-label-secondary)}",
      ".dsh-wsm-dot.pending{background:var(--dsw-alias-state-warn-primary)}",
      ".dsh-wsm-dot.running{background:var(--dsw-alias-state-business-primary)}",
      ".dsh-wsm-dot.done{background:var(--dsw-alias-state-success-primary)}",
      ".dsh-wsm-count.pending{color:var(--dsw-alias-state-warn-label)}",
      ".dsh-wsm-count.running{color:var(--dsw-alias-state-business-primary)}",
      ".dsh-wsm-count.done{color:var(--dsw-alias-state-success-primary)}",
      // Overlay mask + panel (opt back into pointer events: shell.overlay's
      // layer is click-through by default)
      ".dsh-wsm-mask{position:fixed;inset:0;z-index:1090;background:transparent;pointer-events:auto}",
      ".dsh-wsm-panel{position:fixed;left:10px;bottom:52px;z-index:1100;width:320px;max-height:min(60vh,520px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:var(--dsw-shadow-lv2);overflow:hidden;color:var(--dsw-alias-label-primary);font-family:inherit;pointer-events:auto}",
      ".dsh-wsm-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px;font-weight:600}",
      ".dsh-wsm-close{border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:14px;line-height:1;padding:2px 4px;border-radius:4px}",
      ".dsh-wsm-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".dsh-wsm-body{overflow-y:auto;padding:6px}",
      ".dsh-wsm-group{margin:2px 0}",
      ".dsh-wsm-group-title{display:flex;align-items:center;gap:6px;padding:5px 8px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}",
      ".dsh-wsm-row{display:flex;align-items:center;gap:6px;width:100%;border:0;background:transparent;padding:6px 8px 6px 22px;border-radius:6px;cursor:pointer;text-align:left;color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;font-family:inherit}",
      ".dsh-wsm-row:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".dsh-wsm-row-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
      ".dsh-wsm-empty{padding:12px;font-size:12px;color:var(--dsw-alias-label-tertiary)}",
    ].join("\n");

    /**
     * Whether a pending-interaction kind is one this surface surfaces. In
     * 0.1.2 the pending interaction was moved out of `SessionSummary` into a
     * dedicated `SessionPendingInteractionSnapshot` map; the map value carries
     * a `kind` discriminator, and only the user-blocking kinds count as
     * "waiting" for the badge. Mirror the workspace browser's filter.
     */
    function visiblePendingKind(kind) {
      switch (kind) {
        case "approval":
        case "plan-review":
        case "question":
          return kind;
        default:
          return;
      }
    }

    /**
     * Aggregate session state per workspace. Returns an ordered list of
     * groups: one per real workspace (Host order) plus the ungrouped bucket
     * last. Each group carries the summaries of its pending/running/done
     * sessions. Subagent-origin, archived, and blank sessions are skipped.
     * @param pendingInteractions - 0.1.2 map of pending UI interactions by
     *   Session id (from the `useSessionPendingInteraction` root hook).
     */
    function aggregate(byId, workspaces, archived, pendingInteractions) {
      var archivedSet = archived && archived.length ? new Set(archived) : null;
      var accounted = {};
      var groups = [];

      function classify(group, session) {
        if (!session) return;
        if (archivedSet && archivedSet.has(session.id)) return;
        if (session.origin === "subagent") return;
        if (session.blank) return;
        var pendingKind = pendingInteractions && pendingInteractions.get
          ? visiblePendingKind(pendingInteractions.get(session.id)?.kind)
          : undefined;
        if (pendingKind) group.pending.push(session);
        else if (session.running) group.running.push(session);
        else if (session.completed) group.done.push(session);
      }

      for (var i = 0; i < workspaces.length; i++) {
        var ws = workspaces[i];
        var group = { id: ws.workspaceId, title: ws.title, pending: [], running: [], done: [] };
        for (var j = 0; j < ws.sessionIds.length; j++) {
          var sid = ws.sessionIds[j];
          accounted[sid] = true;
          classify(group, byId[sid]);
        }
        groups.push(group);
      }

      var ungrouped = { id: null, title: "\u672a\u5206\u7ec4", pending: [], running: [], done: [] };
      for (var id in byId) {
        if (accounted[id]) continue;
        classify(ungrouped, byId[id]);
      }
      groups.push(ungrouped);

      return groups;
    }

    function totalsOf(groups) {
      var t = { pending: 0, running: 0, done: 0 };
      for (var i = 0; i < groups.length; i++) {
        t.pending += groups[i].pending.length;
        t.running += groups[i].running.length;
        t.done += groups[i].done.length;
      }
      return t;
    }

    function apply(ctx) {
      var slots = ctx.slots;

      var styleTag = document.createElement("style");
      styleTag.textContent = CSS;
      document.head.appendChild(styleTag);

      // Shared open state between the footer badge and the overlay panel.
      var open = false;
      var openSubs = [];
      function subscribeOpen(fn) {
        openSubs.push(fn);
        return function () { openSubs = openSubs.filter(function (x) { return x !== fn; }); };
      }
      function setOpen(v) {
        if (open === v) return;
        open = v;
        for (var i = 0; i < openSubs.length; i++) openSubs[i](open);
      }
      function useOpen() {
        var st = React.useState(open);
        var value = st[0];
        var setLocal = st[1];
        React.useEffect(function () { return subscribeOpen(setLocal); }, []);
        return [value, setOpen];
      }

      function Badge(props) {
        var useSessions = props.useSessions;
        var useWorkspaces = props.useWorkspaces;
        var useSessionPendingInteraction = props.useSessionPendingInteraction;
        var wide = props.wide;

        var openPair = useOpen();
        var isOpen = openPair[0];
        var toggle = openPair[1];

        var byId = useSessions(function (s) { return s.byId; });
        var items = useWorkspaces(function (s) { return s.items; });
        var archived = useWorkspaces(function (s) { return s.archivedSessionIds; });
        var pendingInter = useSessionPendingInteraction
          ? useSessionPendingInteraction(function (s) { return s; })
          : null;

        var groups = React.useMemo(
          function () { return aggregate(byId, items, archived, pendingInter); },
          [byId, items, archived, pendingInter]
        );
        var totals = totalsOf(groups);
        var total = totals.pending + totals.running + totals.done;
        if (total === 0) return null;

        function item(state, count) {
          if (count <= 0) return null;
          return React.createElement(
            "span", { key: state, className: "dsh-wsm-item" },
            React.createElement("span", { className: "dsh-wsm-dot " + state }),
            wide ? React.createElement("span", { className: "dsh-wsm-count " + state }, String(count)) : null
          );
        }

        // Collapsed rail: a single dot signalling the highest-priority state.
        var railState = totals.pending > 0 ? "pending" : (totals.running > 0 ? "running" : "done");

        return React.createElement(
          "button",
          {
            type: "button",
            className: "dsh-wsm-badge",
            title: "\u70b9\u51fb\u67e5\u770b\u8be6\u60c5 \u00b7 " + totals.pending + " \u5f85\u5904\u7406 \u00b7 " + totals.running + " \u8fd0\u884c\u4e2d \u00b7 " + totals.done + " \u5df2\u5b8c\u6210",
            "aria-label": "workspace session monitor",
            "aria-expanded": isOpen,
            onClick: function () { toggle(!isOpen); },
          },
          wide
            ? [item("pending", totals.pending), item("running", totals.running), item("done", totals.done),
               React.createElement("span", { key: "chevron", className: "dsh-wsm-chevron" }, "\u25be")]
            : React.createElement("span", { className: "dsh-wsm-item" },
                React.createElement("span", { className: "dsh-wsm-dot " + railState })
              )
        );
      }

      // One clickable session row. Each call binds its own `s`, so the onClick
      // closure opens exactly the session it renders (no shared loop var).
      function sessionRowButton(state, s, close) {
        return React.createElement(
          "button",
          {
            key: s.id,
            type: "button",
            className: "dsh-wsm-row",
            onClick: function () { ctx.sessions.open(s.id); close(false); },
          },
          React.createElement("span", { className: "dsh-wsm-dot " + state }),
          React.createElement("span", { className: "dsh-wsm-row-title" }, s.displayTitle)
        );
      }

      function Overlay(props) {
        var useSessions = props.useSessions;
        var useWorkspaces = props.useWorkspaces;
        var useSessionPendingInteraction = props.useSessionPendingInteraction;

        var openPair = useOpen();
        var isOpen = openPair[0];
        var close = openPair[1];

        // All hooks run unconditionally — the early return stays AFTER them so
        // the hook count is stable across open/close (React hooks rule).
        var byId = useSessions(function (s) { return s.byId; });
        var items = useWorkspaces(function (s) { return s.items; });
        var archived = useWorkspaces(function (s) { return s.archivedSessionIds; });
        var pendingInter = useSessionPendingInteraction
          ? useSessionPendingInteraction(function (s) { return s; })
          : null;
        var groups = React.useMemo(
          function () { return aggregate(byId, items, archived, pendingInter); },
          [byId, items, archived, pendingInter]
        );

        if (!isOpen) return null;

        var rows = [];
        for (var i = 0; i < groups.length; i++) {
          var g = groups[i];
          var sessionRows = [];
          g.pending.forEach(function (s) { sessionRows.push(sessionRowButton("pending", s, close)); });
          g.running.forEach(function (s) { sessionRows.push(sessionRowButton("running", s, close)); });
          g.done.forEach(function (s) { sessionRows.push(sessionRowButton("done", s, close)); });

          if (sessionRows.length === 0) continue;

          var count = g.pending.length + g.running.length + g.done.length;
          rows.push(
            React.createElement("div", { key: g.id || "__ungrouped__", className: "dsh-wsm-group" },
              React.createElement("div", { className: "dsh-wsm-group-title" },
                React.createElement("span", null, g.title),
                React.createElement("span", { className: "dsh-wsm-count" }, String(count))
              ),
              sessionRows
            )
          );
        }

        var body = rows.length > 0
          ? rows
          : React.createElement("div", { className: "dsh-wsm-empty" }, "\u6ca1\u6709\u5f85\u5904\u7406/\u8fd0\u884c\u4e2d/\u5df2\u5b8c\u6210\u7684\u4f1a\u8bdd");

        return React.createElement(
          "div", { className: "dsh-wsm-mask", onClick: function () { close(false); } },
          React.createElement(
            "div", { className: "dsh-wsm-panel", onClick: function (e) { e.stopPropagation(); } },
            React.createElement("div", { className: "dsh-wsm-head" },
              React.createElement("span", null, "\u4f1a\u8bdd\u76d1\u63a7"),
              React.createElement("button", { type: "button", className: "dsh-wsm-close", onClick: function () { close(false); } }, "\u00d7")
            ),
            React.createElement("div", { className: "dsh-wsm-body" }, body)
          )
        );
      }

      slots.inject(FOOTER_SLOT, function () {
        return slots.register(
          { name: FOOTER_SLOT, id: "dsh-session-monitor", order: 60, label: "Workspace Session Monitor" },
          function (props) { return React.createElement(Badge, props); }
        );
      });
      slots.inject(OVERLAY_SLOT, function () {
        return slots.register(
          { name: OVERLAY_SLOT, id: "dsh-session-monitor", label: "Workspace Session Monitor" },
          function (props) { return React.createElement(Overlay, props); }
        );
      });

      ctx.effect(function () {
        return function () {
          if (styleTag.parentNode) styleTag.parentNode.removeChild(styleTag);
        };
      }, "dsh-session-monitor: style");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
