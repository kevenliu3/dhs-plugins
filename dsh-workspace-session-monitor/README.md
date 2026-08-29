# dsh-workspace-session-monitor

工作区会话监控插件：把「会话已完成 / 运行中 / 等待处理」聚合起来，避免在多个工作区、多个会话之间切换时漏掉某个跑完的会话。

它提供**两条落地路径**，可单独或组合使用：

- **B — 纯插件（当前 npm 安装下立即可用）**：在侧边栏底部「设置」旁常驻一个徽标，汇总所有工作区的会话状态；点击弹出浮层清单，按工作区分组列出待处理/运行中/已完成的会话，点一下直达。
- **A — 核心 seam（行内高亮工作区文件夹）**：一个对 `@deepseek-ai/dsh-client-ui-workspace` 的纯加法补丁，让插件能把徽标直接渲染在**工作区文件夹行上**（折叠时也可见）。需提 PR 到上游 / 或本地 `patch-package` 后才会在你的 npm 实例生效。

## B — 纯插件（现在就能用）

无需改任何核心。安装后重启 `dsh web` 即生效。

**行为**

- 侧边栏底部出现徽标：`●N 待处理 · ●M 运行中 · ●K 已完成`（数字 = 会话数，颜色沿用现有语义：琥珀=等待、蓝=运行、绿=完成）。
- 侧边栏折叠成 56px 轨道时，徽标退化为单个状态点（优先级 待处理 > 运行中 > 完成）。
- 点击徽标弹出浮层清单：按工作区（含「未分组」）分组，列出对应会话标题，点击任一会话即 `open` 并关闭面板；点击空白处 / × 关闭。
- 会话状态实时变化；打开某会话后其 `completed` 被宿主清掉，徽标与清单自动减一。

**实现**：两个加法式 slot 注册，零核心依赖 —— `sidebar.footer.action`（徽标）+ `shell.overlay`（浮层）。只读框架注入的 `useSessions` / `useWorkspaces` 钩子，零宿主 RPC；唯一的行为是 `ctx.sessions.open(id)`。

### 安装

```sh
cd "dsh-workspace-session-monitor"
dsh plugin --profile web add link:"$PWD"
# 或手动编辑 ~/.dsh/profiles/web/package.json，然后：
dsh plugin --profile web install
```

重启 `dsh web`。

## A — 核心 seam（行内高亮文件夹）

补丁文件：`./upstream-seam.patch`（对 `deepseek-harness` monorepo 的 `packages/client/ui-workspace` 4 个文件、26 行加法改动）。

### 补丁内容

1. `src/client/contract/slots.ts`：声明加法式 slot `sidebar.workspaces.folderStatus`（`kind: 'list'`、`scope: 'root'`）及 owner 类型 `FolderStatusOwnerProps`；`WorkspaceBrowserProps` 的 `renderSlot` 类型扩为联合。
2. `src/client/index.ts`：在 `WorkspaceBrowser` 的 `children` 里声明该 slot。
3. `src/client/rows/Rows.tsx`：`ProjectRowItem` 新增 `renderFolderStatus` prop，并在标题与操作按钮之间渲染。
4. `src/client/WorkspaceBrowser.tsx`：把 `renderSlot('sidebar.workspaces.folderStatus', …)` 传给 `ProjectRowItem`。

### 使用方式

**方式一：提 PR 到上游**（推荐，长期）

```sh
cd /path/to/deepseek-harness
git apply "dsh-workspace-session-monitor/upstream-seam.patch"
# review → 提交 → 提 PR
```

**方式二：本地 `patch-package`**（当前 npm 实例立刻见效，但每次升级需重打）

```sh
# 在已安装的 dsh 包上应用等价改动后：
cd /path/to/node_modules/@deepseek-ai/dsh
npx patch-package @deepseek-ai/dsh-client-ui-workspace
```

> 注意：A 依赖核心重建前端产物。改的是 monorepo 源码，需要 `pnpm run build` 并把新 `lib/client.js` 落到 profile 的 node_modules，GUI 才会加载到；`dsh-version-updater` 升级 dsh 也会覆盖手改的 bundle。

### 配合的插件形态

A 生效后，把插件从「footer 徽标」切换为「文件夹行徽标」：注册进 `sidebar.workspaces.folderStatus` 的版本见 `DESIGN.md` §5-6（`lib/client.js` 顶部 `FOOTER_SLOT`/`OVERLAY_SLOT` 换成 `sidebar.workspaces.folderStatus` 即可，聚合函数 `aggregate` 完全复用）。

## 文件

| 文件 | 说明 |
| --- | --- |
| `lib/index.js` | 宿主半：纯 UI 空 `apply` |
| `lib/client.js` | 浏览器半：B 方案（footer 徽标 + overlay 清单） |
| `upstream-seam.patch` | A 方案：核心 seam 的 git diff（可直接 `git apply`） |
| `DESIGN.md` | 完整设计（模型事实、聚合算法、边界情况） |
| `cordis.patch.yml` / `package.json` | bundle 清单 |
