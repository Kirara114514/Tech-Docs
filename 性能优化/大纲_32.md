### 文章一：纹理导入设置与压缩技术

-   **主题拆分**：深入讲解Unity中纹理（贴图）的导入选项，以及各种纹理压缩格式的特点和适用平台。帮助开发者为不同平台和用途选择最优的纹理设置，以兼顾画质和性能（内存、包体）。
    
-   **内容概览**:
    
    -   **纹理导入设置总览**：Unity中TextureImporter提供多种选项：Max Size、Compression、Format、MipMaps、Filter Mode、Wrap Mode等。逐一解释这些选项对性能和质量的影响。
        
        -   **Max Size**：导入时可以强制将贴图缩放到不超过某尺寸（2的幂）。较小MaxSize可明显减少内存和包体，但画质下降。建议UI贴图等根据设计分辨率设定合适上限，不要一律4K。**经验**：手机UI通常不超过2048，普通Sprite512或1024足够，3D模型贴图根据模型所占屏幕决定。
            
        -   **Compression**：分为**无压缩（RGBA32等）**和**有压缩**。无压缩占用大、质量最好；有压缩能大幅降低显存和存储。Unity提供**Crunch压缩**选项（针对ETC/DXT可极大减小apk体积，但加载时需解压耗时）。介绍Crunch原理和使用场景（适合很多静态资源下载缓慢但可牺牲加载时间的情况）。
            
        -   **Generate MipMaps**：开启MipMap会占用约33%额外内存，但避免远处纹理闪烁提升渲染质量。对3D场景贴图应开启，对于UI贴图/2D元素贴图（永远按原尺寸显示）可关闭省内存[docs.unity3d.com](https://docs.unity3d.com/cn/2017.4/Manual/HOWTO-ArtAssetBestPracticeGuide.html#:~:text=%E7%BA%B9%E7%90%86)。
            
        -   **Filter Mode**：Bilinear/Trilinear/Point，影响采样质量与性能。移动端基本都能用Bilinear, Trilinear在MipMap过渡更好但稍贵；UI像素画等用Point避免模糊。
            
        -   **Wrap Mode**：Repeat/Clamp，主要影响特殊用法如平铺纹理。性能影响不大但错误设置会导致视觉接缝。
            
    -   **纹理压缩格式**：重点介绍各种格式及平台：
        
        -   **ETC1/ETC2**：Android标准格式。ETC1不支持Alpha，只能RGB；ETC2支持Alpha[blog.csdn.net](https://blog.csdn.net/weixin_38813436/article/details/106522200#:~:text=ETC2%EF%BC%9AETC2%E6%8B%93%E5%B1%95%E4%BA%86ETC1%2C%E6%8F%90%E4%BE%9B%E4%BA%86%E6%9B%B4%E9%AB%98%E8%B4%A8%E9%87%8F%E7%9A%84RGB%E5%92%8CRGBA%EF%BC%8C%E5%8D%95%E9%80%9A%E9%81%93%28R11%29%E5%92%8C%E5%8F%8C%E9%80%9A%E9%81%93%28RG11%29%E6%95%B0%E6%8D%AE%E7%9A%84%E5%8E%8B%E7%BC%A9%EF%BC%88%E9%9C%80OpenGL%20ES%203)。大多数Android设备支持ETC2 (OpenGL ES3.0+)[blog.csdn.net](https://blog.csdn.net/weixin_38813436/article/details/106522200#:~:text=ETC2%EF%BC%9AETC2%E6%8B%93%E5%B1%95%E4%BA%86ETC1%2C%E6%8F%90%E4%BE%9B%E4%BA%86%E6%9B%B4%E9%AB%98%E8%B4%A8%E9%87%8F%E7%9A%84RGB%E5%92%8CRGBA%EF%BC%8C%E5%8D%95%E9%80%9A%E9%81%93%28R11%29%E5%92%8C%E5%8F%8C%E9%80%9A%E9%81%93%28RG11%29%E6%95%B0%E6%8D%AE%E7%9A%84%E5%8E%8B%E7%BC%A9%EF%BC%88%E9%9C%80OpenGL%20ES%203)。大小：4bpp（bits per pixel）所以每像素0.5字节。画质中等，对简单图很好，对渐变图像有块状。
            
        -   **ASTC**：现代格式，**自适应可变块**，可在4x4到12x12块尺寸选择[blog.csdn.net](https://blog.csdn.net/Thomas_YXQ/article/details/143477419#:~:text=,%E7%81%B5%E6%B4%BB%E6%80%A7%EF%BC%9AASTC%E5%8E%8B%E7%BC%A9%E5%88%86%E5%9D%97%E7%9A%84%E5%A4%A7%E5%B0%8F%E7%81%B5%E6%B4%BB%EF%BC%8C%E6%94%AF%E6%8C%81LDR%EF%BC%88%E4%BD%8E%E5%8A%A8%E6%80%81%E8%8C%83%E5%9B%B4%EF%BC%89%E3%80%81HDR%EF%BC%88%E9%AB%98%E5%8A%A8%E6%80%81%E8%8C%83%E5%9B%B4%EF%BC%89%E3%80%812D%E5%92%8C3D%E7%BA%B9%E7%90%86%E3%80%82%E6%AF%8F%E4%B8%AA%E5%9D%97%E6%9C%89%E7%AB%AF%E7%82%B9%E5%AF%B9%EF%BC%88endpoints%EF%BC%89%EF%BC%8C%E8%BF%99%E4%BA%9B%E7%AB%AF%E7%82%B9%E5%AF%B9%E4%B8%8D%E4%B8%80%20%E5%AE%9A%E6%98%AFRGBA%E7%9A%84%EF%BC%8C%E4%B9%9F%E5%8F%AF%E4%BB%A5%E6%98%AF%E9%83%A8%E5%88%86%E9%80%9A%E9%81%93%EF%BC%8C%E6%AF%94%E5%A6%82RG%E9%80%9A%E9%81%93%EF%BC%8C%E4%BB%8E%E8%80%8C%E5%8F%AF%E4%BB%A5%E5%AF%B9%E6%B3%95%E7%BA%BF%E8%B4%B4%E5%9B%BE%E8%BF%9B%E8%A1%8C%E6%9B%B4%E5%A5%BD%E7%9A%84%E5%8E%8B%E7%BC%A9%E3%80%82)。4x4质量最高压缩率低（类似4bpp），12x12压缩率高质量低。优势是对不同类型纹理灵活调整，如法线贴图可用5x5或4x4获得好效果[blog.csdn.net](https://blog.csdn.net/Thomas_YXQ/article/details/143477419#:~:text=2)。ASTC得到广泛采用，Android 8.0以上和iOS A8以上设备普遍支持[blog.csdn.net](https://blog.csdn.net/Thomas_YXQ/article/details/143477419#:~:text=)。**推荐**：如果项目最低设备支持ASTC，用ASTC几乎是移动端最优选择[blog.csdn.net](https://blog.csdn.net/Thomas_YXQ/article/details/143477419#:~:text=)。Unity支持ASTC通过TextureImporter设置具体格式 (如 ASTC_6x6 等) 或自动选择Quality。
            
        -   **PVRTC**：老牌格式，**iOS独占**(Apple设备必备)。支持RGB/A，有2bpp和4bpp模式。2bpp压缩率高但画质差(马赛克明显)，4bpp稍好。由于ASTC逐步取代，PVRTC主要在老设备(iPhone5及以前)或需要兼容非常广时用[docs.unity3d.com](https://docs.unity3d.com/cn/2020.1/Manual/class-TextureImporterOverride.html#:~:text=%E5%9C%A8iOS%20%E4%B8%8A%EF%BC%8CUnity%20%E7%9A%84%E9%BB%98%E8%AE%A4%E7%BA%B9%E7%90%86%E5%8E%8B%E7%BC%A9%E6%A0%BC%E5%BC%8F%E6%98%AFPVRTC%EF%BC%8C%E4%BB%A5%E8%8E%B7%E5%BE%97%E5%B0%BD%E5%8F%AF%E8%83%BD%E5%B9%BF%E6%B3%9B%E7%9A%84%E5%85%BC%E5%AE%B9%E6%80%A7%E3%80%82ASTC%20%E6%98%AF%E9%A6%96%E9%80%89%EF%BC%8C%E4%BD%86%E5%9C%A8A7%20%E8%AE%BE%E5%A4%87%EF%BC%88%E7%AC%AC%E4%B8%80%E4%B8%AA%E6%94%AF%E6%8C%81Metal,%E7%9A%84%E8%AE%BE%E5%A4%87%EF%BC%89%E4%B8%8A%E4%B8%8D%E5%8F%97%E6%94%AF%E6%8C%81%EF%BC%8C%E5%B0%86%E5%9C%A8%E8%BF%90%E8%A1%8C%E6%97%B6%E8%A7%A3%E5%8E%8B%E7%BC%A9%E3%80%82%20%E6%9C%89%E5%85%B3)。**注意**：在A7设备上ASTC不支持会fallback解压[docs.unity3d.com](https://docs.unity3d.com/cn/2020.1/Manual/class-TextureImporterOverride.html#:~:text=%E5%9C%A8iOS%20%E4%B8%8A%EF%BC%8CUnity%20%E7%9A%84%E9%BB%98%E8%AE%A4%E7%BA%B9%E7%90%86%E5%8E%8B%E7%BC%A9%E6%A0%BC%E5%BC%8F%E6%98%AFPVRTC%EF%BC%8C%E4%BB%A5%E8%8E%B7%E5%BE%97%E5%B0%BD%E5%8F%AF%E8%83%BD%E5%B9%BF%E6%B3%9B%E7%9A%84%E5%85%BC%E5%AE%B9%E6%80%A7%E3%80%82ASTC%20%E6%98%AF%E9%A6%96%E9%80%89%EF%BC%8C%E4%BD%86%E5%9C%A8A7%20%E8%AE%BE%E5%A4%87%EF%BC%88%E7%AC%AC%E4%B8%80%E4%B8%AA%E6%94%AF%E6%8C%81Metal,%E7%9A%84%E8%AE%BE%E5%A4%87%EF%BC%89%E4%B8%8A%E4%B8%8D%E5%8F%97%E6%94%AF%E6%8C%81%EF%BC%8C%E5%B0%86%E5%9C%A8%E8%BF%90%E8%A1%8C%E6%97%B6%E8%A7%A3%E5%8E%8B%E7%BC%A9%E3%80%82%20%E6%9C%89%E5%85%B3)，所以iOS必须提供PVRTC或ETC2作为后备。Unity会根据Graphics API自动选择默认PVRTC[docs.unity3d.com](https://docs.unity3d.com/cn/2020.1/Manual/class-TextureImporterOverride.html#:~:text=%E5%9C%A8iOS%20%E4%B8%8A%EF%BC%8CUnity%20%E7%9A%84%E9%BB%98%E8%AE%A4%E7%BA%B9%E7%90%86%E5%8E%8B%E7%BC%A9%E6%A0%BC%E5%BC%8F%E6%98%AFPVRTC%EF%BC%8C%E4%BB%A5%E8%8E%B7%E5%BE%97%E5%B0%BD%E5%8F%AF%E8%83%BD%E5%B9%BF%E6%B3%9B%E7%9A%84%E5%85%BC%E5%AE%B9%E6%80%A7%E3%80%82ASTC%20%E6%98%AF%E9%A6%96%E9%80%89%EF%BC%8C%E4%BD%86%E5%9C%A8A7%20%E8%AE%BE%E5%A4%87%EF%BC%88%E7%AC%AC%E4%B8%80%E4%B8%AA%E6%94%AF%E6%8C%81Metal,%E7%9A%84%E8%AE%BE%E5%A4%87%EF%BC%89%E4%B8%8A%E4%B8%8D%E5%8F%97%E6%94%AF%E6%8C%81%EF%BC%8C%E5%B0%86%E5%9C%A8%E8%BF%90%E8%A1%8C%E6%97%B6%E8%A7%A3%E5%8E%8B%E7%BC%A9%E3%80%82%20%E6%9C%89%E5%85%B3)。
            
        -   **DXT (BC1-BC7)**：PC/Console标准压缩格式。DXT1无Alpha(BC1), DXT5有Alpha(BC3)等。显存占用也是4bpp常见。Unity的 "Compressed" 在Standalone默认就是DXT。质量对高清屏幕足够，但对渐变可能有色带。DXT系不直接支持移动GPU，所以不用于移动。Switch支持BCn。
            
        -   **RGBA16/RGBA32**（无压缩）：16位每像素(半浮点)/32位(真彩)。只在高品质需求时用，比如法线贴图有带符号精度要求可能用RGBA32，或UI需要绝对锐利不失真用RGBA32。否则一般用压缩。
            
        -   **Crunch**：Unity独有的方法，对上述格式再进行一种类似zip的压缩以减小文件体积caiyanpei.com。Crunch纹理在安装包占用更小，但加载时需要先解压到压缩格式再上传GPU，所以**加载时间变长**。适合下载型游戏减流量，或大量资源备用的场景。要根据情况决定是否开启Crunch。
            
        -   **平台Override**：Unity允许为每个平台（Standalone, Android, iOS etc）设置不同格式。应该充分利用。比如可以在TextureImporter里设置：Android默认ASTC 6x6，Fallback ETC2 for openGLES2; iOS默认ASTC 4x4 for A8+, fallback PVRTC for older. Unity没自动做到那么细，需要我们合理配置。可以编写菜单一键切换全项目平台设置或使用预置(preset)。
            
    -   **质量和性能比较**: 引用一些已知数据：
        
        -   ASTC在相同bitrate下通常画质优于ETC2/PVRTC，因为算法先进。同样文件大小下ASTC能更好保留细节[blog.csdn.net](https://blog.csdn.net/Thomas_YXQ/article/details/143477419#:~:text=,%E7%81%B5%E6%B4%BB%E6%80%A7%EF%BC%9AASTC%E5%8E%8B%E7%BC%A9%E5%88%86%E5%9D%97%E7%9A%84%E5%A4%A7%E5%B0%8F%E7%81%B5%E6%B4%BB%EF%BC%8C%E6%94%AF%E6%8C%81LDR%EF%BC%88%E4%BD%8E%E5%8A%A8%E6%80%81%E8%8C%83%E5%9B%B4%EF%BC%89%E3%80%81HDR%EF%BC%88%E9%AB%98%E5%8A%A8%E6%80%81%E8%8C%83%E5%9B%B4%EF%BC%89%E3%80%812D%E5%92%8C3D%E7%BA%B9%E7%90%86%E3%80%82%E6%AF%8F%E4%B8%AA%E5%9D%97%E6%9C%89%E7%AB%AF%E7%82%B9%E5%AF%B9%EF%BC%88endpoints%EF%BC%89%EF%BC%8C%E8%BF%99%E4%BA%9B%E7%AB%AF%E7%82%B9%E5%AF%B9%E4%B8%8D%E4%B8%80%20%E5%AE%9A%E6%98%AFRGBA%E7%9A%84%EF%BC%8C%E4%B9%9F%E5%8F%AF%E4%BB%A5%E6%98%AF%E9%83%A8%E5%88%86%E9%80%9A%E9%81%93%EF%BC%8C%E6%AF%94%E5%A6%82RG%E9%80%9A%E9%81%93%EF%BC%8C%E4%BB%8E%E8%80%8C%E5%8F%AF%E4%BB%A5%E5%AF%B9%E6%B3%95%E7%BA%BF%E8%B4%B4%E5%9B%BE%E8%BF%9B%E8%A1%8C%E6%9B%B4%E5%A5%BD%E7%9A%84%E5%8E%8B%E7%BC%A9%E3%80%82)。
            
        -   PVRTC压缩对图像要求高（必须方块有特定模式），容易出现噪点。对真实感图像效果差，对卡通纯色块表现尚可。
            
        -   ETC2整体比PVRTC4好，但Alpha通道压缩的细节稍差(PVRTC4 RGBA有时候Alpha更清晰)。
            
        -   DXT与ETC2画质类似，但DXT1 Alpha只有1bit (cutout)模式无半透明。如果需要半透明要DXT5。
            
        -   ASTC解码需要更强硬件但现代设备OK。旧设备上ASTC解码fallback会导致纹理在内存以未压缩形式存在（大幅增加内存，必须避免[docs.unity3d.com](https://docs.unity3d.com/cn/2020.1/Manual/class-TextureImporterOverride.html#:~:text=%E5%9C%A8iOS%20%E4%B8%8A%EF%BC%8CUnity%20%E7%9A%84%E9%BB%98%E8%AE%A4%E7%BA%B9%E7%90%86%E5%8E%8B%E7%BC%A9%E6%A0%BC%E5%BC%8F%E6%98%AFPVRTC%EF%BC%8C%E4%BB%A5%E8%8E%B7%E5%BE%97%E5%B0%BD%E5%8F%AF%E8%83%BD%E5%B9%BF%E6%B3%9B%E7%9A%84%E5%85%BC%E5%AE%B9%E6%80%A7%E3%80%82ASTC%20%E6%98%AF%E9%A6%96%E9%80%89%EF%BC%8C%E4%BD%86%E5%9C%A8A7%20%E8%AE%BE%E5%A4%87%EF%BC%88%E7%AC%AC%E4%B8%80%E4%B8%AA%E6%94%AF%E6%8C%81Metal,%E7%9A%84%E8%AE%BE%E5%A4%87%EF%BC%89%E4%B8%8A%E4%B8%8D%E5%8F%97%E6%94%AF%E6%8C%81%EF%BC%8C%E5%B0%86%E5%9C%A8%E8%BF%90%E8%A1%8C%E6%97%B6%E8%A7%A3%E5%8E%8B%E7%BC%A9%E3%80%82%20%E6%9C%89%E5%85%B3)）。
            
        -   **内存对比**：一个1024x1024纹理：RGBA32占4MB，DXT5/ETC2 RGBA占0.5MB[zhuanlan.zhihu.com](https://zhuanlan.zhihu.com/p/113366420#:~:text=Unity5.2%E4%BB%A5%E5%90%8E%EF%BC%8C%E9%BB%98%E8%AE%A4%E7%9A%84%E5%8E%8B%E7%BC%A9%E6%A0%BC%E5%BC%8F%E4%B8%BAETC2%EF%BC%8CETC2%E6%94%AF%E6%8C%81%E9%80%8F%E6%98%8E%E9%80%9A%E9%81%93%EF%BC%8C%E5%AF%B9%E4%BA%8ERGB24%20bits%E7%9A%84%E8%B4%B4%E5%9B%BE%E5%8F%AF%E4%BB%A5%E9%80%89%E6%8B%A9%E5%8E%8B%E7%BC%A9%E4%B8%BARGB%20Compressed%20ETC2%204bits%EF%BC%8C%E4%B8%80%E5%BC%A01024,%EF%BC%9BRGBA32), ASTC 6x6介于0.5-1MB，PVRTC4 RGBA 0.5MB。可见压缩有8倍以上节省。
            
    -   **建议**:
        
        -   移动端优先ASTC，如需兼容非常旧设备再考虑ETC2/PVRTC fallback。Unity提供Automatic settings可尝试但最好手工确认。
            
        -   PC平台无忧，用DXT系列即可，除非做照片级画质可以用BC7（Unity 2017+支持BC7高品质格式，但要DX11+ GPU）。
            
        -   UI/Icon等重要细节纹理，可以选择低压缩或干脆不压缩，小图影响不大但清晰度提升明显（或使用**Alpha拆分**技巧，用RGB压缩+Alpha 8位两张组合[zhuanlan.zhihu.com](https://zhuanlan.zhihu.com/p/237940807#:~:text=%E5%8D%95%E4%BB%8E4bpp%E6%A8%A1%E5%BC%8F%E6%9D%A5%E7%9C%8B%EF%BC%8CPVRTC%E5%92%8CBC%E3%80%81ETC%E9%9D%9E%E5%B8%B8%E7%9B%B8%E4%BC%BC%EF%BC%8C%E9%83%BD%E6%9C%89%E4%B8%A4%E4%B8%AA%E9%A2%9C%E8%89%B2%E5%80%BC%EF%BC%8C%E4%BD%86%E5%9F%BA%E6%9C%AC%E6%80%9D%E6%83%B3%E5%8D%B4%E6%98%AF%E4%B8%8D%E5%90%8C%E7%9A%84%E3%80%82%20Unity%E5%87%A0%E7%A7%8DPVRTC%E7%9A%84%E7%BA%B9%E7%90%86%E5%8E%8B%E7%BC%A9%E6%A0%BC%E5%BC%8F%EF%BC%9A)如Alpha图单独存降低损失）。
            
        -   法线贴图选择**DXT5nm**（Unity自动处理，把YZ进Alpha和Green，减少DXT5的色损失）或者 ASTC专门块适配法线[blog.csdn.net](https://blog.csdn.net/Thomas_YXQ/article/details/143477419#:~:text=)。
            
-   **关键概念与技术**：MipMap计算, Block Compression fundamentals (like "4x4 texel block -> 8 bytes" for DXT), TextureImporter platform override.
    
-   **示例代码建议**:
    
    -   展示如何使用Editor脚本批量设置纹理格式：
        
        csharp
        
        复制编辑
        
        `foreach(var guid in Selection.assetGUIDs) { string path = AssetDatabase.GUIDToAssetPath(guid);
            TextureImporter imp = AssetImporter.GetAtPath(path) as TextureImporter; if(imp != null) {
                imp.textureType = TextureImporterType.Default;
                imp.maxTextureSize = 1024;
                imp.androidCompressionFormat = AndroidTextureFormat.ASTC_6x6;
                imp.SaveAndReimport();
            }
        }` 
        
        伪代码说明可以通过脚本强制统一设置，这对已有项目改优化很有用[blog.csdn.net](https://blog.csdn.net/Thomas_YXQ/article/details/143477419#:~:text=string%20assetPath%20%3D%20AssetDatabase,SaveAndReimport%28%29%3B)[blog.csdn.net](https://blog.csdn.net/Thomas_YXQ/article/details/143477419#:~:text=1.%20%E8%8F%9C%E5%8D%95%E9%A1%B9%EF%BC%9A%E9%80%9A%E8%BF%87%60%5BMenuItem%28,%E7%AD%89%EF%BC%8C%E5%8F%AF%E4%BB%A5%E6%A0%B9%E6%8D%AE%E9%9C%80%E8%A6%81%E9%80%89%E6%8B%A9%E3%80%82)。
        
    -   给出ASTC块大小选择的表格（文字描述）：如 "Alpha textures -> ASTC 5x5; HD detailed -> 4x4; Normal map -> 6x6 or 5x5; Large diffuse -> 8x8 or 10x10 if slight blurriness acceptable"。这参考[blog.csdn.net](https://blog.csdn.net/Thomas_YXQ/article/details/143477419#:~:text=2)数据。
        
-   **注意事项**:
    
    -   **美术导入流程**：要和美术约定导入规范，例如源美术文件PSD可以放Assets外，大项目最好**不直接用超大原始文件**。导出PNG或TGA到Assets，并应用正确Import设置。Unity虽支持导入PSD但会嵌入整图，包体压力大。可以将原图放仓库外或特殊文件夹，打包时Exclude。
        
    -   **平台测试**：每种压缩需要在真机测试。尤其ASTC，各种块大小需要实际看效果，可能需要针对某些纹理微调。有些纹理对压缩敏感（如含文字或UI)，可能不得不选更高质量格式。要树立“一种格式不适合所有纹理”的观念，分类调整。
        
    -   **内存和加载**：压缩格式减少GPU显存占用显著，但加载速度也要考虑。某些格式解码慢（PVRTC notoriously slow to encode, decode)，但一般不是大问题在GPU解码层。Crunch则主要影响CPU解压时间。所以下一篇也会提Mesh/texture优化对加载的影响。
        
    -   **sRGB vs Linear**：附带提及Unity中纹理的颜色空间选项(TextureImporter.sRGB)需要正确设置。例如法线贴图一定关sRGB，否则光照错误。这不直接影响性能但属于优化范畴的正确性问题。
        
    -   **特殊纹理**：如UI使用的九宫格(九切片)，导入时不要MipMap且Clamp模式，防止边缘采样错误。还有HDR贴图(如环境反射立方体)需要使用RGBM或EXR格式保存，这些不能压缩有损，只能用RGB9e5等HDR格式。提醒读者对特殊用途贴图要根据用途调整Import设置，不可一刀切压缩。
        

### 文章二：模型与Mesh优化

-   **主题拆分**：讨论3D模型在Unity中的导入与优化，包括网格面数、Mesh压缩、剔除不必要数据（如顶点颜色、第二UV）、以及在Unity内对Mesh进行进一步优化的技术（Mesh Combine, LOD等）。帮助在满足视觉要求的前提下降低模型对性能和内存的压力。
    
-   **内容概览**:
    
    -   **模型导入设置**：Unity Model Importer主要选项：Scale Factor、Mesh Compression、Read/Write Enabled、Optimize Mesh、Import Materials, Import Animations 等。
        
        -   **Scale Factor**：建议美术在导出FBX时统一单位避免频繁调整Scale。常用1或0.01视来源软件。但无论如何**统一**，否则缩放错误易出bug。
            
        -   **Mesh Compression**：Unity提供Off, Low, Medium, High。它对顶点数据做量化压缩，占用更小磁盘和内存，但会略损失精度（顶点坐标、UV等用减少位数表示）[blog.csdn.net](https://blog.csdn.net/qq_35864875/article/details/136497649#:~:text=1)。High压缩可能造成模型微小形变，可以测试选择。一般Low或Medium能省一些又不明显失真。**建议**：对非角色等不要求超高精度的模型可以开Medium，角色脸部等精细模型可保守Low或Off。
            
        -   **Read/Write Enabled**：**强烈建议**关闭（unchecked）除非代码需要读写Mesh数据[blob.wenxiaobai.com](https://blob.wenxiaobai.com/article/183396f3-37ad-b17f-d987-030a58fb6b71#:~:text=Unity%E6%A8%A1%E5%9E%8B%E8%B5%84%E6%BA%90%E5%AF%BC%E5%85%A5%E8%AE%BE%E7%BD%AE%E4%B8%8E%E4%BC%98%E5%8C%96%E6%8C%87%E5%8D%97%20,Read%2FWrite%20Enabled%EF%BC%9A%E5%90%AF%E7%94%A8%E5%90%8E%EF%BC%8CUnity%E4%BC%9A%E5%B0%86Mesh%E6%95%B0%E6%8D%AE%E4%BF%9D%E7%95%99%E5%9C%A8CPU%E5%8F%AF%E5%AF%BB%E5%9D%80%E7%9A%84%E5%86%85%E5%AD%98%E4%B8%AD%E3%80%82)。关闭可以让Unity在加载后卸载CPU上的网格拷贝，仅保留GPU数据，节省内存一半。说明如不关闭，一个20k顶点模型将占用额外几十KB甚至MB内存累积起来很可观[unity.com](https://unity.com/cn/how-to/mobile-game-optimization-tips-part-1#:~:text=)。要注意，如果要在运行时修改网格（如程序生成或变形），需要开读写。但大部分静态模型都可以关[unity.com](https://unity.com/cn/how-to/mobile-game-optimization-tips-part-1#:~:text=match%20at%20L268%20,%E9%9D%99%E6%80%81%2F%E5%8A%A8%E6%80%81%E6%89%B9%E5%A4%84%E7%90%86%3A%E9%9D%99%E6%80%81%E6%89%B9%E5%A4%84%E7%90%86%E6%98%AF%E4%B8%80%E7%A7%8D%E5%B8%B8%E8%A7%81%E7%9A%84%E4%BC%98%E5%8C%96%E6%8A%80%E6%9C%AF%EF%BC%8C%E5%8F%AF%E4%BB%A5%E5%87%8F%E5%B0%91%E7%BB%98%E5%88%B6%E8%B0%83%E7%94%A8%E7%9A%84%E6%95%B0%E9%87%8F%E3%80%82%E5%AE%83%E9%9D%9E%E5%B8%B8%E9%80%82%E5%90%88%E7%94%B1%E5%A4%A7%E9%87%8F%E9%A1%B6%E7%82%B9%E7%BB%84%E6%88%90%E7%9A%84%E5%AF%B9%E8%B1%A1%EF%BC%8C%E8%BF%99%E4%BA%9B%E5%AF%B9%E8%B1%A1%E5%9C%A8%E6%B8%B2%E6%9F%93%E8%BF%87%E7%A8%8B%E4%B8%AD%E4%B8%8D%E4%BC%9A%E7%A7%BB%E5%8A%A8%E3%80%81%E6%97%8B%E8%BD%AC%E6%88%96%E7%BC%A9%E6%94%BE%E3%80%82%E5%9C%A8%E5%8C%85)。
            
        -   **Optimize Mesh**：Unity会重排顶点顺序优化GPU缓存利用（提高渲染效率）[blob.wenxiaobai.com](https://blob.wenxiaobai.com/article/183396f3-37ad-b17f-d987-030a58fb6b71#:~:text=Enabled%EF%BC%9A%E5%90%AF%E7%94%A8%E5%90%8E%EF%BC%8CUnity%E4%BC%9A%E5%B0%86Mesh%E6%95%B0%E6%8D%AE%E4%BF%9D%E7%95%99%E5%9C%A8CPU%E5%8F%AF%E5%AF%BB%E5%9D%80%E7%9A%84%E5%86%85%E5%AD%98%E4%B8%AD%E3%80%82)。应开启，除非模型用于GPU皮肤动画需要特殊顺序（Unity会自动处理SkinnedMesh的情况）。
            
        -   **Import Materials**：一般大型项目会由美术/程序手动指定材质，Import Materials可以关闭避免生成大量无用材质球。用统一材质库管理材质资源。
            
        -   **Animations**：若模型不需要自带动画（纯静态或用独立AnimatorController），可以不导入动画数据，节省一些数据量。
            
        -   **Extra UVs, Normals**：有选项决定是否导入网格法线、切线、UV2。对静态环境若要烘焙光照需要UV2，但对动态角色不需要UV2可关。若自定义法线（如法线贴图或特殊效果）可以导入，否则Unity也可重新计算法线提高一致性。**优化点**：不要导入不需要的数据，比如模型不使用顶点颜色，则美术导出时去掉；Unity导入时也可剔除。每个顶点的每个属性都占内存和带宽，没用的就别要。
            
    -   **多边形数量**：强调模型面数对性能的影响。移动端一般场景总面数预算在几十万三角以内，同屏模型尽量简化。PC可高一些但也不是无限，多边形多直接增加渲染耗时。优化措施：
        
        -   **LOD（Level of Detail）**：为复杂模型提供简化版，当距离远时用低模。Unity有LODGroup组件可以设置距离阈值和多级模型。鼓励对场景大物件、角色使用LOD，手工制作或用工具自动简化（如Simplygon）。这样远处用1k面模型，近处用10k面模型，无损玩家体验却大幅减少总体绘制负担。说明LODGroup使用简单拖不同网格进不同Level即可。
            
        -   **贴图烘焙 Normal/AO vs 纯多边形**：一些细节可以用法线贴图或AO贴图表现而不一定通过几何，比如螺丝、小凹凸等，应该让美术烘焙到贴图，用更少面表现细节。这个需要在美术制作流程中强调，因为渲染一个多边形和渲染像素消耗不同，高面在像素小的情况下是浪费。
            
        -   **地形和植被**：若涉及Unity Terrain，对Mesh优化有不同策略（Terrain系统自带LOD），如果自制地形网格，需要对远景降低细分。树草可以用Impostor（烘焙成贴图面片）。这些都属于Mesh优化范畴。
            
    -   **Mesh合并与Draw Call**：提醒性能不光看三角形，还有**Draw Call**（批次）。大量小模型可能导致过多绘制调用。**静态批处理**：Unity会将同材质静态对象合批，但仍有子网格边界。可以**手动合并网格**：如场景里一堆小石头，可在编辑器或运行时合成一个Mesh，减少批次。Unity有 `Mesh.CombineMeshes` 可用，或者编辑器里用ProBuilder等做合并。但要确保合并后不致过大一个mesh（分区加载）。
        
        -   合并要小心的是失去独立剔除（一个大mesh哪怕部分在视野外也整个绘制）。所以**适度**合并：很多非常小物件合适，但别把整个关卡合成一个Mesh。
            
        -   **SkinnedMesh**：合并骨骼动画网格难度大，但也可以技术实现（骨骼合并等）。此略提一下，不深究。
            
    -   **Rig 优化**：涉及角色模型，Bones数量和骨骼层级会影响性能。提醒在导入动画时可优化Rig，如不需要全骨骼可裁剪（Avatar Mask）。虽非Mesh本身，但属于美术资源优化。
        
    -   **实例化和GPU Instancing**：再提及，如果有大量相同模型（树木等），Unity的GPU Instancing比合并更好。前提Shader支持instancing。这其实是渲染技术，但和资源相关：可以多次放置同一预制而不增加内存开销。**注意**：Instancing要求网格完全相同、材质相同，不同材质还是分开批次。
        
-   **关键概念与技术**：LODGroup, Static Batching, Mesh Compression algorithm (like quantization bit precision), Frustum Culling (合并后剔除变粗粒度), SkinnedMesh differences.
    
-   **示例代码建议**:
    
    -   使用LODGroup的例子：
        
        csharp
        
        复制编辑
        
        `// Assuming you have three LOD meshes: high, mid, low GameObject lodObj = new GameObject("LOD_Object");
        LODGroup lodGroup = lodObj.AddComponent<LODGroup>();
        Renderer highR = highMeshObject.GetComponent<Renderer>();
        Renderer midR = midMeshObject.GetComponent<Renderer>();
        Renderer lowR = lowMeshObject.GetComponent<Renderer>();
        LOD[] lods = new LOD[3];
        lods[0] = new LOD(0.1f, new Renderer[]{highR}); // 10% screen height lods[1] = new LOD(0.03f, new Renderer[]{midR}); // 3% screen lods[2] = new LOD(0.01f, new Renderer[]{lowR}); // 1% screen lodGroup.SetLODs(lods);
        lodGroup.RecalculateBounds();` 
        
        说明LODGroup如何设置。当相机距离远到对象占屏幕高度<1%时，甚至可设为culled（空）。代码只是辅助理解，实际可在Editor手配LODGroup。
        
    -   Mesh.CombineMeshes用法示例：
        
        csharp
        
        复制编辑
        
        `MeshFilter[] filters = GetComponentsInChildren<MeshFilter>();
        CombineInstance[] combines = new CombineInstance[filters.Length]; for(int i=0; i<filters.Length; i++){
            combines[i].mesh = filters[i].sharedMesh;
            combines[i].transform = filters[i].transform.localToWorldMatrix;
        }
        Mesh combined = new Mesh();
        combined.CombineMeshes(combines);
        GetComponent<MeshFilter>().mesh = combined;` 
        
        解释这个会把子物体网格合一起。要确保材质统一或考虑多个材质分开合并。
        
-   **注意事项**:
    
    -   **视觉验证**：压缩网格、简化面数都可能影响视觉，要和美术协同。启用Mesh Compression后要检查模型关键部位是否走样（如角色面部表情部分别压坏）。LOD简模需要接受可能的细节损失。总之**找平衡**，不要过度优化损害品质。
        
    -   **Import vs DCC**：有些优化最好在美术DCC工具中完成。例如删掉看不到的背面、多余顶点、隐藏面，使用LOD工具等。Unity导入能做有限优化，但源模型干净对最终效果更好。鼓励在资产制作阶段就关注优化（比如贴图烘焙细节代替高面）。
        
    -   **平台差异**：移动端对面数和骨骼更敏感，所以可能需要特地准备低配模型用于移动版（可以通过LOD或直接换资源）。PC/Console可以用高模。可以采用和纹理类似的平台差异导入：Unity支持针对平台的网格导入选项（如不太支持Polyon reduction自动，但可以做两个FBX，用平台分类）。
        
    -   **物理mesh**：提醒碰撞体MeshCollider最好不要直接用渲染mesh，如果复杂应使用简化collider（比如用基本碰撞体组合或者低模版本）。因为物理计算对高面mesh也很吃力。可在导入设置里关闭"Generate Colliders"然后手动设简化碰撞。
        
    -   **Mesh内存**：除了顶点数，开启Read/Write导致双倍内存已说。还有**索引Buffer**，32位索引 vs 16位索引：Unity如果模型顶点<65535会用16位索引节省一半索引内存。若多于那就32位。鼓励美术尽量把单个Mesh顶点数控制在65535以下，分成子mesh也是办法，这样Unity用16位索引更省，GPU也更快。
        
    -   **动态 vs 静态**：静态几何可以用静态批处理，但静态批处理会在Build后合并网格片段增加内存。所以要平衡使用。Unity 2020+还有SRP Batcher对材质统一的DrawCall非常有效（不依赖合并mesh），可以提一下使用新渲染管线优化drawcall，从资源方面就要统一材质shader。
        

### 文章三：美术资源优化工作流程与注意事项

-   **主题拆分**：将以上贴图和模型优化的知识融入实际开发流程。从美术制作到引擎导入，每个阶段需要注意什么、采用哪些工具，才能高效地产出优化过的资源。强调团队协作和流程标准，使资源优化成为开发流程的一部分，而非事后补救。
    
-   **内容概览**:
    
    -   **美术制作阶段**：
        
        -   **贴图尺寸和UV**：美术在建模和绘制贴图时，应考虑最终分辨率需求。不必盲目4K，按照模型屏占比给出贴图分辨率建议（tech art通常提供参考，如角色主角2K贴图，路边小物件256等）。UV要高效利用贴图空间，避免浪费导致需要更大图。
            
        -   **多用途贴图合并**：引导美术使用RG通道放置不同灰度图（如金属度R + AO G + Roughness B in one texture）来减少贴图数量，这减少材质采样开销，也减少文件数。Unity的Standard shader本身Metallic/AO用一张图。所以美术要输出合成好的图，避免引擎里实时合成。
            
        -   **三角面数限制**：为每种类型模型制定面数上限，建模时遵守。比如手机NPC角色<=5k tris，主角<=20k，武器<=1k，树木<=3k等。这个标准由技术美术和程序设定根据性能预算。美术导出前用建模软件检查，超出就需减面。
            
        -   **Rig和骨骼**：动画角色骨骼数量控制在合理范围，手指简化、连杆用较少骨骼。面部若不用太多表情也别加几十根骨骼。因为每骨骼会影响CPU skinning成本（GPU skinning也有限制）。标准例如手游角色骨骼<60，PC可100+。
            
        -   **导出设置**：美术导出FBX时可以剔除隐藏物体、相机灯光等，避免无关内容进入Unity。贴图尽量导出PNG/TGA而不是含layer的PSD。保持文件命名规范（与程序约定），比如文件名带LOD后缀(Lod0, Lod1)等方便Unity自动识别LOD（Unity有时可根据名字设置LODGroup）。
            
        -   **版本控制协作**：大文件如PSD可不进Git，以共享网盘管理，减轻repo压力。这个偏管理层面，也算优化构建时间。
            
    -   **引擎导入配置**：
        
        -   **使用Preset**：Unity提供Preset功能，可以对TextureImporter、ModelImporter设置预设。项目可准备几个Preset比如“MobileTexturePreset” “HighResTexturePreset”，美术导入资源后，程序或TA可以一键应用Preset使导入设置符合规范。还可以设置某些路径自动用Preset（在Unity 2020+ Importer有静态Preset Mapping）。这大大节省逐个调设置时间，确保一致性。
            
        -   **平台Override批量**：利用批处理(可以写Editor脚本或Addressables profiles)在打包前统一调整平台导入设置。如所有Android下纹理压缩切换ASTC，如果开发期间因为快捷调试用的是RGBA32，打包前运行脚本全部改ASTC然后Build。这样保证发布包的优化而开发中仍可快速迭代。
            
        -   **定期清理**：制定每隔一段时间（比如每月）由TA/程序对项目资源进行体检。通过Unity Analytics或Profile工具看哪些纹理占内存最多、哪些模型顶点多。UWA等报告也行[taikr.com](https://www.taikr.com/app.php/article/3585#:~:text=%E5%90%AC%E8%AF%B4%E4%BD%A0%E7%9A%84%E9%A1%B9%E7%9B%AE%E4%B8%AD%E4%BB%85%E8%BF%99%E4%BA%9B%E8%B5%84%E6%BA%90%E5%B0%B1%E5%8D%A1%E6%88%90%E4%BA%86%E7%BF%94%EF%BC%9F%E7%9C%8B%E7%9C%8B%E4%BB%96%E4%BB%AC%E6%80%8E%E4%B9%88%E5%81%9A%EF%BC%81%20%E9%A1%B9%E7%9B%AE%E4%B8%AD%E7%9A%84%E5%86%97%E4%BD%99%E8%B5%84%E6%BA%90%E6%9C%AC%E8%BA%AB%E4%BC%9A%E5%9C%A8%E9%A1%B9%E7%9B%AE%E6%96%87%E4%BB%B6%E4%B8%AD%E5%8D%A0%E6%8D%AE%E9%A2%9D%E5%A4%96%E7%9A%84%E7%A9%BA%E9%97%B4%EF%BC%8C%E8%BF%98%E6%9C%89%E5%8F%AF%E8%83%BD%E5%9C%A8%E5%86%85%E5%AD%98%E4%B8%AD%E5%A4%9A%E6%AC%A1%E8%A2%AB%E5%8A%A0%E8%BD%BD%EF%BC%8C%E5%8D%A0%E6%8D%AE%E5%86%85%E5%AD%98%E3%80%82%E7%AC%94%E8%80%85%E9%80%9A%E8%BF%87UWA%E6%8F%90%E4%BE%9B%E7%9A%84%E8%B5%84%E6%BA%90%E6%A3%80%E6%B5%8B%E4%B8%8E%E5%88%86%E6%9E%90%EF%BC%8C%E5%AE%9A%E4%BD%8D%E5%88%B0%E6%89%80%E6%9C%89AssetBundle%E4%B8%AD%E5%8C%85%20%E5%90%AB%E7%9A%84%E5%86%97%E4%BD%99%E8%B5%84%E6%BA%90%EF%BC%8C%E8%BD%BB%E6%9D%BE%E5%AF%B9%E8%BF%99%E4%BA%9B%E8%B5%84%E6%BA%90%E6%89%A7%E8%A1%8C%E5%AE%9A%E7%82%B9%E4%BC%98%E5%8C%96%E3%80%82%E5%85%B7%E4%BD%93%E6%80%8E%E4%B9%88%E5%81%9A%E7%9A%84%EF%BC%8C%E8%AE%A9%E6%88%91%E4%BB%AC%E6%9D%A5%E7%9C%8B%E7%9C%8B%E8%AF%A6%E7%BB%86%E7%9A%84%E5%AE%9E%E7%8E%B0%E6%AD%A5%E9%AA%A4%E5%90%A7%E3%80%82)。找出异常大的资源，让美术优化（如发现某UI图1024x1024但UI上显示很小，可缩小分辨率；某模型10万面误导入未减面，需返工）。
            
        -   **AssetBundle构建检查**：若项目用AssetBundle/Addressables，在构建过程中Unity会输出冗余资源警告等[taikr.com](https://www.taikr.com/app.php/article/3585#:~:text=Image%3A%20%E6%B3%B0%E8%AF%BE%E5%9C%A8%E7%BA%BF)。要关注日志，修复提示。AssetBundle Analyzer工具可以查看每个bundle大小和内容。可把bundle大小与预期对比，超出很多的bundle检查是否有过大资源或者不需要的东西混入。
            
    -   **运行时与调优**:
        
        -   **场景内存监视**：在游戏运行中，用Unity Profiler或Memory Profiler查看贴图和网格列表，看看是否有过大的资源驻留。例如Profiler的Texture模块按大小排序[cnblogs.com](https://www.cnblogs.com/jeferwang/p/14038849.html#:~:text=%E5%88%86%E6%9E%90%E8%B5%84%E6%BA%90%E5%A4%A7%E5%B0%8F%E7%9A%84%E5%88%A9%E5%99%A8)，或MemoryProfiler的Detailed view。对于发现的问题资源，要么减少使用要么优化其属性。
            
        -   **渐进式优化**：不一定一开始就知道所有优化点，可以Alpha测试阶段收集性能数据。比如某关卡DrawCall过高，回溯发现因为场景里很多小对象没合并，可以在美术工具里合并场景静态几何或使用Occlusion Culling。又如内存偏高，查出因为某些贴图没压缩或尺寸太大，于是对症下药调整Import设置。
            
        -   **GPU Profiler**：关注Frame Debugger/Profiler看GPU bound情况。如果纹理带宽占用高，说明可能贴图太多太大，需要减少贴图数量（合图）或分辨率。如果三角形数过多导致GPU瓶颈，则考虑LOD等。用数据驱动优化决定。
            
        -   **协同工作**：程序和美术需要密切合作调整资源。程序可提供自动化报告，美术执行具体优化。比如写个EditorWindow列出“超大纹理列表”，让美术逐个确认哪些能缩小。或者列出“未压缩纹理列表”，大多应该压缩除非UI需要不压缩。用这种清单式方式比较直观推进。
            
    -   **工具推荐**:
        
        -   Unity官方的免费工具，如 **Unity Profiler** (性能)、**Memory Profiler** (内存)、**Frame Debugger** (渲染)、**Addressables Analyzer** (资源包) 都应熟练使用。教导读者将这些工具融入日常，出现问题先用工具分析再拍脑袋。
            
        -   第三方：**UWA**性能云服务，可以自动检测出严重资源问题并给建议[taikr.com](https://www.taikr.com/app.php/article/3585#:~:text=%E5%90%AC%E8%AF%B4%E4%BD%A0%E7%9A%84%E9%A1%B9%E7%9B%AE%E4%B8%AD%E4%BB%85%E8%BF%99%E4%BA%9B%E8%B5%84%E6%BA%90%E5%B0%B1%E5%8D%A1%E6%88%90%E4%BA%86%E7%BF%94%EF%BC%9F%E7%9C%8B%E7%9C%8B%E4%BB%96%E4%BB%AC%E6%80%8E%E4%B9%88%E5%81%9A%EF%BC%81%20%E9%A1%B9%E7%9B%AE%E4%B8%AD%E7%9A%84%E5%86%97%E4%BD%99%E8%B5%84%E6%BA%90%E6%9C%AC%E8%BA%AB%E4%BC%9A%E5%9C%A8%E9%A1%B9%E7%9B%AE%E6%96%87%E4%BB%B6%E4%B8%AD%E5%8D%A0%E6%8D%AE%E9%A2%9D%E5%A4%96%E7%9A%84%E7%A9%BA%E9%97%B4%EF%BC%8C%E8%BF%98%E6%9C%89%E5%8F%AF%E8%83%BD%E5%9C%A8%E5%86%85%E5%AD%98%E4%B8%AD%E5%A4%9A%E6%AC%A1%E8%A2%AB%E5%8A%A0%E8%BD%BD%EF%BC%8C%E5%8D%A0%E6%8D%AE%E5%86%85%E5%AD%98%E3%80%82%E7%AC%94%E8%80%85%E9%80%9A%E8%BF%87UWA%E6%8F%90%E4%BE%9B%E7%9A%84%E8%B5%84%E6%BA%90%E6%A3%80%E6%B5%8B%E4%B8%8E%E5%88%86%E6%9E%90%EF%BC%8C%E5%AE%9A%E4%BD%8D%E5%88%B0%E6%89%80%E6%9C%89AssetBundle%E4%B8%AD%E5%8C%85%20%E5%90%AB%E7%9A%84%E5%86%97%E4%BD%99%E8%B5%84%E6%BA%90%EF%BC%8C%E8%BD%BB%E6%9D%BE%E5%AF%B9%E8%BF%99%E4%BA%9B%E8%B5%84%E6%BA%90%E6%89%A7%E8%A1%8C%E5%AE%9A%E7%82%B9%E4%BC%98%E5%8C%96%E3%80%82%E5%85%B7%E4%BD%93%E6%80%8E%E4%B9%88%E5%81%9A%E7%9A%84%EF%BC%8C%E8%AE%A9%E6%88%91%E4%BB%AC%E6%9D%A5%E7%9C%8B%E7%9C%8B%E8%AF%A6%E7%BB%86%E7%9A%84%E5%AE%9E%E7%8E%B0%E6%AD%A5%E9%AA%A4%E5%90%A7%E3%80%82)。**Aqua** (国内360的Unity分析工具)也类似。**Mesh Simplify**插件可以批量产生LOD。**Texture Packer**将小图合图，这对2D/UI有效。**Cruncher**或Unity内置Crunch可减包。选用合适工具事半功倍。
            
        -   自研小工具：前述Presets、批处理脚本、验证脚本都是自己可以做的，往往针对项目需求写一些。例如自动给美术FBX下的mesh加collider、在导入特定文件夹时禁用读写等，可以固化在AssetPostprocessor脚本里。
            
-   **关键概念与技术**: Tech Art (技术美术) role, Automation in pipeline, Continuous profiling.
    
-   **示例代码建议**:
    
    -   Preset自动应用示例：Unity 2019+可以这样：
        
        csharp
        
        复制编辑
        
        `// In Editor folder  class  AutoAssignPreset : AssetPostprocessor { void  OnPreprocessTexture() { if(assetPath.Contains("/UI/")) {
                    TextureImporter imp = (TextureImporter)assetImporter; // Assume we have a preset asset at "Assets/Presets/UITexture.preset"  var preset = AssetDatabase.LoadAssetAtPath<Preset>("Assets/Presets/UITexture.preset"); if(preset != null) {
                        preset.ApplyTo(imp);
                    }
                }
            }
        }` 
        
        说明：将UI文件夹下的纹理统一应用UITexture预设，比如关闭MipMap, 使用RGBA32或高质量压缩。这样美术只要把图放对地方，就自动设置好了。
        
    -   列出超大纹理脚本（供TA用）：
        
        csharp
        
        复制编辑
        
        `foreach(Texture2D tex in Resources.FindObjectsOfTypeAll<Texture2D>()) { if(tex.width > 2048 || tex.height > 2048) {
                Debug.Log($"{tex.name} is {tex.width}x{tex.height}");
            }
        }` 
        
        或Editor遍历AssetDatabase。同理可以查未压缩纹理：检查TextureFormat是否Compressed。
        
-   **注意事项**:
    
    -   **早优化 vs 晚优化**：经典的“过早优化”警告。对于资源，也需要**适度**。建议在vertical slice（竖切面Demo）或alpha版出来后针对最明显的问题优化就好，不用一开始就极限优化每个资源，否则拖慢开发。找准瓶颈，按需优化。
        
    -   **档次配置**：大型项目可能需要画质设置。可讨论**Quality Levels**或自定义选项：如高画质用高清材质、高poly模型，低画质用简化资源。这样发布时能覆盖更多硬件。实现上可以用Addressables配置两套资产包，或Resources.Load根据设定加载不同资源后缀。此设计需要在流程中考虑，比如美术导出双份资源并标注，这在开发流程中要计划好。
        
    -   **新人培训**：引入新人（美术或外包）时，一定培训资源优化规范。否则他们按自己习惯输出，容易出未压缩贴图、未优化模型。这些坑需要统一认识并有检查流程发现。
        
    -   **持续Integration**：很多优化是持续工作，不是一劳永逸。特别当游戏内容不停增加，新资源可能又出现问题。因此在迭代中保持Profiling和优化的周期性。比如每新增10个角色就统一做LOD和贴图检查。每上新场景做深度性能测试，防患于未然。
        
    -   **总结价值**: 最后总结美术资源优化的意义：包体小、加载快、内存低、帧率高，直接提升用户体验[taikr.com](https://www.taikr.com/app.php/article/3585#:~:text=%E4%B8%80%E3%80%81%E7%9B%AE%E6%A0%87)。也节省用户流量和存储，对游戏推广有利。虽然会多花一些开发时间，但收益很大，是中高级开发者必须掌握的技能点。鼓励读者在项目中积极应用所学优化策略，并与美术同事紧密合作达到最佳效果。[taikr.com](https://www.taikr.com/app.php/article/3585#:~:text=%E4%B8%80%E3%80%81%E7%9B%AE%E6%A0%87)[unity.com](https://unity.com/cn/how-to/mobile-game-optimization-tips-part-1#:~:text=match%20at%20L314%20%E6%82%A8%E7%9A%84%E5%A4%A7%E9%83%A8%E5%88%86%E5%86%85%E5%AD%98%E5%8F%AF%E8%83%BD%E4%BC%9A%E7%94%A8%E4%BA%8E%E7%BA%B9%E7%90%86%EF%BC%8C%E5%9B%A0%E6%AD%A4%E8%BF%99%E9%87%8C%E7%9A%84%E5%AF%BC%E5%85%A5%E8%AE%BE%E7%BD%AE%E8%87%B3%E5%85%B3%E9%87%8D%E8%A6%81%E3%80%82%E4%B8%80%E8%88%AC%E6%9D%A5%E8%AF%B4%EF%BC%8C%E5%AF%BC%E5%85%A5%E8%B5%84%E4%BA%A7%E6%97%B6%E8%AF%B7%E9%81%B5%E5%BE%AA%E8%BF%99%E4%BA%9B%E6%8C%87%E5%8D%97%E3%80%82)
