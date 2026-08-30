# dsh-workspace-session-monitor — 设计文档

> 目标：监控每个工作区（Workspace）下各会话（Session）的运行/完成状态，当一个会话「已完成」时，在侧边栏把该会话所属的**工作区文件夹行**高亮出来，让用户在跨工作区、跨会话切换时不会漏掉「那个早就跑完、但一直没回来看」的会话。

---

## 1. 背景与问题

DSH 的 Web GUI 侧边栏是一个「工作区 → 会话」两级树（`dsh-client-ui-workspace` 的 `WorkspaceBrowser`）：

- **工作区行**（`ProjectRowItem`）渲染文件夹图标 + 标题，可折叠/展开。
- **会话行**（`SessionNodeItem`）渲染状态点 + 标题 + 时间。

会话行本身已经有三态状态点：

| 状态 | 语义 | 颜色 |
| --- | --- | --- |
| `pendingInteraction` | 等待用户审批/计划审阅/回答 | 琥珀色 `--dsw-alias-state-warn-primary` |
| `running` | 正在运行 | 蓝色 `--dsw-alias-state-business-primary` |
| `completed` | 运行结束、但**尚未被打开查看** | 绿色 `--dsw-alias-state-success-primary` |

**问题**：这些状态点只挂在会话行上。一旦用户把某个工作区分组**折叠**起来（默认只显示 5 条，且折叠后会话行全部隐藏），这些状态点就不可见。用户切换走之后，就「忘记了某个运行中的会话」——它跑完了、`completed` 变绿了，但用户看不到，因为那个工作区文件夹是折叠的、也没有任何聚合提示。

**本插件要做的**：把会话级状态**向上聚合到工作区文件夹行**，让折叠的工作区也能一眼看到「这里有个已完成/仍在跑/等你的会话」。

---

## 2. 现有 DSH 模型（本插件依赖的准确事实）

以下类型/接口来自当前安装的 `@deepseek-ai/dsh-*`（`0.1.1-rc.2`）：

### 2.1 会话摘要 —— `SessionSummary`（`dsh-client-runtime/client`）

```ts
interface SessionSummary {
  id: SessionId;
  title?: string;
  displayTitle: string;
  cwd?: string;
  parentId?: SessionId;
  origin?: 'subagent';            // subagent 子会话，不进分组行
  running: boolean;               // 正在运行
  pendingInteraction?: PendingInteractionStatus; // 等待用户（amber 点）
  completed?: boolean;            // 运行结束且尚未打开（green 点），缺省 = false
  blank: boolean;                 // 空白占位（新建会话占位行）
  updatedAt: number;
}
```

关键点：**`completed` 正是我们要的语义**——「在未被选中时运行结束、且尚未被打开」。用户打开该会话后宿主会清掉这个标志，因此高亮会自然消退，等价于「未读完成提醒」。

### 2.2 会话列表快照 —— `SessionListState`

```ts
interface SessionListState {
  ids: SessionId[];
  byId: Record<SessionId, SessionSummary>;
  current: SessionId | undefined;   // 当前选中会话
  phase: SessionListPhase;
  // ...
}
```

### 2.3 工作区视图 —— `WorkspaceView`（`dsh-host-apiproxy/api/workspace`）

```ts
interface WorkspaceView {
  workspaceId: WorkspaceId;
  path: string;                    // 规范化目录路径（realpath）
  title: string;                   // 显示标题（默认 = basename）
  sessionIds: SessionId[];         // 该工作区记账的会话（有序）
  createdAt: string;
  updatedAt: string;
}
```

`WorkspaceView.sessionIds` 是「工作区 ↔ 会话」的权威映射（`dsh-workspace` 的 `Workspace.attachSession` 记账）。

### 2.4 工作区列表快照 —— `WorkspaceListState`

```ts
interface WorkspaceListState {
  items: readonly WorkspaceView[];
  archivedSessionIds: readonly SessionId[]; // 归档集合（隐藏但保留记账）
  state: 'idle' | 'loading' | 'error';
  phase: WorkspaceListPhase;
  baselinesReady: boolean;
  recentWorkspaceId?: WorkspaceId;
}
```

### 2.5 客户端服务与标准钩子

- `ctx.sessions`（`ISessions`，含 `.list` 快照 store）、`ctx.workspaces`（`IWorkspaces`）、`ctx.slots`（`SlotRegistry`）。
- 任何注册进 **root 作用域 slot** 的组件，会被框架注入两个标准选择器钩子（`dsh-client-ui-renderer` 的 `standardProps`）：
  - `useSessions(selector)` —— 读 `SessionListState`；
  - `useWorkspaces(selector)` —— 读 `WorkspaceListState`。

这两条是本插件读取实时状态的全部来源，**无需任何宿主 RPC**。

---

## 3. 总体架构：两层

### 3.1 一个最小「核心 seam」（对 `dsh-client-ui-workspace` 的加法改动）

工作区文件夹行 `ProjectRowItem` 目前**没有**任何可注入的子 slot，也没有稳定的 `data-*` 属性（类名是 CSS-Module 哈希，跨构建不稳定）。因此要做「行内高亮」，必须先在核心里开一个挂载点。

本设计推荐一个**纯加法、向后兼容**的 seam：

> 在 `dsh-client-ui-workspace` 的 `WorkspaceBrowser` 注册中，多声明一个**子 slot** `sidebar.workspaces.folderStatus`（`kind: 'list'`、`scope: 'root'`），并在 `ProjectRowItem` 里渲染它。

- `kind: 'list'`：允许多个插件各自贡献装饰（加法、可叠加），每个条目都收到「当前工作区」的 owner props。
- `scope: 'root'`：组件能拿到全局 `useSessions` / `useWorkspaces` 钩子。

### 3.2 一个纯客户端插件 `dsh-workspace-session-monitor`

- **宿主半**（`lib/index.js`）：空 `apply`（与 `dsh-client-ui-workspace` 同款——只为让插件出现在宿主 cordis 名单里）。
- **浏览器半**（`lib/client.js`）：注册进 `sidebar.workspaces.folderStatus`，渲染聚合徽标。

插件只读状态、只渲染徽标，不改任何会话/工作区数据，也不向模型请求注入任何内容（纯 UI，零 token 影响）。

---

## 4. 核心 seam 的具体改动（对 `packages/client/ui-workspace`）

> 源码路径参考安装包的 `lib/client.js` 对应结构；落地时改 monorepo 源码后重新构建前端产物。

### 4.1 声明子 slot

在 `WorkspaceBrowser` 的 `ctx.slots.register({ ... })` 调用的 `children` 里，追加：

```ts
children: {
  "sidebar.workspaces.directoryFlow": { kind: "single", scope: "root" }, // 现有
  "sidebar.workspaces.folderStatus": { kind: "list", scope: "root" }       // 新增
}
```

对应 owner props（slot 契约）：

```ts
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar.workspaces.folderStatus': {
      kind: 'list';
      scope: 'root';
      owner: {
        workspaceId: WorkspaceId | undefined; // 未分组桶为 undefined
        cwd: string | undefined;
      };
    };
  }
}
```

### 4.2 把 `renderSlot` 穿进文件夹行

`WorkspaceBrowser` 已通过 `PropsRenderSlots<'sidebar.workspaces.directoryFlow'>` 拿到 `renderSlot`；把类型扩为：

```ts
PropsRenderSlots<'sidebar.workspaces.directoryFlow' | 'sidebar.workspaces.folderStatus'>
```

然后在渲染 `ProjectRowItem` 的地方传入一个回调：

```ts
renderFolderStatus: (owner) => renderSlot("sidebar.workspaces.folderStatus", owner)
```

### 4.3 在文件夹行内渲染

`ProjectRowItem` 增加 `renderFolderStatus` prop，在「文件夹图标/箭头」与「标题」之间（或标题之后、操作按钮之前）渲染：

```tsx
{renderFolderStatus?.({ workspaceId: row.workspaceId, cwd: row.cwd })}
```

推荐放在标题之后、`rowActions` 之前，让徽标紧贴标题、不干扰文件夹图标与折叠箭头。

### 4.4（可选）稳定的 `data-*` 属性

为便于 CSS/调试/降级，可顺带在行根 `div` 上加：

```tsx
"data-workspace-id": row.workspaceId,   // 未分组桶为空
"data-path": row.cwd,
```

这不是插件必需的，但能让「纯 CSS 降级方案」（见 §7）更稳健。

---

## 5. 插件实现

### 5.1 `package.json`（`dsh` 清单）

```jsonc
{
  "name": "dsh-workspace-session-monitor",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-runtime",      // 提供 sessions/workspaces 服务与 useSessions/useWorkspaces 钩子
        "@deepseek-ai/dsh-client-ui-workspace"  // 提供 sidebar.workspaces.folderStatus 声明
      ],
      "platform": "web"
    }
  }
}
```

### 5.2 `cordis.patch.yml`

```yaml
- insert:
    - id: dsh-workspace-session-monitor
      name: 'dsh-workspace-session-monitor'
```

### 5.3 宿主半 `lib/index.js`

纯 UI 插件，宿主无行为：

```js
function apply() {}
export { apply };
```

### 5.4 浏览器半 `lib/client.js`

结构完全对齐团队已有的 `dsh-version-updater`：

```js
window.__ModuleLoader__.load({
  id: "dsh-workspace-session-monitor",
  factory: (require) => {
    var React = require("react");
    var inject = ["slots"];

    function apply(ctx) {
      // 1) 注入 CSS（用 --dsw-alias-state-* 主题 token，自动适配深浅色）
      // 2) ctx.slots.inject("sidebar.workspaces.folderStatus", () =>
      //      ctx.slots.register({ name, id, label }, Badge))
      // 3) ctx.effect(...) 清理 <style>
    }
    exports.apply = apply;
    exports.inject = inject;
  },
});
```

徽标组件从注入的钩子读取状态并聚合（见 §6）。

---

## 6. 聚合算法与视觉

### 6.1 聚合

对某个工作区行（owner 传 `workspaceId` / `cwd`）：

```
counts = { pending: 0, running: 0, done: 0 }

ids = workspaceId != null
        ? workspace.sessionIds                        // 有工作区：用记账
        : 未分组桶：所有「未被任何工作区记账」且 cwd 匹配的会话

for id in ids:
    s = sessions.byId[id]
    跳过：s 不存在 / s 在 archivedSessionIds / s.origin === 'subagent' / s.blank
    if   s.pendingInteraction   -> counts.pending++
    elif s.running              -> counts.running++
    elif s.completed            -> counts.done++
```

优先级与现有会话行完全一致：`pendingInteraction` > `running` > `completed`（一个会话同一时刻只会落入一档）。

### 6.2 视觉（徽标）

紧贴工作区标题渲染一个 `dsh-wsm-badge`，最多三组「点 + 数字」，颜色沿用现有状态 token：

| 档位 | 点色 | 含义 |
| --- | --- | --- |
| `pending` | `--dsw-alias-state-warn-primary`（琥珀） | 有会话在等你 |
| `running` | `--dsw-alias-state-business-primary`（蓝） | 有会话还在跑 |
| `done`   | `--dsw-alias-state-success-primary`（绿） | 有会话已完成、待查看 |

`done > 0` 时再给文件夹图标/标题加一层淡绿 tint（复用 `folderActive` 的思路，但由徽标驱动），作为「高亮工作区文件夹」的直接呈现。三者全为 0 时组件返回 `null`，不占位。

默认把三种状态都聚合（覆盖「忘了运行中」+「已完成待看」两种遗忘场景）；若只想严格按需求「完成才高亮」，去掉 `running`/`pending` 两个点即可（一处开关，见 `lib/client.js` 顶部 `SHOW_RUNNING` / `SHOW_PENDING`）。

### 6.3 自动消退

`completed` 是「未读完成提醒」语义：用户点开该会话，宿主清掉 `completed`，徽标数字随即减一；工作区内所有 `completed` 清零后高亮消失。无需插件维护任何本地已读状态。

---

## 7. 边界情况

- **未分组桶（Ungrouped）**：`workspaceId` 为 `undefined`，用「未被任何 `WorkspaceView.sessionIds` 记账 + `cwd` 匹配」兜底；仍可聚合，但通常为空。
- **subagent 子会话**：`origin === 'subagent'` 不进顶级行，跳过。
- **归档会话**：`archivedSessionIds` 里的跳过（隐藏但保留记账）。
- **空白占位**：`blank` 跳过。
- **当前会话**：`completed` 定义天然排除「已打开」的会话，故不需要额外减去 `current`。
- **`folderStatus` slot 未声明**（核心未打 seam）：`ctx.slots.inject` 会一直等待声明、不执行注册——插件静默不渲染，不报错。此时见 §8 降级。
- **深/浅色主题**：只使用 `--dsw-alias-state-*` / `--dsw-alias-label-*` token，不写死颜色。
- **多工作区同名 basename**：映射基于 `workspaceId`（id 唯一），不用标题匹配，不会串。

---

## 8. 无核心改动时的降级方案

若不想改 `dsh-client-ui-workspace`，纯插件无法可靠地做「行内高亮」（文件夹行没有稳定 selector）。此时可选降级：

1. **汇总徽标**：把聚合结果渲染到一个**已存在**的 slot（如 `sidebar.footer.action`，即 `dsh-version-updater` 所在处），显示「N 个工作区有已完成会话」，点击可定位到对应工作区。
2. **浮层列表**：注册进 `shell.overlay`，在侧边栏附近浮出一个「已完成会话」清单（工作区 → 会话标题），点击 `ctx.sessions.open(id)` 直达。

这两个都不需要改核心，但都不是「高亮文件夹」本身。**要满足原始需求，建议采用 §4 的 seam。**

---

## 9. 构建与安装

```sh
# 1) 在 monorepo 里对 dsh-client-ui-workspace 打 §4 的 seam，重建前端产物
pnpm run build

# 2) 安装插件
cd dsh-workspace-session-monitor
dsh plugin --profile web add link:"$PWD"

# 3) 重启 web
dsh web
```

生效后，只要某个（可能已折叠的）工作区里有会话完成/运行/待处理，侧边栏对应文件夹行就会出现彩色徽标并高亮。

---

## 10. 风险与待办

- **核心 seam 需上游合入或本地 patch**：不改核心则无法做行内高亮（§8 只给降级）。这是本设计唯一对核心的依赖。
- **重建产物**：改 `dsh-client-ui-workspace` 属于「普通包」改动，需重建 Web 前端并在现有 URL 刷新验证；`client-plugin` 的 HMR 只在 `pnpm run dev:web` 运行时可热更（本插件自身的 `lib/client.js` 属于 profile 外插件，走 HMR 通道）。
- **聚合性能**：每行一次 `Object.keys(byId)` 过滤，会话量级下可忽略；后续若会话很多可改为在 `WorkspaceBrowser` 派生阶段算好计数再作为 owner props 下传（把聚合从插件挪回核心，换取更少重复计算）。
