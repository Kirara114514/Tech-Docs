#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tech-Docs Tag 归并工具
========================
1. 扫描 Tech-Docs 下所有 .md 文档（排除模板/历史记录/自身）
2. 抽取元数据中的 tag 行
3. 统计当前 tag 分布，输出重复度报告
4. 按预定义的 tag 映射表进行归并
5. 修改文件并验证结果
"""

import os
import re
import json
from collections import Counter
from pathlib import Path

# ===== 配置 =====
ROOT = Path(r"D:\MyGit\Tech-Docs")
EXCLUDE_PATTERNS = [
    r"模板规范/",
    r"历史记录/",
    r"README\.md$",
    r"tag_consolidation\.py$",
]

# ===== Tag 归并规则 =====
# key -> standard_tag
# 将多种写法归并到一个标准 tag 下
TAG_MERGE_MAP = {
    # ---- 引擎相关 ----
    "Unreal Engine": "Unreal Engine",
    "UE": "Unreal Engine",
    "UE开发": "Unreal Engine",
    "UE迁移": "Unreal Engine",
    "引擎迁移": "Unreal Engine",
    "Unity迁移": "Unreal Engine",
    "Unity到UE": "Unreal Engine",
    "Unity 与 UE 常用功能类比": "Unreal Engine",

    "Unity引擎": "Unity",
    "Unity架构": "Unity",

    # ---- 性能 ----
    "优化迁移": "性能优化",
    "GC Alloc": "GC",
    "GC优化": "GC",
    "Garbage Collection": "GC",
    "垃圾回收": "GC",

    "渲染性能": "性能优化",
    "界面性能": "性能优化",
    "动画优化": "性能优化",
    "Shader优化": "性能优化",
    "内存优化": "性能优化",
    "内存治理": "性能优化",
    "内存分析": "性能优化",
    "内存治理": "性能优化",

    # ---- UI ----
    "Canvas分层": "UGUI",
    "Canvas重建": "UGUI",
    "UGUI": "UGUI",

    "动画迁移": "Unreal Engine",

    # ---- 并发 ----
    "协程": "协程编程",
    "Coroutine": "协程编程",
    "异步流程": "异步编程",
    "异步编程": "异步编程",
    "异步封装": "异步编程",
    "async-await": "异步编程",

    # ---- 架构 ----
    "系统通信": "事件总线",
    "模块解耦": "事件总线",
    "基础设施": "事件总线",
    "GPU": "图形学",
    "浏览器渲染": "浏览器渲染",

    # ---- ECS ----
    "数据导向设计": "ECS",
    "SOA": "ECS",
    "Archetype": "ECS",
    "EntityManager": "ECS",
    "Baking": "ECS",
    "System": "ECS",
    "Entity交互": "ECS",
    "DynamicBuffer": "ECS",
    "工具链": "ECS",
    "DOD": "ECS",

    # Chunk — 仅在热更新上下文出现时映射到热更新
    # ECS 文档中的 Chunk 概念直接用原词，不映射
    "GameObject": "ECS",

    # ---- 可观测性与调试（不归 ECS）----
    "可观测性": "工程治理",
    "调试": "工程治理",
    "多Agent协作": "多Agent系统",
    "Agent编排": "多Agent系统",
    "多Agent": "多Agent系统",

    # ---- 架构治理 ----
    "架构治理": "架构设计",
    "架构价值": "架构设计",
    "系统边界": "架构设计",
    "技术治理": "架构设计",

    # ---- C# 基础 ----
    "委托": "C#",
    "反射": "C#",
    "表达式树": "C#",

    # ---- 缓存策略（通用，不归 C#）----
    "缓存策略": "缓存策略",
    "缓存优化": "缓存策略",
    "IL2CPP": "C#",
    "AOT": "C#",

    # ---- UniRx ----
    "Subject": "UniRx",
    "IObservable": "UniRx",
    "Hot Observable": "UniRx",
    "Cold Observable": "UniRx",
    "调度器": "UniRx",
    "TestScheduler": "UniRx",
    "自定义操作符": "UniRx",
    "ReactiveCollection": "UniRx",

    # ---- 资源管理 ----
    "资源规范": "资源管理",
    "命名规则": "资源管理",
    "目录组织": "资源管理",
    "共享资源": "资源管理",
    "资产治理": "资源管理",
    "资产管线": "资源管理",
    "资源方案选型": "资源管理",
    "版本治理": "资源管理",
    "生命周期治理": "资源管理",

    # ---- 版本管理（通用）----
    "版本管理": "工程治理",
    "版本控制": "工程治理",

    # ---- 对象池 ----
    "ObjectPool": "对象池",
    "UnityEngine.Pool": "对象池",
    "池化复用": "对象池",

    # ---- 热更新 ----
    "构建发布": "热更新",
    "版本管理": "工程治理",
    "回滚策略": "工程治理",
    "补丁策略": "热更新",
    "灰度发布": "热更新",
    "回滚": "工程治理",
    "构建发布": "热更新",
    "Cook": "热更新",
    "Pak": "热更新",
    "IoStore": "热更新",
    "Chunk": "热更新",

    # ---- 工程协作 ----
    "大型项目": "工程治理",
    "质量治理": "工程治理",
    "自动化门禁": "工程治理",
    "技术管理": "工程治理",
    "代码规范": "工程治理",
    "代码风格": "工程治理",
    "多人协作": "工程治理",
    "跨职能协作": "工程治理",
    "项目组织": "工程治理",
    "工程地图": "工程治理",
    "知识沉淀": "工程治理",

    # ---- 团队/角色 ----
    "玩法程序员": "职业发展",
    "工具程序员": "职业发展",
    "角色分工": "职业发展",
    "职业路径": "职业发展",
    "团队组织": "职业发展",
    "职业方向": "职业发展",
    "岗位探索": "职业发展",
    "专业路径": "职业发展",
    "团队协作": "职业发展",
    "优秀开发者": "职业发展",
    "职业成长": "职业发展",
    "工程文化": "职业发展",
    "团队融入": "职业发展",
    "新人入组": "职业发展",
    "Onboarding": "职业发展",
    "项目协作": "职业发展",
    "职业适应": "职业发展",
    "成长路径": "职业发展",
    "能力模型": "职业发展",
    "体验工程": "职业发展",
    "游戏团队": "职业发展",
    "游戏岗位": "职业发展",
    "面试": "职业发展",

    # ---- 物理 ----
    "Unity物理": "物理系统",
    "物理迁移": "物理系统",
    "碰撞系统": "物理系统",
    "Chaos": "物理系统",
    "CharacterMovement": "物理系统",
    "碰撞通道": "物理系统",
    "Trace": "物理系统",
    "Overlap": "物理系统",
    "物理高级特性": "物理系统",
    "连续碰撞": "物理系统",
    "关节系统": "物理系统",
    "查询优化": "物理系统",
    "性能治理": "物理系统",
    "约束求解": "物理系统",
    "物理稳定性": "物理系统",
    "时间步": "物理系统",
    "数值优化": "物理系统",
    "物理前沿": "物理系统",
    "实时模拟": "物理系统",
    "技术探索": "物理系统",
    "样例验证": "物理系统",
    "工程判断": "物理系统",
    "碰撞检测": "物理系统",
    "刚体模拟": "物理系统",
    "数值积分": "物理系统",
    "Physics": "物理系统",
    "Rigidbody": "物理系统",
    "Collider": "物理系统",
    "Physics Material": "物理系统",
    "手写物理引擎": "物理系统",
    "刚体": "物理系统",
    "碰撞响应": "物理系统",
    "固定步进": "物理系统",
    "物理引擎": "物理系统",
    "底层原理": "物理系统",
    "时间步进": "物理系统",

    # ---- 数学 ----
    "数学陷阱": "数学基础",
    "数值稳定性": "数学基础",
    "空间变换": "数学基础",
    "实时计算": "数学基础",
    "Transform": "数学基础",
    "MVP": "数学基础",
    "空间转换": "数学基础",
    "空间数据结构": "数学基础",
    "程序化生成": "数学基础",

    # ---- AI/ML ----
    "上下文管理": "AI编程",
    "记忆系统": "AI编程",
    "MCP": "AI编程",
    "向量检索": "AI编程",
    "RAG": "AI编程",
    "语义索引": "AI编程",
    "企业Agent": "AI编程",
    "安全代理": "AI编程",
    "沙箱隔离": "AI编程",
    "零信任": "AI编程",
    "组织设计": "AI编程",
    "权限边界": "AI编程",
    "文档治理": "AI编程",
    "可靠性工程": "AI编程",
    "角色扮演系统": "AI编程",
    "QwenPaw": "AI编程",
    "记忆同步": "AI编程",
    "自动化调度": "AI编程",
    "变更监听": "AI编程",
    "AI迁移": "AI编程",
    "Behavior Tree": "AI编程",
    "Blackboard": "AI编程",
    "Blackboard": "AI编程",
    "AI Perception": "AI编程",
    "Navigation": "AI编程",
    "EQS": "AI编程",
    "StateTree": "AI编程",

    # ---- 网络 ----
    "网络同步": "网络系统",
    "多人游戏": "网络系统",
    "Replication": "网络系统",
    "RPC": "网络系统",
    "Ownership": "网络系统",
    "Prediction": "网络系统",
    "Dedicated Server": "网络系统",

    # ---- 协程/异步 细化 ----
    "异步取消": "异步编程",
    "资源加载": "异步编程",
    "CancellationToken": "异步编程",

    # ---- UI 组件级 ----
    "UI优化": "UGUI",
    "Unity UI": "UGUI",
    "UI架构": "UI架构",
    "输入管理": "UI架构",
    "焦点管理": "UI架构",
    "页面协调": "UI架构",
    "UI迁移": "引擎迁移",
    "UMG": "引擎迁移",
    "Widget Blueprint": "UI架构",
    "Slate": "UI架构",
    "输入焦点": "UI架构",
    "Enhanced Input": "UI架构",
    "PlayerController": "UI架构",
    "UI焦点": "UI架构",
    "上下文切换": "UI架构",
    "输入系统": "UI架构",

    # ---- 代码生成 ----
    "代码生成": "代码生成",
    "Excel导表": "Luban",
    "Luban": "Luban",
    "Xlsx": "Luban",
    "Manifest": "Luban",

    # ---- 迁移专题 ----
    "语言迁移": "引擎迁移",
    "内存管理": "引擎迁移",
    "工程规范": "引擎迁移",
    "Gameplay Framework": "引擎迁移",
    "Actor": "引擎迁移",
    "Controller": "引擎迁移",
    "GameMode": "引擎迁移",
    "Subsystem": "引擎迁移",
    "功能类比": "引擎迁移",
    "迁移误区": "引擎迁移",
    "框架理解": "引擎迁移",
    "专题规划": "引擎迁移",
    "团队迁移": "引擎迁移",
    "能力建设": "引擎迁移",
    "迁移方法论": "引擎迁移",
    "开发流程": "引擎迁移",
    "引擎扩展": "引擎迁移",
    "插件": "引擎迁移",
    "模块": "引擎迁移",
    "CI/CD": "引擎迁移",
    "材质系统": "引擎迁移",
    "光照": "引擎迁移",
    "Lumen": "引擎迁移",
    "Nanite": "引擎迁移",
    "后处理": "引擎迁移",
    "渲染管线": "引擎迁移",
    "图形技术": "引擎迁移",
    "性能分析": "引擎迁移",
    "Unreal Insights": "引擎迁移",
    "Profiler": "引擎迁移",
    "Stat命令": "引擎迁移",
    "GPU分析": "引擎迁移",
    "蓝图": "引擎迁移",
    "C++": "引擎迁移",
    "脚本协作": "引擎迁移",
    "职责分层": "引擎迁移",
    "软引用": "引擎迁移",
    "硬引用": "引擎迁移",
    "Asset Manager": "引擎迁移",
    "打包流程": "引擎迁移",
    "动画迁移": "引擎迁移",
    "Animation Blueprint": "引擎迁移",
    "Montage": "引擎迁移",
    "State Machine": "引擎迁移",
    "Blend Space": "引擎迁移",
    "Root Motion": "引擎迁移",
    "Anim Notify": "引擎迁移",
    "音频迁移": "引擎迁移",
    "特效迁移": "引擎迁移",
    "Niagara": "引擎迁移",
    "MetaSound": "引擎迁移",
    "通知机制": "引擎迁移",
    "内容工作流": "引擎迁移",
    "表现系统": "引擎迁移",

    # ---- 工程协作细分 ----
    "Code Review": "工程治理",
    "Review": "工程治理",
    "联调流程": "工程治理",

    # ---- Job System ----
    "Job System": "Job System",
    "Burst": "Job System",
    "NativeArray": "Job System",
    "NativeContainer": "Job System",
    "JobHandle": "Job System",
    "并行计算": "Job System",

    # ---- UniTask ----
    "UniTask": "UniTask",

    # ---- Addressables ----
    "Addressables": "资源管理",
    "AssetBundle": "资源管理",
    "YooAsset": "资源管理",

    # ---- 数据结构 ----
    "哈希表": "算法与数据结构",
    "Dictionary": "算法与数据结构",
    "HashSet": "算法与数据结构",
    "哈希冲突": "算法与数据结构",
    "键设计": "算法与数据结构",
    "堆": "算法与数据结构",
    "优先队列": "算法与数据结构",
    "二叉堆": "算法与数据结构",
    "TopK": "算法与数据结构",
    "对顶堆": "算法与数据结构",
    "AStar": "算法与数据结构",
    "栈": "算法与数据结构",
    "LIFO": "算法与数据结构",
    "单调栈": "算法与数据结构",
    "Undo": "算法与数据结构",
    "UI返回栈": "算法与数据结构",
    "队列": "算法与数据结构",
    "FIFO": "算法与数据结构",
    "循环队列": "算法与数据结构",
    "BFS": "算法与数据结构",
    "图算法": "算法与数据结构",
    "图论": "算法与数据结构",
    "设计算法": "算法与数据结构",
    "算法设计": "算法与数据结构",
    "KMP": "算法与数据结构",
    "Rabin-Karp": "算法与数据结构",
    "Manacher": "算法与数据结构",
    "滑动窗口": "算法与数据结构",

    # ---- 数学 ----
    "向量运算": "数学基础",
    "射线检测": "数学基础",
    "LayerMask": "数学基础",
    "NonAlloc": "数学基础",
    "三角函数": "数学基础",
    "点积": "数学基础",
    "查表": "数学基础",
    "向量": "数学基础",
    "四元数": "数学基础",
    "旋转": "数学基础",
    "欧拉角": "数学基础",
    "姿态插值": "数学基础",
    "Unity数学": "数学基础",
    "浮点误差": "数学基础",
    "游戏Bug": "数学基础",
    "容差比较": "数学基础",
    "矩阵运算": "数学基础",
    "Shader": "图形学",
    "矩阵变换": "数学基础",
    "几何算法": "数学基础",
    "投影": "数学基础",
    "反射": "数学基础",
    "距离计算": "数学基础",
    "贝塞尔曲线": "数学基础",
    "AABB": "数学基础",
    "Compute Shader": "数学基础",
    "物理稳定性": "数学基础",

    # ---- UGUI 细化 ----
    "DrawCall": "UGUI",
    "图集优化": "UGUI",
    "材质合批": "UGUI",
    "Sprite Atlas": "UGUI",
    "TextMeshPro": "UGUI",
    "合批": "UGUI",
    "纹理压缩": "UGUI",
    "Overdraw": "UGUI",
    "Fill Rate": "UGUI",
    "Graphic Raycaster": "UGUI",
    "Frame Debugger": "UGUI",
    "LayoutGroup": "UGUI",
    "RectTransform": "UGUI",
    "动态列表": "UGUI",
    "节点复用": "UL列表",
    "滚动优化": "UL列表",
    "UI列表": "UL列表",
    "虚拟化渲染": "UL列表",
    "UI Rebuild": "UGUI",
    "布局优化": "UGUI",
    "文本刷新": "UGUI",
    "Mask": "UGUI",
    "Profiler": "性能分析",
    "性能回归": "UGUI",

    # ---- 蓝点系统 ----
    "红点系统": "红点系统",
    "脏标记": "红点系统",
    "依赖图": "红点系统",

    # ---- To keep ----
    "MVVM": "MVVM",
    "ViewModel": "MVVM",
    "数据绑定": "MVVM",
    "命令": "MVVM",
    "命令模式": "MVVM",
    "ReactiveCommand": "MVVM",
    "ReactiveProperty": "MVVM",
    "状态管理": "MVVM",
    "响应式架构": "MVVM",
    "可测试性": "MVVM",
    "响应式编程": "UniRx",
    "状态治理": "UniRx",
    "订阅管理": "UniRx",
    "GC控制": "UniRx",
    "消息分发": "UniRx",
    "CombineLatest": "UniRx",
    "Merge": "UniRx",
    "SelectMany": "UniRx",
    "RetryWhen": "UniRx",
    "AddTo": "UniRx",
    "CompositeDisposable": "UniRx",
    "场景切换": "UniRx",
    "异步交互": "UniRx",
    "对象池": "UniRx",
    "差量更新": "UniRx",
    "稳定身份": "UniRx",
    "Item绑定": "UniRx",
    "高频流": "UniRx",
    "批处理": "UniRx",
    "操作符": "UniRx",
    "自动化流程": "多Agent系统",
    "编辑器工具": "C#",
    "自动注册": "C#",
    "生命周期管理": "C#",
    "闭包": "C#",
    "LINQ": "C#",
    "foreach": "C#",
    "线程安全": "C#",
    "lock": "C#",
    "Interlocked": "C#",
    "ConcurrentQueue": "C#",
    "UniTask高级": "UniTask",
    "异步": "异步编程",
    "Unity生命周期": "Unity",
    "PlayerLoop": "Unity",
    "Unity工具链": "Unity",
    "工程化": "Unity",
    "跨引擎迁移": "引擎迁移",
    "工业化开发": "Unity",
    "配置驱动": "Unity",
    "抽象设计": "Unity",
    "崩坏星穹铁道": "Unity",
    "小雅整理": None,  # 这是一个 source 信息，不是 tag
}

# 一些特定的 tag 需要保留原样（不映射）
# 这些 tag 本身就够标准了
STANDARD_TAGS = {
    # 高频且标准
    "Unity", "C#", "UniRx", "ECS", "UGUI", "Unreal Engine",
    "AI编程", "多Agent系统", "事件总线", "架构设计",
    "性能优化", "数学基础", "资源管理", "对象池",
    "工程治理", "职业发展", "物理系统", "引擎迁移",
    "算法与数据结构", "Job System", "UniTask", "MVVM",
    "热更新", "红点系统", "UI架构", "图形学",
    "浏览器渲染", "Luban", "代码生成",
    "KiraFramework",
    # 文档元数据
    "技术文档", "知识库", "游戏开发", "工程实践", "正式文档",
    "异步编程", "协程编程", "UL列表", "网络系统",
    "文档总览", "性能分析", "异常处理", "数据结构", "复杂度",
    "缓存策略", "生命周期", "项目管理", "系统设计",
}

# 黑名单 tag — 这些太泛或内部用，直接移除
BLACKLIST_TAGS = {
    "小雅整理",
}


def is_excluded(fpath):
    """检查文件是否应排除"""
    rel = str(fpath.relative_to(ROOT)).replace("\\", "/")
    for pat in EXCLUDE_PATTERNS:
        if re.search(pat, rel):
            return True
    return False


def extract_tags_from_file(fpath):
    """从 .md 文件元数据块中提取 tag 行，返回 (line_index, raw_tag_str) 或 None"""
    with open(fpath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    for i, line in enumerate(lines):
        # 匹配 "- **标签：** tag1, tag2" 或 "- 标签：tag1, tag2"
        stripped = line.strip()
        m = re.match(r"^-\s*\*{0,2}标签\*{0,2}[:：]\s*(.*)", stripped)
        if m:
            raw = m.group(1).strip()
            # 去掉可能的 ** 残留
            raw = raw.replace("**", "").strip()
            return i, raw
    return None, None


def parse_tags(raw_tag_str):
    """解析 tag 字符串为 tag 列表"""
    # 分隔符可以是中文逗号、英文逗号、顿号
    raw = re.split(r"[，、,]", raw_tag_str)
    tags = []
    for t in raw:
        t = t.strip()
        if t:
            tags.append(t)
    return tags


def normalize_tag(tag):
    """将 tag 归并到标准 tag"""
    # 先去两端空白
    tag = tag.strip()

    # 黑名单直接移除
    if tag in BLACKLIST_TAGS:
        return None

    # 已经是标准 tag
    if tag in STANDARD_TAGS:
        return tag

    # 查映射表
    if tag in TAG_MERGE_MAP:
        result = TAG_MERGE_MAP[tag]
        if result is None:
            return None  # 移除
        return result

    # 未识别 — 保留原样（打印警告）
    return tag


def scan_all_tags(apply_fix=False):
    """
    扫描所有文档的 tag，返回统计信息和修改记录。
    如果 apply_fix=True，直接修改文件内容。
    """
    md_files = list(ROOT.rglob("*.md"))
    md_files = [f for f in md_files if not is_excluded(f)]
    md_files.sort()

    all_original_tags = Counter()
    all_normalized_tags = Counter()
    file_tag_changes = []  # [(rel_path, old_tags, new_tags)]
    modified_count = 0

    for fpath in md_files:
        rel = str(fpath.relative_to(ROOT)).replace("\\", "/")
        line_no, raw_tag_str = extract_tags_from_file(fpath)

        if raw_tag_str is None:
            print(f"  [跳过] {rel} — 无 tag 行")
            continue

        original_tags = parse_tags(raw_tag_str)

        # 归并
        new_tags = []
        removed_tags = []
        for t in original_tags:
            nt = normalize_tag(t)
            if nt is None:
                removed_tags.append(t)
            else:
                new_tags.append(nt)

        # 去重但保持顺序
        seen = set()
        deduped_tags = []
        for t in new_tags:
            if t not in seen:
                seen.add(t)
                deduped_tags.append(t)

        # 统计
        for t in original_tags:
            all_original_tags[t] += 1
        for t in deduped_tags:
            all_normalized_tags[t] += 1

        if set(original_tags) != set(deduped_tags) or (
            apply_fix and len(original_tags) != len(deduped_tags)
        ):
            file_tag_changes.append((rel, original_tags, deduped_tags, removed_tags))

            if apply_fix:
                # 读取文件，替换 tag 行
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()

                old_line = lines = None
                with open(fpath, "r", encoding="utf-8") as f:
                    lines = f.readlines()

                old_line_text = lines[line_no]

                # 重建新 tag 行，保持原始格式
                new_tag_str = "、".join(deduped_tags)
                
                # 判断原始行的格式
                has_bold = "**标签" in old_line_text
                indent = old_line_text[:len(old_line_text) - len(old_line_text.lstrip())]
                
                if has_bold:
                    new_line = f"{indent}- **标签：** {new_tag_str}\n"
                else:
                    new_line = f"{indent}- 标签：{new_tag_str}\n"

                # 替换
                content = content.replace(old_line_text, new_line, 1)
                with open(fpath, "w", encoding="utf-8") as f:
                    f.write(content)

                modified_count += 1
                print(f"  [修改] {rel}")
                print(f"    原: {', '.join(original_tags)}")
                print(f"    新: {', '.join(deduped_tags)}")
                if removed_tags:
                    print(f"    移除: {', '.join(removed_tags)}")

    return all_original_tags, all_normalized_tags, file_tag_changes, modified_count


def print_report(original_counter, normalized_counter, changes, modified_count):
    """打印统计报告"""
    print("\n" + "=" * 80)
    print("TAG 归并统计报告")
    print("=" * 80)

    print(f"\n📊 原始 tag 总数: {sum(original_counter.values())}")
    print(f"    去重 tag 种数: {len(original_counter)}")
    print(f"📊 归并后 tag 总数: {sum(normalized_counter.values())}")
    print(f"    去重 tag 种数: {len(normalized_counter)}")

    print(f"\n📋 受影响的文档数: {len(changes)}")
    print(f"    实际修改的文档数: {modified_count}")

    print(f"\n📈 高频原始 tag (Top 30):")
    for tag, cnt in original_counter.most_common(30):
        norm = normalize_tag(tag)
        print(f"    {cnt:3d}  {tag}  →  {norm if norm else '(移除)'}")

    print(f"\n📈 归并后高频 tag (Top 30):")
    for tag, cnt in normalized_counter.most_common(30):
        print(f"    {cnt:3d}  {tag}")

    print(f"\n📝 修改详情:")
    for rel, old, new, removed in changes:
        print(f"  📄 {rel}")
        print(f"    原 tags: {', '.join(old)}")
        print(f"    新 tags: {', '.join(new)}")
        if removed:
            print(f"    移除: {', '.join(removed)}")
        print()


def main():
    import sys

    mode = "scan"
    if len(sys.argv) > 1 and sys.argv[1] in ("--apply", "-a"):
        mode = "apply"

    print("=" * 80)
    print("Tech-Docs Tag 归并工具")
    print(f"模式: {'🔧 应用修改' if mode == 'apply' else '🔍 仅扫描'}")
    print("=" * 80)

    original_tags, normalized_tags, changes, modified = scan_all_tags(apply_fix=(mode == "apply"))
    print_report(original_tags, normalized_tags, changes, modified)

    # 输出标准化后的 tags.json（供我以后写文档时参考）
    sorted_tags = sorted(normalized_tags.keys())
    tags_dict = {
        "tags": sorted_tags,
        "tag_count": len(sorted_tags),
        "total_occurrences": sum(normalized_tags.values()),
        "generated_at": __import__("datetime").datetime.now().isoformat(),
    }

    output_path = ROOT / "tag_reference.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(tags_dict, f, ensure_ascii=False, indent=2)
    print(f"\n📁 Tag 参考字典已输出: {output_path}")

    # 也写到工作区一份供我直接读
    ws_path = Path(r"C:\Users\11764\.copaw\workspaces\DocManager\tag_reference.json")
    with open(ws_path, "w", encoding="utf-8") as f:
        json.dump(tags_dict, f, ensure_ascii=False, indent=2)
    print(f"📁 已复制到工作区: {ws_path}")

    print("\n✅ 完成!")


if __name__ == "__main__":
    main()
