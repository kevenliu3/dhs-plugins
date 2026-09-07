# dhs-plugins

A monorepo of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugins by [kevenliu3](https://github.com/kevenliu3). Each subdirectory is an independently installable plugin.

## Plugins

| Subdirectory | Description |
| --- | --- |
| [`dsh-session-monitor`](./dsh-session-monitor) | Sidebar badge + floating panel that aggregate per-session pending / running / completed states across workspaces, with one click to open a session. |

## Install

```sh
# npm (recommended)
dsh plugin --profile web add dsh-session-monitor

# or install from source
dsh plugin --profile web add github:kevenliu3/dhs-plugins
```

Then restart `dsh web`.

## License

[MIT](./LICENSE)
