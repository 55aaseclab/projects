# Projects

[English](README.md)

按空间管理项目目标、工作项、依赖和来源引用。可查看目标进展和四类工作项；经授权的写操作使用签名业务接口。本机首次打开为空项目目录。

```sh
npm start -- --host 127.0.0.1 --port 4327
```

## Praxis 集成

应用维护的[供数合同](docs/PRAXIS-PROVIDER.md)提供按授权过滤、有来源依据的卡片与数据源描述，不增加 HTTP 元数据入口。使用 `npm run test:provider` 验证隔离供数测试。

## Praxis 登记

应用发行版本：`0.2.0`。本应用维护 [`praxis-app.json`](praxis-app.json)、英中展示文案、`public/praxis-icon.svg` 图标、PRD 路径及需要保留的旧图标别名。`schemaVersion: 1` 表示登记格式，与应用发行版本、数据、协议和文档修订分别管理；已有 package 和 lockfile 的发行版本须与声明一致。

[`apps.example.json`](apps.example.json) 引用 `./praxis-app.json`，使用 `http://127.0.0.1:4327/` 登记本地别名。先按上文启动独立服务；登记不启动后端，也不授予账号、管理员或业务数据权限。安装地址、数据位置与授权策略仍独立配置。


## 版本化计划

0.2.0 提供一个项目主分支、四个团队主分支及按身份持续使用的个人分支。通过 PRD／Roadmap 面板维护类型化变更，比较来源／目标版本，依次提交个人到团队、团队选定贡献到项目的提案，并记录获授权决策。恢复历史产生新草稿及普通提案，既有执行事实保持独立。角色管理需当前业务空间 owner／admin 及项目范围 `manage_planning_roles`；接受另需 `update`、明确委托的 `accept_plan` 和指定目标角色。读取空状态不创建成员、基线或批准。独立未签名 HTTP 保持只读。

`npm test` 使用合成数据验证存储、授权、并发和供数。`npm run test:browser` 需要 Playwright／Chromium，可通过 `PROJECTS_PLAYWRIGHT_MODULE`、`PROJECTS_CHROMIUM_PATH`、可选 `PRAXIS_PUBLIC_DIR` 指定已安装模块、浏览器及共享导航资源。临时签名原生服务和合成网页登录会话不代表生产 Core／OAuth 或外部客户端证据。[业务工具说明](skills/mcp-projects/SKILL.md)

## 应用自有容器构建

`docker build -f Dockerfile.praxis -t praxis-projects:local .` 从本仓构建原生应用。按上文配置持久化 `PROJECTS_DATA_DIR`、受管签名密钥及明确的业务空间映射。Praxis 从 [`praxis-integration.mjs`](praxis-integration.mjs) 加载同一套原生路由、类型化工具、技能、存储与部署配方。[集成合同](praxis/README.md)

原生 `/health` 响应的三段 `version` 与 `package.json`、`praxis-app.json` 一致；文档修订 3 属于独立的需求版本。
