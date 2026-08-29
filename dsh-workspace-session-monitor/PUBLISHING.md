# 上架到插件市场 — 分步清单（大仓 monorepo 版）

把 `dsh-workspace-session-monitor` 作为 `kevenliu3/dhs-plugins` 大仓的一个**子包**发布到 DSH 插件市场（`dshmarket`）。
市场目录是 curated registry **`awesome-dsh-plugin/awesome-dsh-plugin`**：上架 = 代码上大仓 +（推荐）发 npm 包 + 向 registry 提 PR。

> ⚠️ 上架有**硬门槛**（registry CI 自动检查）：仓库**创建满 1 天**且**提交数 ≥ 10**，并需加 `dsh-plugin` topic。
> `kevenliu3/dhs-plugins` 于 2026-08-28 创建，因此**最早 2026-08-29 才能过 CI**；需先攒够 10 个提交。

## 目标

- 大仓（public）：`https://github.com/kevenliu3/dhs-plugins`（已存在，0 提交）
- 子包路径：`dsh-workspace-session-monitor/`
- npm 包（scoped）：`@kevenliu3/dsh-workspace-session-monitor`

## 1. 把插件放进大仓并推送

大仓只放插件子目录，**不要**把本地 `02 dsh-plugins/` 的其他插件（含认证文件）带进来。

```sh
# 在干净的临时目录搭 monorepo 骨架
mkdir -p /tmp/dhs-plugins && cd /tmp/dhs-plugins
cp -r "dsh-workspace-session-monitor" .
cat > .gitignore <<'EOF'
node_modules/
*.log
EOF
cat > README.md <<'EOF'
# dhs-plugins

kevenliu3 的 DSH 插件集合（monorepo）。每个子目录是一个可独立安装的插件。
EOF

git init
git add .
git commit -m "chore: add dsh-workspace-session-monitor"
git branch -M main
git remote add origin git@github.com:kevenliu3/dhs-plugins.git
git push -u origin main
```

> 门槛：CI 要求 ≥10 次提交 + 满 1 天。首次 push 后继续迭代提交（改 README、加截图、打 tag 等），攒够 10 提交并等满 1 天再提 PR。

## 2. 改 scoped 包名（发布前）

```sh
cd "dsh-workspace-session-monitor"
npm pkg set name=@kevenliu3/dsh-workspace-session-monitor
```

> 改 name 后，本地 web profile 里以裸名 `dsh-workspace-session-monitor` 安装的 link 会失配。
> 若本地还在用，同步改 `~/.dsh/profiles/web/package.json` 的依赖名为 `@kevenliu3/dsh-workspace-session-monitor`，
> 再 `dsh plugin --profile web install` 并重启 `dsh web`。

## 3. 发布 npm 包

```sh
npm adduser          # 首次：登录 npm（scope kevenliu3）
npm publish --access public
```

## 4. 加 topic

在 `kevenliu3/dhs-plugins` 仓库 Settings 里加 topic：`dsh-plugin`。

## 5. 向 registry 提 PR

本目录的 `kevenliu3__dhs-plugins--dsh-workspace-session-monitor.yml` 已按 monorepo 子包格式写好。提交流程：

```sh
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone
cd awesome-dsh-plugin
cp "dsh-workspace-session-monitor/kevenliu3__dhs-plugins--dsh-workspace-session-monitor.yml" \
   "data/plugins/kevenliu3__dhs-plugins--dsh-workspace-session-monitor.yml"
npm ci
node scripts/generate-readme.mjs    # 重新生成两份 README
git checkout -b add/dsh-workspace-session-monitor
git add data/plugins README.md README.zh.md
git commit -m "Add dsh-workspace-session-monitor"
git push -u origin add/dsh-workspace-session-monitor
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin --title "Add dsh-workspace-session-monitor"
```

合并后网站/市场约 1 天内自动收录。

## 关键文件

| 文件 | 用途 |
| --- | --- |
| `kevenliu3__dhs-plugins--dsh-workspace-session-monitor.yml` | registry 条目（PR 时放到 `data/plugins/` 下同名文件） |
| `package.json` | `repository.directory` 指向大仓子目录；`dsh.bundle.patch` 满足 installable 要求 |
| `upstream-seam.patch` | 可选的行内高亮 seam（不阻塞上架，B 方案不依赖它） |

## 阻塞清单（需你凭据）

- [ ] 攒够 10 提交 + 等满 1 天（2026-08-29 起）+ 加 `dsh-plugin` topic
- [ ] `npm adduser`（发布 npm 包）
- [ ] `gh auth login`（提 registry PR）
