# Unity VS UE：移动端优化策略

## 摘要
 > 目标：在**移动硬件**的功耗与带宽天花板下，系统性地做三件事——**按设备分档（配置）**、**把贵的画质算术换成更便宜的近似**、**把无效/冗余资产从包体与运行时里“剔”出去**。本文从 UE 的 Device Profiles、移动渲染路径与纹理压缩讲起，再对比 Unity 的 Quality Settings、贴图压缩与裁剪/变体管理，最后附迁移对照表与可落地的配置片段。 -...

## 正文



> 目标：在**移动硬件**的功耗与带宽天花板下，系统性地做三件事——**按设备分档（配置）**、**把贵的画质算术换成更便宜的近似**、**把无效/冗余资产从包体与运行时里“剔”出去**。本文从 UE 的 Device Profiles、移动渲染路径与纹理压缩讲起，再对比 Unity 的 Quality Settings、贴图压缩与裁剪/变体管理，最后附迁移对照表与可落地的配置片段。

----------

## 引言：移动平台的三座大山

1.  **像素/分辨率**：分辨率越高，片元着色成本几何上升；
    
2.  **带宽/缓存**：贴图体量与格式直连显存、带宽与发热；
    
3.  **包体/冷启动**：资产体积与变体膨胀导致安装包大、IO 慢、首次加载长。  
    因此移动端优化的优先级通常是：**分辨率/缩放 → 贴图压缩 → 关特效/降开销着色 → 剪裁资源**。UE 官方建议用 **Device Profiles + Scalability** 按机型分档，Unity 则用 **Quality Settings** 档位化切图；两者都强调选对**移动渲染路径**与**压缩格式**是“省电减热”的第一步。
    

----------

## Unreal 移动端优化

### 1) 设备分档：Device Profiles（强烈建议）

UE 推荐在项目里添加 `Config/DefaultDeviceProfiles.ini`，按**GPU 家族/机型**选择 CVars（控制台变量）与可伸缩项（Scalability）以实现**一机一策**。示例：

```ini
; Config/DefaultDeviceProfiles.ini
[Android DeviceProfile]
DeviceType=Android
BaseProfileName=
+CVars=r.MobileContentScaleFactor=0           ; 0 = 使用设备原生分辨率（与 DPI 曲线搭配）
+CVars=sg.ViewDistanceQuality=2               ; 0..3
+CVars=sg.ShadowQuality=1
+CVars=sg.PostProcessQuality=1

[Android_Low DeviceProfile]
DeviceType=Android
BaseProfileName=Android
+CVars=r.MobileContentScaleFactor=0.75        ; 统一缩放分辨率以控热/省功耗
+CVars=r.ParticleLODBias=1                    ; 粒子 LOD 偏置升高，减少粒子量
+CVars=fx.MaxCPUParticlesPerEmitter=50

[Android_High DeviceProfile]
DeviceType=Android
BaseProfileName=Android
+CVars=r.MobileContentScaleFactor=0           ; 高端机跑原生分辨率
+CVars=r.ParticleLODBias=0
+CVars=fx.MaxCPUParticlesPerEmitter=1000

```

-   **Device Profiles** 是 UE 官方推荐的按设备定制方式；在 Android 上甚至内置按 GPU 家族匹配的规则，直接在对应 Profile 里覆写即可。
    
-   **r.MobileContentScaleFactor** 控制**渲染内容缩放**，可快速按档位拉开分辨率/发热差距（0 表示使用原生分辨率；也可设为 0.75/1.25 这类比例值）。
    

> 小贴士：运行时也可用可伸缩命令快速切档，例如 `sg.ShadowQuality 0/1/2/3`、`sg.TextureQuality 0..3` 做“发热降档”或“画质自适应”。

### 2) 渲染 API 与移动着色路径

-   **Vulkan / OpenGL ES3.1**：UE 在 Android 上同时支持 Vulkan 与 GLES3.1；Vulkan 具有更低的 CPU 驱动开销与更完整的特性集，适合高端机与重场景，但兼容性/成熟度需要自行评估。
    
-   **Mobile 渲染模式**：UE 针对移动提供了 **Forward**、**Mobile Deferred**（5.x 引入）等着色模式；项目设置中切换，结合 MSAA/移动光照限制来平衡质量与成本。
    

### 3) 贴图压缩与包体控制

-   **ASTC / ETC2**：移动平台常用 ASTC、ETC2 等压缩。选择不当会出现“硬件不支持/回退/质量差”问题；同时，**打包勾选多种纹理格式会让纹理被重复COOK**，包体急剧增大（为多 SoC 家族同时发版时需谨慎）。
    
-   **实践建议**：
    
    -   以 **ASTC** 为主（高端/中端 Android 与 iOS Metal 支持良好），超低端仅在必要时考虑 ETC2 覆盖；
        
    -   通过 **Device Profiles** 或打包配置区分渠道包，避免“一包囊括所有格式”。
        

----------

## Unity 移动端优化

### 1) 画质档位：Quality Settings

Unity 的 **Quality Settings** 允许为各平台定义多档画质（阴影级别、各向异性、纹理质量等），运行时可切换以适配不同设备的性能与温度表现：

```csharp
// 运行时切换到 "MobileLow" 档
QualitySettings.SetQualityLevel(
    QualitySettings.names.ToList().IndexOf("MobileLow"), applyExpensiveChanges: true);

```

> 官方文档明确建议在移动设备或旧硬件上使用较低画质档，以免拖累帧率。

### 2) 纹理压缩与图集

-   **Android 压缩**：可在 **Player Settings** 或 **Texture Importer** 指定默认压缩目标（ASTC、ETC2），并在具体贴图上做覆盖（不同平台/分辨率/Mipmap）。
    
-   **ASTC 指南**：针对不同内容选择合适的 ASTC block（如 6×6/8×8），在肉眼无差前提下尽可能提高压缩率，显著降低带宽/显存与发热。
    
-   **Sprite Atlas（UI/2D）**：用 **Sprite Atlas** 减少批次、降低内存碎片，运行时通过引用同一图集的 Sprite 自动合批：
    
    ```csharp
    using UnityEngine.U2D;
    var atlas = /* 引用你的 *.spriteatlas */;
    Sprite[] batch = new Sprite[atlas.spriteCount];
    atlas.GetSprites(batch);  // 运行时按需取图
    
    ```
    
    创建：`Assets > Create > Sprite Atlas`，再把需要的 Sprite/文件夹拖入即可。
    

### 3) 裁剪与精简（包体/启动时长）

-   **Managed Code Stripping（托管裁剪）**：在 Player Settings 配置裁剪级别；通过 `link.xml` 或特性标记保留反射/动态实例化用到的类型，避免“线上崩在反射”。  
    `Assets/link.xml` 示例：
    
    ```xml
    <linker>
      <assembly fullname="MyGame.Runtime">
        <type fullname="MyGame.DynamicFactory" preserve="all"/>
      </assembly>
    </linker>
    
    ```
    
    官方文档系统说明了裁剪工作方式与 `link.xml` 语法。
    
-   **Shader Variant Stripping（变体剔除）**：大量关键词与 `multi_compile` 会让**编译时间、包体与启动加载**爆炸。使用 **Shader Stripping**、**ShaderVariantCollection**、以及在 **Graphics Settings** 关闭**不使用的“Always Included Shaders”**，能显著降低体量：
    
    -   优先用 `shader_feature(_local)` 替代 `multi_compile`；
        
    -   在 Editor 构建回调里实现 `IPreprocessShaders.OnProcessShader` 做定制剔除。
        
    -   Unity 近年也持续强化变体剔除流程与工具。
        
-   **（可选）SRP Batcher 与 Instancing 权衡**：在 URP/HDRP 下，**SRP Batcher** 能显著降低 CPU 提交成本，但与 **GPU Instancing** 侧重点不同，需基于项目数据侧评估取舍。
    

----------

## 补充：通用“省电降热”手段（两引擎通吃）

-   **分辨率缩放/渲染比例**：UE 用 `r.MobileContentScaleFactor` 或运行时 Scalability；Unity 用不同 Quality 档 + 动态分辨率（SRP）/RenderScale。
    
-   **贴图降级**：远距离 `MipBias`、低端机使用更高压缩比的 ASTC block。
    
-   **少开后处理**：先关掉代价高的泛光/景深/屏幕空间反射等，再逐项回开做 A/B。
    
-   **批量/实例化**：减少状态切换与提交开销（上一篇已有详解）。
    
-   **热管理策略**：帧时间/温度阈值触发“降档”（分辨率、阴影、粒子密度联动）。
    

----------

## 迁移对照与落地清单

|目标/模块|Unity 做法|Unreal 做法|迁移要点|
|-|-|-|-|
|**按设备分档**|**Quality Settings** 预设多档，运行时 `SetQualityLevel` 切换|**Device Profiles** + Scalability（`DefaultDeviceProfiles.ini` + CVars）|Unity 的“画质档”→ UE 的“设备档”；把阴影/后处理/纹理质量映射到对应 CVars。|
|**分辨率/渲染比例**|档位化分辨率或 SRP 动态分辨率|`r.MobileContentScaleFactor`/sg.* 成组调参|以 ContentScaleFactor 为主开关做“发热降档”。|
|**移动渲染路径**|URP/HDRP 移动配置；关闭高代价特性|Mobile Forward / Mobile Deferred（Android：Vulkan 或 GLES3.1）|高端机优先 Vulkan；评估 MSAA/阴影/透明等在移动路径下的代价。|
|**贴图压缩**|Android：ASTC/ETC2；按资源粒度覆盖|Android/iOS：ASTC/ETC2；避免“一包多格式重复COOK”|按渠道/SoC 拆包或 Profile 区分，别把所有压缩一起勾上导致包体翻倍。|
|**UI/2D 合批**|**Sprite Atlas** & 动态装载|（UE 以材质/合并/实例化为主）|UI 项目迁移 UE 前先做图集整合思路梳理。|
|**裁剪与变体**|**Managed Stripping** + `link.xml`；**Shader Variant Stripping**|（UE 侧以“仅COOK用到的资产/平台”控制体量）|先把 Unity 的反射与 Addressables 动态加载点列清单，写好 `link.xml` 与变体剔除规则。|

----------

## 快速模板（复制即用）

**Unity – 低档画质切换 & ASTC 默认**

```csharp
// 运行时切档
QualitySettings.SetQualityLevel(
    Array.IndexOf(QualitySettings.names, "MobileLow"), true);
// 针对关键大贴图在 Importer 中覆盖：Android/Override -> ASTC 8x8

```

**Unity – link.xml（反射安全）**

```xml
<linker>
  <assembly fullname="Newtonsoft.Json">
    <type fullname="Newtonsoft.Json.Linq.JObject" preserve="all"/>
  </assembly>
  <assembly fullname="MyGame.Runtime">
    <type fullname="MyGame.Factory" preserve="all"/>
  </assembly>
</linker>

```

**Unreal – `DefaultDeviceProfiles.ini`（高/低档）**

```ini
[Android_Low DeviceProfile]
DeviceType=Android
BaseProfileName=Android
+CVars=r.MobileContentScaleFactor=0.75
+CVars=sg.ShadowQuality=0
+CVars=sg.PostProcessQuality=0
+CVars=r.ParticleLODBias=1
+CVars=fx.MaxCPUParticlesPerEmitter=50

[Android_High DeviceProfile]
DeviceType=Android
BaseProfileName=Android
+CVars=r.MobileContentScaleFactor=0
+CVars=sg.ShadowQuality=2
+CVars=sg.PostProcessQuality=2

```

**Unreal – 选择 Vulkan**

> Project Settings → Platforms/Android → Graphics API 勾选 **Vulkan**（保留 GLES3.1 兜底按需），并按机型测试。

----------

## 总结

-   **UE**：用 **Device Profiles** 把“分辨率/阴影/粒子/纹理池”按硬件分层，一键联动 **CVars**；移动路径可在 **Forward/Mobile Deferred** 与 **Vulkan/GLES3.1** 间按机型选择；纹理压缩以 **ASTC/ETC2** 为主，**不要**在一个包里同时COOK多套格式。
    
-   **Unity**：以 **Quality Settings** 做档位，用 **ASTC/ETC2** 与 **Sprite Atlas** 控制带宽/批次；用 **Managed Stripping + link.xml** 与 **Shader Variant Stripping** 给包体和首次加载“放血减负”。
    

思路是一致的：**先按设备“分档”，再把重活“减法”，最后把冗余“剔除”**。只要把这三步做扎实，移动端的帧率、发热与包体都会同时向你低头。


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 性能优化
- **标签：** unity, ue, 优化
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*