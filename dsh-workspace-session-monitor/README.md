# dsh-workspace-session-monitor

工作区会话监控插件：把「会话已完成 / 运行中 / 等待处理」聚合起来，避免在多个工作区、多个会话之间切换时漏掉某个跑完的会话。

它提供**两条落地路径**，可单独或组合使用：

- **B — 纯插件（当前 npm 安装下立即可用）**：在侧边栏底部「设置」旁常驻一个徽标，汇总所有工作区的会话状态；点击弹出浮层清单，按工作区分组列出待处理/运行中/已完成的会话，点一下直达。
- **A — 核心 seam（行内高亮工作区文件夹）**：一个对 `@deepseek-ai/dsh-client-ui-workspace` 的纯加法补丁，让插件能把徽标直接渲染在**工作区文件夹行上**（折叠时也可见）。需提 PR 到上游 / 或本地 `patch-package` 后才会在你的 npm 实例生效。

## 安装

```sh
# npm（推荐）
dsh plugin --profile web add @kevenliu3/dsh-workspace-session-monitor

# 或从源码安装
dsh plugin --profile web add github:kevenliu3/dhs-plugins
```

重启 `dsh web` 后生效。

## 行为（B 方案）

- 侧边栏底部出现徽标：`●N 待处理 · ●M 运行中 · ●K 已完成`（数字 = 会话数，颜色沿用现有语义：琥珀=等待、蓝=运行、绿=完成）。
- 侧边栏折叠成 56px 轨道时，徽标退化为单个状态点（优先级 待处理 > 运行中 > 完成）。
- 点击徽标弹出浮层清单：按工作区（含「未分组」）分组，列出对应会话标题，点击任一会话即 `open` 并关闭面板；点击空白处 / × 关闭。
- 会话状态实时变化；打开某会话后其 `completed` 被宿主清掉，徽标与清单自动减一。

**实现**：两个加法式 slot 注册，零核心依赖 —— `sidebar.footer.action`（徽标）+ `shell.overlay`（浮层）。只读框架注入的 `useSessions` / `useWorkspaces` 钩子，零宿主 RPC；唯一的行为是 `ctx.sessions.open(id)`。

## A 方案（可选的行内高亮）

补丁文件：`./upstream-seam.patch`（对 `deepseek-harness` monorepo 的 `packages/client/ui-workspace` 4 个文件、26 行加法改动）。详见 `DESIGN.md`。

A 生效后，把插件从「footer 徽标」切换为「文件夹行徽标」：注册进 `sidebar.workspaces.folderStatus` 的版本见 `DESIGN.md` §5-6（`lib/client.js` 顶部 `FOOTER_SLOT`/`OVERLAY_SLOT` 换成 `sidebar.workspaces.folderStatus` 即可，聚合函数 `aggregate` 完全复用）。

## 文件

| 文件 | 说明 |
| --- | --- |
| `lib/index.js` | 宿主半：纯 UI 空 `apply` |
| `lib/client.js` | 浏览器半：B 方案（footer 徽标 + overlay 清单） |
| `upstream-seam.patch` | A 方案：核心 seam 的 git diff（可直接 `git apply`） |
| `DESIGN.md` | 完整设计（模型事实、聚合算法、边界情况） |
| `cordis.patch.yml` / `package.json` | bundle 清单 |

## License

[MIT](../../LICENSE)
