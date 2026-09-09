export const TEMPLATES = {
  // -------------------------------------------------------------
  // 🌟 旗舰全景指南 (交互式实战演练)
  // -------------------------------------------------------------
  "ymind-feature-tour": {
    "id": "ymind-feature-tour",
    "name": "🚀 YMind Pro 功能与实战全景",
    "icon": "🌟",
    "desc": "掌握全景特性：仿生突触连线、待办与截止日胶囊、内部双链与跨文件深链、100%防窥遮罩、3D抽认卡、AES-256保险箱与时光机",
    "category": "project",
    "layout": "mindmap",
    "data": {
      "id": "root",
      "text": "🚀 YMind Pro 全功能实战指南",
      "note": "### 欢迎使用 YMind Pro Studio\n\n这是一份交互式全景实战指南，带你体验 **思维导图、大纲文档、待办进度聚合、跨文件双链、3D记忆抽认卡与加密保险箱** 的极致生产力！\n\n#### 🌟 核心新特性速览：\n- **☑️ 待办与截止日**：按 `Alt+X` 批量转待办，单点打钩，父级智能算进度；右键设置 `📅 截止日期`\n- **🔗 知识网络双链**：点击节点上的 `🔗` 直接跨分支跳转或穿透打开外部文档\n- **🎭 100% 物理防窥遮罩**：按 `Alt+R` 开启遮罩，单击揭晓，再次单击遮盖\n- **🎴 3D 抽认卡工坊**：按 `Alt+F` 立即将当前导图转化为双面翻转卡片复习\n- **📐 仿生神经突触连线**：自然流态变线宽，高密度紧凑排版，同屏视野翻倍\n- **🔒 AES-256 密码保险箱**：按 `Alt+L` 启用安全沙箱，草稿亦受全程加密保护\n- **📸 版本快照时光机**：按 `Ctrl+Shift+H` 随时拍摄里程碑或覆盖还原",
      "children": [
        {
          "id": "tour_1",
          "text": "📐 仿生连线、骨架与高密度排版",
          "icon": "🎨",
          "priority": "P1",
          "progress": "100%",
          "tags": ["视觉体系", "排版美学"],
          "note": "### 视觉与几何排版体系\n遵循 Apple Human Interface Guidelines 工业设计规范：\n\n- **神经突触变线宽**：从根部 5.2px 饱满出发，随贝塞尔曲线延伸平滑递减至 2.2px，告别机械水管折角；\n- **自适应曲线张力**：大纵向落差（如跨度 200px）自动补偿横向延展，弧度行云流水；\n- **智能避让折叠按钮**：连线起点自动外延至减号按钮外侧 7.2px，杜绝穿模破绽；\n- **黄金紧凑排版**：`hGap: 36px, vGap: 8px`，纵向空间节省 40%，同屏容纳节点数直接翻倍。",
          "children": [
            {
              "id": "tour_1_1",
              "text": "🌳 4 款经典思维骨架",
              "children": [
                { "id": "tour_1_1_1", "text": "经典双向导图：左右动态平衡，激发发散联想", "children": [] },
                { "id": "tour_1_1_2", "text": "向右逻辑推导：严谨因果链条，适合 PRD 与技术方案", "children": [] },
                { "id": "tour_1_1_3", "text": "向左逆向归因：根因排查与故障复盘回溯", "children": [] },
                { "id": "tour_1_1_4", "text": "组织架构图：自上而下纵向层级流动", "children": [] }
              ]
            },
            {
              "id": "tour_1_2",
              "text": "🎨 22 款大师配色方案",
              "children": [
                { "id": "tour_1_2_1", "text": "经典与自然：Apple经典 / 温暖手绘 / 包豪斯极简 / 京都抹茶木 / 极地冷杉", "children": [] },
                { "id": "tour_1_2_2", "text": "雅致与深邃：莫兰迪雅致 / 斯堪的纳 / 焦糖拿铁 / 落日晚霞 / 赛博霓虹 / 极光暮色", "children": [] },
                { "id": "tour_1_2_3", "text": "📐 架构师单色系：极简石墨单色 (Graphite) / 建筑蓝图深浅阶 (Blueprint)", "tags": ["高冷单色"], "children": [] }
              ]
            },
            {
              "id": "tour_1_3",
              "text": "🖼 15 款精研画布底色与 15 款工程底纹",
              "children": [
                { "id": "tour_1_3_1", "text": "雪域纯白 / 暖心象牙 / 复古羊皮 / 深空钛灰 / 极夜黑曜等 15 款色阶", "children": [] },
                { "id": "tour_1_3_2", "text": "点阵 / 方格 / 等距 / 准星 / 横线 / 蓝图 / 谱线 / 毫米坐标网格等 15 款纹理", "children": [] }
              ]
            }
          ]
        },
        {
          "id": "tour_2",
          "text": "☑️ 敏捷执行：待办事项与截止日胶囊",
          "icon": "⚡",
          "priority": "P1",
          "progress": "50%",
          "tags": ["执行落地", "GTD"],
          "note": "### 待办与执行落地系统\n彻底终结思维导图纸上谈兵：\n\n- **画布一键打钩**：鼠标直接单点复选框即可切换完成状态；\n- **文字划线联动**：任务完成自动施加删除线并变淡，反馈即时明确；\n- **父级智能聚合 (Roll-up)**：子项完成度从 0% ~ 100% 实时汇总，子项清空自动撤销进度环；\n- **动态时间胶囊**：四阶自适应变色（警示红、紧急橙、青蓝、灰度），无闹钟静音守护。",
          "children": [
            {
              "id": "tour_2_1",
              "text": "单击复选框直接打钩与取消",
              "todo": true,
              "done": false,
              "dueDate": "今天",
              "note": "直接用鼠标单点前面的方框试试！",
              "children": []
            },
            {
              "id": "tour_2_2",
              "text": "已达成任务自动变淡并划删除线",
              "todo": true,
              "done": true,
              "dueDate": "09-01",
              "note": "任务完成后，文字自动添加删除线，截止日胶囊自动转为微灰已完成态。",
              "children": []
            },
            {
              "id": "tour_2_3",
              "text": "框选多节点按 Alt+X 批量转待办",
              "todo": true,
              "done": false,
              "dueDate": "明天",
              "note": "支持按住 Shift 框选多个分支，按 Alt+X 一键批量转换为待办事项，单步 Cmd+Z 完美撤销。",
              "children": []
            },
            {
              "id": "tour_2_4",
              "text": "逾期任务自动变淡红警示",
              "todo": true,
              "done": false,
              "dueDate": "2026-08-20",
              "note": "右键点击节点选择「设置截止日期」，输入过去时间即可看到警示红变色。",
              "children": []
            },
            {
              "id": "tour_2_5",
              "text": "远期常规规划灰蓝胶囊",
              "todo": true,
              "done": false,
              "dueDate": "下周五",
              "children": []
            },
            {
              "id": "tour_2_6",
              "text": "⏱️ 多色阶进度环与 0% 启航微靶心",
              "progress": "0%",
              "note": "即使完成度是 0%，环状轨道依然优雅呈现微靶心指示点，表明已立项待动工！\n完成度逐步提升时，色彩呈现 25%蓝 ➔ 50%橙 ➔ 75%紫 ➔ 100%绿核动态跃迁。",
              "children": []
            }
          ]
        },
        {
          "id": "tour_3",
          "text": "🔗 知识网络：内部双链与跨文件深链",
          "icon": "🌐",
          "priority": "P1",
          "progress": "100%",
          "tags": ["双链互联", "知识网"],
          "note": "### 知识互联体系\n突破单向树形结构的限制：\n\n- **同图节点双链**：点击 🔗 自动展开折叠祖先，镜头平滑飞跃直达目标；\n- **跨思维导图穿透**：点击链接直接自动切标签页或异步读取外部磁盘文件载入；\n- **外部参考资料直通**：直接打开本地 PDF、Word 或外部网页；\n- **复制深度链接**：右键一键生成 `ymind://` 标准链接，无缝粘贴入 Obsidian、Notion 或 Markdown 备注中。",
          "children": [
            {
              "id": "tour_3_1",
              "text": "点击右侧 🔗 图标直跳待办分支",
              "link": "#tour_2",
              "note": "单点此节点上的 🔗 链接图标，体验自动跨分支定位与弹性镜头飞跃！",
              "children": []
            },
            {
              "id": "tour_3_2",
              "text": "访问 GitHub 官方代码仓库",
              "link": "https://github.com/lfw/ymind-tauri",
              "note": "点击 🔗 将调起系统默认浏览器访问外部网址。",
              "children": []
            },
            {
              "id": "tour_3_3",
              "text": "跨文件跳转示例 (自适应相对路径)",
              "link": "ymind://file?path=project-sprint.ymind&node=sp_1",
              "note": "支持指向电脑磁盘上的其他导图或文档，未打开时自动新建标签页读取挂载。",
              "children": []
            },
            {
              "id": "tour_3_4",
              "text": "右键复制专属深度链接",
              "note": "右键选择「📋 复制节点深度链接」，可在任何外部笔记软件中一键唤醒并直达该节点。",
              "children": []
            }
          ]
        },
        {
          "id": "tour_4",
          "text": "🧠 深度认知与主动复盘引擎",
          "icon": "🎴",
          "priority": "P1",
          "progress": "100%",
          "tags": ["主动回忆", "Anki级别"],
          "note": "### 认知科学双引擎\n结合艾宾浩斯遗忘曲线与主动回忆（Active Recall）神经突触理论：\n\n1. **100% 物理防窥记忆遮罩 (Alt+R)**：彻底阻断文字透视，点击常驻揭晓，再次点击遮盖；\n2. **3D 记忆抽认卡工坊 (Alt+F)**：将树状层级瞬间拆解为双面立体翻转卡片；\n3. **大纲模式 (Alt+2)**：线性化 Markdown 沉浸排版与 Checkbox 实时联动。",
          "children": [
            {
              "id": "tour_4_1",
              "text": "🎭 画布现场记忆掩码自测 (Alt+R)",
              "priority": "P1",
              "note": "按 Alt+R 开启遮罩测试：文字被 100% 不透光的 Apple 磨砂超椭圆胶囊阻断，单点揭晓核对，再次单点重新盖上！",
              "children": []
            },
            {
              "id": "tour_4_2",
              "text": "🎴 3D 记忆抽认卡工坊 (Alt+F)",
              "priority": "P1",
              "note": "按 Alt+F 开启复习工坊：\n- 空格键 / 回车：3D 立体翻转卡片正面与背面；\n- 数字 1/2/3：遗忘重来、模糊待巩固、熟练掌握三级评分；\n- 自动提取父级路径引导、所有子要点与富文本详细备注。",
              "children": []
            },
            {
              "id": "tour_4_3",
              "text": "📑 线性 Markdown 大纲模式 (Alt+2)",
              "note": "毫秒级双向无损同步，内置虚拟滚动支持海量节点，Tab 缩进降级，Shift+Tab 升级，待办勾选双向打通。",
              "children": []
            }
          ]
        },
        {
          "id": "tour_5",
          "text": "📝 富文本 Markdown 节点备注",
          "icon": "📝",
          "priority": "P1",
          "progress": "100%",
          "tags": ["富文本", "知识管理"],
          "note": "### 节点富文本备注能力\n\n```javascript\n// 支持在备注中记录算法要点与代码实现\nfunction calculateTaperedWidth(level, scale) {\n  return (level === 0 ? 5.2 : 2.8) / scale;\n}\n```\n\n- [x] 完成脑图仿生神经突触排版\n- [x] 实现跨文件深度链接互联\n- [ ] 进行第二轮 3D 抽认卡主动复习\n\n> **设计哲学**：主画布保持高度凝练的核心要点，详细推导与长篇参考资料置于抽屉中，实现思考心流不中断。",
          "children": [
            { "id": "tour_5_1", "text": "快捷呼出抽屉 (Alt+N)", "children": [] },
            { "id": "tour_5_2", "text": "双模切换 (✍️ 编辑 / 👁️ 预览可点击待办)", "children": [] },
            { "id": "tour_5_3", "text": "完整支持 GFM 表格、代码高亮与 Callout 卡片", "children": [] }
          ]
        },
        {
          "id": "tour_6",
          "text": "🛡️ 安全加密、时光机与桌面原生",
          "icon": "🔒",
          "priority": "P1",
          "progress": "100%",
          "tags": ["安全隐私", "数据主权"],
          "note": "### 安全隐私与本地优先\n\n- **双层信封加密**：PBKDF2/Argon2id + AES-256-GCM 认证加密；\n- **密文草稿暂存**：加密文档不仅防偷窥，未落盘草稿在本地会话中亦受全程密文保护；\n- **锁屏内存物理擦除**：锁定后内存变量与剪贴板立即粉碎清空；\n- **版本快照时光机 (Ctrl+Shift+H)**：内置百兆级 IndexedDB，定时自动拍摄 + 手动定格里程碑，随时对比与覆盖还原；\n- **原生桌面融合**：macOS 红绿灯按钮专用避让留白、无边框全顶栏拖拽、零黑屏合成唤醒。",
          "children": [
            { "id": "tour_6_1", "text": "🔒 AES-256-GCM 密码保险箱 (Alt+L)", "children": [] },
            { "id": "tour_6_2", "text": "📸 版本快照时光机 (Ctrl+Shift+H)", "children": [] },
            { "id": "tour_6_3", "text": "🖥️ 原生窗口融合 (macOS 红绿灯 / 顶栏拖拽)", "children": [] },
            { "id": "tour_6_4", "text": "💾 100% 纯本地离线运行与数据自主", "children": [] }
          ]
        }
      ]
    }
  },

  // -------------------------------------------------------------
  // 1. 📐 基础思维骨架 (Structure - 4款)
  // -------------------------------------------------------------
  "mindmap-blank": {
    id: "mindmap-blank",
    name: "经典双向思维导图",
    icon: "🌳",
    desc: "发散性思维，左右平衡自适应分布",
    category: "structure",
    layout: "mindmap",
    data: {
      id: "root",
      text: "中心主题",
      children: []
    }
  },
  "logic-right-blank": {
    id: "logic-right-blank",
    name: "向右逻辑推导图",
    icon: "➡️",
    desc: "严谨层级因果流动，适合产品 PRD 与技术方案",
    category: "structure",
    layout: "logic-right",
    data: {
      id: "root",
      text: "中心主题",
      children: []
    }
  },
  "logic-left-blank": {
    id: "logic-left-blank",
    name: "向左逆向分析图",
    icon: "⬅️",
    desc: "逆向因果回溯，适合根因分析与复盘排查",
    category: "structure",
    layout: "logic-left",
    data: {
      id: "root",
      text: "中心主题",
      children: []
    }
  },
  "org-down-blank": {
    id: "org-down-blank",
    name: "组织架构与层级流",
    icon: "🏢",
    desc: "自上而下纵向流动，权责划分与管理汇报一览无遗",
    category: "structure",
    layout: "org-down",
    data: {
      id: "root",
      text: "中心主题",
      children: []
    }
  },

  // -------------------------------------------------------------
  // 2. 💼 敏捷工程与项目管理 (Project - 4款)
  // -------------------------------------------------------------
  "project-sprint": {
    id: "project-sprint",
    name: "敏捷 Sprint 迭代看板",
    icon: "🚀",
    desc: "需求梳理、任务认领、阻碍排查与发版交付全追踪",
    category: "project",
    layout: "mindmap",
    data: {
      id: "root",
      text: "Sprint 34 冲刺交付",
      children: [
        {
          id: "sp_1", text: "🎯 本期重点里程碑", priority: "P1", progress: "100%", children: [
            { id: "sp_1_1", text: "完成双层 AES 密文加密协议重构", children: [] },
            { id: "sp_1_2", text: "集成 3D 翻转卡片学习工坊", children: [] }
          ]
        },
        {
          id: "sp_2", text: "💻 研发中需求池", priority: "P2", progress: "50%", children: [
            { id: "sp_2_1", text: "空间四叉树多选算法平滑支持", tags: ["已提测"], children: [] },
            { id: "sp_2_2", text: "Markdown 抽屉代码高亮支持", tags: ["开发中"], children: [] }
          ]
        },
        {
          id: "sp_3", text: "⚠️ 阻塞性问题 (Blockers)", priority: "P1", children: [
            { id: "sp_3_1", text: "等待外部鉴权接口文档回执", tags: ["依赖外部"], children: [] }
          ]
        },
        {
          id: "sp_4", text: "📦 上线与回归计划", priority: "P3", progress: "25%", children: [
            { id: "sp_4_1", text: "全链路端到端自动化测试运行", children: [] },
            { id: "sp_4_2", text: "更新用户指南与 Release Notes", children: [] }
          ]
        }
      ]
    }
  },
  "tech-architecture": {
    id: "tech-architecture",
    name: "系统架构设计与技术选型",
    icon: "🏗️",
    desc: "微服务边界划分、高并发高可用保障与技术栈考量",
    category: "project",
    layout: "logic-right",
    data: {
      id: "root",
      text: "分布式架构设计规范",
      children: [
        {
          id: "arch_1", text: "客户端与接入层 (Gateway)", children: [
            { id: "arch_1_1", text: "动态路由与流量染色", children: [] },
            { id: "arch_1_2", text: "自适应限流降级 (Sentinel/Envoy)", children: [] }
          ]
        },
        {
          id: "arch_2", text: "核心业务服务划分", children: [
            { id: "arch_2_1", text: "用户认证与授权中心 (OAuth2/JWT)", children: [] },
            { id: "arch_2_2", text: "核心业务编排流水线 (Temporal/Camunda)", children: [] }
          ]
        },
        {
          id: "arch_3", text: "数据存储与持久化架构", children: [
            { id: "arch_3_1", text: "关系主库分库分表策略", children: [] },
            { id: "arch_3_2", text: "Redis 分布式多级缓存一致性", children: [] },
            { id: "arch_3_3", text: "Elasticsearch 亿级向量与文本倒排索引", children: [] }
          ]
        }
      ]
    }
  },
  "release-checklist": {
    id: "release-checklist",
    name: "版本发布与上线 Checklist",
    icon: "📋",
    desc: "发布前基线核查、数据库迁移、回滚预案与在线监控",
    category: "project",
    layout: "logic-right",
    data: {
      id: "root",
      text: "生产发版质量门禁",
      children: [
        {
          id: "rel_1", text: "1. 准出与静态门禁检查", priority: "P1", progress: "100%", children: [
            { id: "rel_1_1", text: "代码审查 (Code Review) 严格双签通过", children: [] },
            { id: "rel_1_2", text: "静态安全漏洞代码扫描通过 (SonarQube/Snyk)", children: [] }
          ]
        },
        {
          id: "rel_2", text: "2. 运维与数据库迁移", priority: "P1", progress: "75%", children: [
            { id: "rel_2_1", text: "DDL 生产执行与锁表评估已完成", children: [] },
            { id: "rel_2_2", text: "配置中心新变量全部部署至配置中心", children: [] }
          ]
        },
        {
          id: "rel_3", text: "3. 灰度放量与应急回滚", priority: "P2", progress: "25%", children: [
            { id: "rel_3_1", text: "首批 5% 灰度节点健康探测无报错", children: [] },
            { id: "rel_3_2", text: "一键快速回滚镜像脚本校验就绪", children: [] }
          ]
        }
      ]
    }
  },
  "post-mortem": {
    id: "post-mortem",
    name: "线上故障复盘分析 (Post-mortem)",
    icon: "🔍",
    desc: "时间线还原、根因分析(5-Whys)、影响面评估与落地改进行动",
    category: "project",
    layout: "mindmap",
    data: {
      id: "root",
      text: "0828 线上故障复盘报告",
      children: [
        {
          id: "pm_1", text: "⏱️ 故障时间线脉络", priority: "P2", children: [
            { id: "pm_1_1", text: "14:10 告警触发：RPC 响应超时率超标", children: [] },
            { id: "pm_1_2", text: "14:18 应急熔断：启用静态降级策略", children: [] },
            { id: "pm_1_3", text: "14:32 恢复正常：扩容下游实例完成恢复", children: [] }
          ]
        },
        {
          id: "pm_2", text: "🎯 根因剖析 (5-Whys)", priority: "P1", children: [
            { id: "pm_2_1", text: "为何响应慢？由于连接池耗尽", children: [] },
            { id: "pm_2_2", text: "为何连接池耗尽？因未设置单次查询超时强制熔断", children: [] }
          ]
        },
        {
          id: "pm_3", text: "🛠️ 改进措施与责任人 (Action Items)", priority: "P1", progress: "50%", children: [
            { id: "pm_3_1", text: "设置全局 1.5s 客户端超时截断 @DevTeam", tags: ["本周完成"], children: [] },
            { id: "pm_3_2", text: "补充混沌工程故障注入断网演练 @QA", tags: ["下周完成"], children: [] }
          ]
        }
      ]
    }
  },

  // -------------------------------------------------------------
  // 3. 📊 战略规划与商业决策 (Business - 4款)
  // -------------------------------------------------------------
  "swot-analysis": {
    id: "swot-analysis",
    name: "SWOT 战略决策分析",
    icon: "🎯",
    desc: "全面剖析优势 (S)、劣势 (W)、机会 (O) 与威胁 (T)",
    category: "business",
    layout: "mindmap",
    data: {
      id: "root",
      text: "企业战略 SWOT 洞察",
      children: [
        {
          id: "swot_1", text: "💪 Strengths (内部优势)", priority: "P1", children: [
            { id: "swot_1_1", text: "自研超轻量底层引擎，启动速度业界领先", children: [] },
            { id: "swot_1_2", text: "高度注重数据主权，100% 离线隐私保护", children: [] }
          ]
        },
        {
          id: "swot_2", text: "⚠️ Weaknesses (内部劣势)", priority: "P2", children: [
            { id: "swot_2_1", text: "品牌知名度处于初期，市场心智认知不足", children: [] },
            { id: "swot_2_2", text: "暂未支持公网多人实时协同编辑", children: [] }
          ]
        },
        {
          id: "swot_3", text: "🌟 Opportunities (外部机会)", priority: "P1", children: [
            { id: "swot_3_1", text: "企业客户对数据隐私与离线加密需求井喷", children: [] },
            { id: "swot_3_2", text: "传统臃肿脑图工具用户迁移诉求强烈", children: [] }
          ]
        },
        {
          id: "swot_4", text: "⚡ Threats (外部威胁)", priority: "P3", children: [
            { id: "swot_4_1", text: "行业头部厂商降价促销与生态绑定", children: [] },
            { id: "swot_4_2", text: "开源通用导图组件低门槛竞争", children: [] }
          ]
        }
      ]
    }
  },
  "pestel-analysis": {
    id: "pestel-analysis",
    name: "PESTEL 宏观环境模型",
    icon: "🌐",
    desc: "政治、经济、社会、科技、环境与法律全方位宏观战略扫描",
    category: "business",
    layout: "mindmap",
    data: {
      id: "root",
      text: "PESTEL 宏观战略扫描",
      children: [
        { id: "pst_1", text: "🏛️ 政治因素 (Political)", children: [{ id: "pst_1_1", text: "出海数据合规与监管趋势", children: [] }] },
        { id: "pst_2", text: "💰 经济因素 (Economic)", children: [{ id: "pst_2_1", text: "企业 IT 预算精细化支出趋势", children: [] }] },
        { id: "pst_3", text: "👥 社会文化 (Social)", children: [{ id: "pst_3_1", text: "远程办公与个人数字第二大脑常态化", children: [] }] },
        { id: "pst_4", text: "💻 科技演进 (Technological)", children: [{ id: "pst_4_1", text: "本地端侧大模型结合与高性能 WebAssembly", children: [] }] },
        { id: "pst_5", text: "🌱 环境保护 (Environmental)", children: [{ id: "pst_5_1", text: "全流程绿色低功耗软件架构", children: [] }] },
        { id: "pst_6", text: "⚖️ 法律合规 (Legal)", children: [{ id: "pst_6_1", text: "GDPR 与网络数据安全法案落地要求", children: [] }] }
      ]
    }
  },
  "porter-five-forces": {
    id: "porter-five-forces",
    name: "波特五力竞争模型",
    icon: "⚔️",
    desc: "透析行业盈利潜能与竞争结构竞争分析框架",
    category: "business",
    layout: "mindmap",
    data: {
      id: "root",
      text: "行业波特五力竞争态势",
      children: [
        { id: "p5_1", text: "1. 供应商议价能力 (中)", children: [{ id: "p5_1_1", text: "基础设施算力与操作系统供应商格局稳定", children: [] }] },
        { id: "p5_2", text: "2. 买方议价能力 (高)", children: [{ id: "p5_2_1", text: "软件替代方案较多，转换成本逐步降低", children: [] }] },
        { id: "p5_3", text: "3. 潜在进入者威胁 (高)", children: [{ id: "p5_3_1", text: "前端 Canvas/SVG 技术栈开源门槛不高", children: [] }] },
        { id: "p5_4", text: "4. 替代品威胁 (中)", children: [{ id: "p5_4_1", text: "白板工具 (Miro/Excalidraw) 跨界分流用户", children: [] }] },
        { id: "p5_5", text: "5. 行业内现有对手 (极高)", children: [{ id: "p5_5_1", text: "老牌导图巨头市场教育充分且壁垒深厚", children: [] }] }
      ]
    }
  },
  "okr-alignment": {
    id: "okr-alignment",
    name: "OKR 目标与关键结果对齐",
    icon: "🎯",
    desc: "组织野心目标分解，透明驱动上下同欲与业务破局",
    category: "business",
    layout: "logic-right",
    data: {
      id: "root",
      text: "Q3 季度核心 OKR 规划",
      children: [
        {
          id: "okr_1", text: "目标 O1：打造行业顶尖的桌面端性能与质感口碑", priority: "P1", children: [
            { id: "okr_1_1", text: "KR 1.1：万级节点平移缩放帧率稳定在 60FPS 以上", progress: "75%", children: [] },
            { id: "okr_1_2", text: "KR 1.2：冷启动耗时优化至 180ms 以内", progress: "100%", children: [] },
            { id: "okr_1_3", text: "KR 1.3：Apple HIG 视觉设计用户好评率达 95%", progress: "50%", children: [] }
          ]
        },
        {
          id: "okr_2", text: "目标 O2：构筑隐私安全护城河，赢得深度知识用户认可", priority: "P2", children: [
            { id: "okr_2_1", text: "KR 2.1：推出 Argon2id + AES-256 原生加密沙箱", progress: "100%", children: [] },
            { id: "okr_2_2", text: "KR 2.2：上线 3D 抽认卡复习工坊并打通记忆曲线", progress: "100%", children: [] }
          ]
        }
      ]
    }
  },

  // -------------------------------------------------------------
  // 4. 🧠 深度学习与知识内化 (Learning - 4款，深度适配 3D 抽认卡)
  // -------------------------------------------------------------
  "computer-systems": {
    id: "computer-systems",
    name: "计算机系统基础体系 (CSAPP)",
    icon: "💻",
    desc: "内存体系结构、虚拟内存与系统调用（一键导出 3D 抽认卡自测）",
    category: "learning",
    layout: "mindmap",
    data: {
      id: "root",
      text: "CSAPP 核心原理全景",
      note: "计算机科学底层骨干知识库，按 Alt+F 可直接生成系统级 3D 抽认卡自查知识点盲区。",
      children: [
        {
          id: "cs_1", text: "一、信息的表示与处理", priority: "P1", note: "重点掌握补码编码原理、浮点数 IEEE 754 标准以及整数溢出处理。", children: [
            { id: "cs_1_1", text: "整数无符号与有符号补码运算", children: [] },
            { id: "cs_1_2", text: "浮点数舍入与精度截断效应", children: [] }
          ]
        },
        {
          id: "cs_2", text: "二、存储器层级结构", priority: "P1", note: "核心思想：局部性原理（时间局部性与空间局部性）。", children: [
            { id: "cs_2_1", text: "SRAM 与 DRAM 物理硬件特性区别", children: [] },
            { id: "cs_2_2", text: "高速缓存 Cache 组相联映射机制", children: [] },
            { id: "cs_2_3", text: "高速缓存命中与未命中惩罚 (Miss Penalty)", children: [] }
          ]
        },
        {
          id: "cs_3", text: "三、虚拟内存与异常控制流", priority: "P2", note: "TLB、页表与 MMU 地址翻译全过程。", children: [
            { id: "cs_3_1", text: "页面置换算法 (LRU/Clock/FIFO)", children: [] },
            { id: "cs_3_2", text: "上下文切换与软硬件中断机制", children: [] }
          ]
        }
      ]
    }
  },
  "dsa-algorithms": {
    id: "dsa-algorithms",
    name: "高频算法与数据结构图谱",
    icon: "🧮",
    desc: "排序树论、动态规划与图论解法模式总结（高频面试复习库）",
    category: "learning",
    layout: "logic-right",
    data: {
      id: "root",
      text: "数据结构与算法核心思维",
      note: "掌握经典核心模型，面试与工程解构利器。",
      children: [
        {
          id: "algo_1", text: "1. 树与平衡结构", priority: "P1", children: [
            { id: "algo_1_1", text: "二叉搜索树 BST 与平衡红黑树 (R-B Tree)", children: [] },
            { id: "algo_1_2", text: "前缀树 Trie 与海量字符串路由匹配", children: [] }
          ]
        },
        {
          id: "algo_2", text: "2. 动态规划 (DP) 核心思想", priority: "P1", note: "状态定义、状态转移方程与无后效性边界。", children: [
            { id: "algo_2_1", text: "0-1 背包与完全背包推导", children: [] },
            { id: "algo_2_2", text: "最长公共子序列 (LCS) 与单调递增子序列 (LIS)", children: [] }
          ]
        },
        {
          id: "algo_3", text: "3. 高级图论与网络流", priority: "P2", children: [
            { id: "algo_3_1", text: "最短路径算法：Dijkstra 与 SPFA", children: [] },
            { id: "algo_3_2", text: "拓扑排序与并查集 (Union-Find) 判环", children: [] }
          ]
        }
      ]
    }
  },
  "english-vocabulary": {
    id: "english-vocabulary",
    name: "专业英语核心词根与搭配",
    icon: "📖",
    desc: "前缀后缀构词法与高阶学术表达（最佳 3D 抽认卡复习模版）",
    category: "learning",
    layout: "mindmap",
    data: {
      id: "root",
      text: "进阶英语词根词缀精选",
      note: "按 Alt+F 可直接将本导图作为双面背词卡，点击卡片 3D 翻转看词义与例句！",
      children: [
        {
          id: "eng_1", text: "词根: -vert-/-vers- (转动/改变)", priority: "P1", note: "本意为 to turn，引申出转化、倒置、敌对等大量高阶词汇。", children: [
            { id: "eng_1_1", text: "Controversy: 争论，辩论", note: "contra-(反) + vers-(转) -> 朝相反方向转 -> 观点对抗。", children: [] },
            { id: "eng_1_2", text: "Inadvertent: 非故意的，疏忽的", note: "in-(不) + ad-(去) + vert-(转) -> 心思没转过去 -> 疏忽大意。", children: [] },
            { id: "eng_1_3", text: "Subvert: 颠覆，推翻", note: "sub-(从下往上) + vert-(翻转) -> 彻底颠覆制度或政权。", children: [] }
          ]
        },
        {
          id: "eng_2", text: "词根: -spec-/-spect- (看见/观察)", priority: "P1", children: [
            { id: "eng_2_1", text: "Introspective: 内省的，自省的", note: "intro-(向内) + spect-(看) -> 审视自己内心的思想情感。", children: [] },
            { id: "eng_2_2", text: "Circumspect: 审慎的，慎重的", note: "circum-(圆周/四周) + spect-(看) -> 四周环视观察危险 -> 行事极其周全谨慎。", children: [] }
          ]
        },
        {
          id: "eng_3", text: "词根: -flu-/-flux- (流动)", priority: "P2", children: [
            { id: "eng_3_1", text: "Superfluous: 多余的，累赘的", note: "super-(超过) + flu-(流淌) -> 溢出来的多余部分。", children: [] },
            { id: "eng_3_2", text: "Effluent: 排放物，流出物", children: [] }
          ]
        }
      ]
    }
  },
  "cognitive-psychology": {
    id: "cognitive-psychology",
    name: "认知心理学与主动回忆原理",
    icon: "🧠",
    desc: "工作记忆带宽、艾宾浩斯遗忘曲线与刻意练习神经回路",
    category: "learning",
    layout: "mindmap",
    data: {
      id: "root",
      text: "认知科学与心智模型",
      children: [
        {
          id: "cog_1", text: "一、工作记忆与心流带宽", priority: "P1", note: "人类工作记忆只有 4±1 个信息块容量，需善用外部画布减轻认知负荷。", children: [
            { id: "cog_1_1", text: "组块化处理 (Chunking) 扩大容量", children: [] },
            { id: "cog_1_2", text: "外部脑图作为认知支架 (Cognitive Offloading)", children: [] }
          ]
        },
        {
          id: "cog_2", text: "二、提取练习效应 (Testing Effect)", priority: "P1", note: "主动从脑中提取信息（Active Recall）比被动重复阅读的记忆留存率高 300% 以上！", children: [
            { id: "cog_2_1", text: "3D 抽认卡自测加深神经突触连接", children: [] },
            { id: "cog_2_2", text: "记忆遮罩模式驱动大脑产生认知摩擦", children: [] }
          ]
        },
        {
          id: "cog_3", text: "三、间隔重复 (Spaced Repetition)", priority: "P2", children: [
            { id: "cog_3_1", text: "艾宾浩斯遗忘曲线黄金复习间隔点", children: [] },
            { id: "cog_3_2", text: "遗忘并非敌人，而是在为长期记忆重塑索引", children: [] }
          ]
        }
      ]
    }
  },

  // -------------------------------------------------------------
  // 5. 💡 个人效能与工作会议 (Productivity - 4款)
  // -------------------------------------------------------------
  "meeting-minutes": {
    id: "meeting-minutes",
    name: "高效率会议纪要与决策链",
    icon: "📝",
    desc: "明确议题背景、现场决议共识与唯一责任人行动清单",
    category: "productivity",
    layout: "logic-right",
    data: {
      id: "root",
      text: "产品产研周会纪要",
      children: [
        {
          id: "meet_1", text: "📌 会议背景与核心议题", children: [
            { id: "meet_1_1", text: "Q3 季度核心体验优化指标复盘", children: [] },
            { id: "meet_1_2", text: "本地加密功能发版排期与验收", children: [] }
          ]
        },
        {
          id: "meet_2", text: "✅ 关键决议与产出共识", priority: "P1", children: [
            { id: "meet_2_1", text: "统一采用 Argon2id 作为主访问加密算子", children: [] },
            { id: "meet_2_2", text: "默认开启记忆掩码主动复习入口", children: [] }
          ]
        },
        {
          id: "meet_3", text: "🚀 待办行动项 (Action Items)", priority: "P1", progress: "25%", children: [
            { id: "meet_3_1", text: "输出端到端安全测试用例 @Alex", tags: ["本周五"], children: [] },
            { id: "meet_3_2", text: "完成全量 20 款高频场景模板发布 @Design", tags: ["已上线"], children: [] }
          ]
        }
      ]
    }
  },
  "first-principles": {
    id: "first-principles",
    name: "第一性原理思考与破局",
    icon: "💡",
    desc: "剥离表面经验类比，回归事物物理本质进行推演创新",
    category: "productivity",
    layout: "mindmap",
    data: {
      id: "root",
      text: "第一性原理思维模型",
      children: [
        {
          id: "fp_1", text: "1. 识别并质疑一切现存假设", priority: "P1", children: [
            { id: "fp_1_1", text: "为什么思维导图软件必须依赖庞大云端？", children: [] },
            { id: "fp_1_2", text: "现有的商业竞争对手究竟把代码用在了哪里？", children: [] }
          ]
        },
        {
          id: "fp_2", text: "2. 解构为不可再分的基础要素", priority: "P1", children: [
            { id: "fp_2_1", text: "要素 A：树形层级数据结构 (Tree Data)", children: [] },
            { id: "fp_2_2", text: "要素 B：毫秒级高性能渲染 (Canvas 2D)", children: [] },
            { id: "fp_2_3", text: "要素 C：绝对安全的个人隐私 (Local Only)", children: [] }
          ]
        },
        {
          id: "fp_3", text: "3. 从基石出发重新推导重构", priority: "P2", children: [
            { id: "fp_3_1", text: "自研超椭圆与四叉树，榨干原生浏览器潜能", children: [] },
            { id: "fp_3_2", text: "提供极致丝滑的本地桌面级单机体验", children: [] }
          ]
        }
      ]
    }
  },
  "gtd-workflow": {
    id: "gtd-workflow",
    name: "GTD 任务与个人精力管理",
    icon: "⏳",
    desc: "收集箱、排期处理、两分钟原则与每周复盘闭环",
    category: "productivity",
    layout: "mindmap",
    data: {
      id: "root",
      text: "GTD 精力与效能系统",
      children: [
        {
          id: "gtd_1", text: "📥 收集箱 (Inbox)", priority: "P1", children: [
            { id: "gtd_1_1", text: "闪念灵感与待读技术文章", children: [] },
            { id: "gtd_1_2", text: "待报销发票与税务材料整理", children: [] }
          ]
        },
        {
          id: "gtd_2", text: "⚡ 两分钟原则 (立即执行)", priority: "P2", progress: "100%", children: [
            { id: "gtd_2_1", text: "回复团队关键决策邮件", children: [] },
            { id: "gtd_2_2", text: "合并主分支修复补丁", children: [] }
          ]
        },
        {
          id: "gtd_3", text: "🗓️ 本周深度项目池", priority: "P1", progress: "50%", children: [
            { id: "gtd_3_1", text: "完成 Q3 技术规划白皮书撰写", children: [] },
            { id: "gtd_3_2", text: "重构数据库持久层慢调用链路", children: [] }
          ]
        },
        {
          id: "gtd_4", text: "🌱 愿景与未来清单 (Someday)", priority: "P4", children: [
            { id: "gtd_4_1", text: "学习 Rust 异步图形学开发", children: [] },
            { id: "gtd_4_2", text: "计划一次深度自驾旅行", children: [] }
          ]
        }
      ]
    }
  },
  "feynman-technique": {
    id: "feynman-technique",
    name: "费曼学习法与知识萃取",
    icon: "🎓",
    desc: "以教促学：概念确立、通俗解释、查漏补缺与类比精炼",
    category: "productivity",
    layout: "logic-right",
    data: {
      id: "root",
      text: "费曼极简学习四部曲",
      children: [
        {
          id: "fey_1", text: "步骤一：确立目标概念", priority: "P1", children: [
            { id: "fey_1_1", text: "在空白导图中心写下要彻底吃透的核心主题", children: [] }
          ]
        },
        {
          id: "fey_2", text: "步骤二：假想向 8 岁儿童讲解", priority: "P1", children: [
            { id: "fey_2_1", text: "杜绝使用任何行业生僻黑话与晦涩术语", children: [] },
            { id: "fey_2_2", text: "大量运用生活中司空见惯的事物进行形象比喻", children: [] }
          ]
        },
        {
          id: "fey_3", text: "步骤三：定位卡壳点，回归原典查漏补缺", priority: "P2", children: [
            { id: "fey_3_1", text: "一旦解释不通，说明此处存在逻辑跳跃与认知盲区", children: [] },
            { id: "fey_3_2", text: "重新研读基础文献直到能用自己的大白话讲清楚", children: [] }
          ]
        },
        {
          id: "fey_4", text: "步骤四：精炼升华并形成记忆卡片", priority: "P3", progress: "100%", children: [
            { id: "fey_4_1", text: "录入节点备注并在抽认卡中自测强化", children: [] }
          ]
        }
      ]
    }
  }
};
