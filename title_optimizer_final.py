#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
最终版文档标题优化脚本
智能提取内容标题，批量重命名
"""

import os
import re
import shutil
from collections import defaultdict

def read_file_content(filepath, max_chars=5000):
    """读取文件内容"""
    encodings = ['utf-8', 'gbk', 'utf-8-sig', 'latin-1']
    for encoding in encodings:
        try:
            with open(filepath, 'r', encoding=encoding) as f:
                return f.read(max_chars)
        except:
            continue
    return ""

def extract_real_title(content, current_filename):
    """从内容中提取真实标题"""
    if not content:
        return None
    
    lines = content.split('\n')
    
    # 方法1：查找 ### 标题（大纲文档的实际标题）
    for line in lines[:15]:
        match = re.match(r'^###\s+(.+)$', line.strip())
        if match:
            title = match.group(1).strip()
            # 过滤有效标题
            if len(title) > 10 and '...' not in title:
                # 清理标题中的多余部分
                title = re.sub(r'^第[一二三四五六七八九十]+[篇章节]：\s*', '', title)
                title = re.sub(r'^文章\d+：\s*', '', title)
                return title
    
    # 方法2：查找 ## 标题
    for line in lines[:10]:
        match = re.match(r'^##\s+(.+)$', line.strip())
        if match:
            title = match.group(1).strip()
            if len(title) > 10:
                return title
    
    # 方法3：从第一行非空行提取
    for line in lines[:20]:
        line = line.strip()
        if line and not line.startswith('#') and len(line) > 20:
            # 取前50个字符作为标题
            return line[:50] + ('...' if len(line) > 50 else '')
    
    return None

def generate_better_title(current_title, real_title, category):
    """生成更好的标题"""
    # 如果从内容中提取到了真实标题，使用它
    if real_title and len(real_title) > 10:
        return real_title
    
    # 处理特殊格式的标题
    # 1. 日期前缀：2026-03-28-xxx
    if re.match(r'^\d{4}-\d{2}-\d{2}-', current_title):
        base_title = re.sub(r'^\d{4}-\d{2}-\d{2}-', '', current_title)
        return base_title
    
    # 2. 大纲：前缀
    if current_title.startswith('大纲：'):
        base_title = current_title[3:]
        return base_title
    
    # 3. （已完结）前缀
    if current_title.startswith('（已完结）'):
        base_title = current_title[5:]
        return base_title
    
    # 4. 大纲_数字
    if re.match(r'^大纲_\d+$', current_title):
        # 根据分类生成通用标题
        category_titles = {
            '内存管理': '内存管理技术详解',
            '性能优化': '性能优化技术分析', 
            '架构设计': '架构设计原理与实践',
            '物理系统': '物理系统实现原理',
            '资源管理': '资源管理最佳实践',
            '编程范式': '编程范式深度解析'
        }
        return category_titles.get(category, f'{category}技术文档')
    
    # 5. 其他情况：添加分类前缀
    return f'{category} - {current_title}'

def optimize_titles():
    """主优化函数"""
    root_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 收集需要优化的文档
    docs_to_optimize = []
    
    for root, dirs, files in os.walk(root_dir):
        # 跳过.temp_writing目录
        if '.temp_writing' in root:
            continue
            
        for file in files:
            if file.endswith('.md'):
                filepath = os.path.join(root, file)
                rel_path = os.path.relpath(filepath, root_dir)
                filename_no_ext = os.path.splitext(file)[0]
                category = os.path.basename(os.path.dirname(filepath))
                
                # 判断是否需要优化
                needs_optimization = False
                reason = ""
                
                # 检查是否是StackEdit默认标题
                if re.match(r'^大纲(_\d+)?$', filename_no_ext):
                    needs_optimization = True
                    reason = "StackEdit默认标题"
                elif filename_no_ext.startswith('大纲：'):
                    needs_optimization = True
                    reason = "'大纲：'前缀"
                elif filename_no_ext.startswith('（已完结）'):
                    needs_optimization = True
                    reason = "'（已完结）'前缀"
                elif re.match(r'^\d{4}-\d{2}-\d{2}-', filename_no_ext):
                    needs_optimization = True
                    reason = "日期前缀"
                elif len(filename_no_ext) < 5:
                    needs_optimization = True
                    reason = "标题过短"
                
                if needs_optimization:
                    # 读取内容提取真实标题
                    content = read_file_content(filepath)
                    real_title = extract_real_title(content, filename_no_ext)
                    
                    # 生成新标题
                    new_title = generate_better_title(filename_no_ext, real_title, category)
                    
                    # 确保新标题有效
                    if not new_title or len(new_title) < 5:
                        new_title = f'{category}技术文档'
                    
                    # 清理标题中的非法文件名字符
                    new_title_clean = re.sub(r'[<>:"/\\|?*]', '-', new_title)
                    new_filename = f'{new_title_clean}.md'
                    new_filepath = os.path.join(os.path.dirname(filepath), new_filename)
                    
                    docs_to_optimize.append({
                        'old_path': filepath,
                        'old_title': filename_no_ext,
                        'new_path': new_filepath,
                        'new_title': new_title_clean,
                        'category': category,
                        'reason': reason,
                        'real_title': real_title
                    })
    
    # 打印优化计划
    print("=== 文档标题优化计划 ===")
    print(f"需要优化的文档数量: {len(docs_to_optimize)}")
    print()
    
    for i, doc in enumerate(docs_to_optimize[:20], 1):
        print(f"{i:2d}. {doc['category']}/{os.path.basename(doc['old_path'])}")
        print(f"     原因: {doc['reason']}")
        print(f"     当前标题: '{doc['old_title']}'")
        if doc['real_title']:
            print(f"     内容标题: '{doc['real_title']}'")
        print(f"     新标题: '{doc['new_title']}'")
        print(f"     新文件: {os.path.basename(doc['new_path'])}")
        print()
    
    if len(docs_to_optimize) > 20:
        print(f"... 还有 {len(docs_to_optimize) - 20} 个文档")
    
    # 询问是否执行
    response = input("\n是否执行优化？(y/n): ")
    if response.lower() == 'y':
        print("\n开始执行优化...")
        
        # 创建备份目录
        backup_dir = os.path.join(root_dir, '标题优化备份')
        os.makedirs(backup_dir, exist_ok=True)
        
        success_count = 0
        error_count = 0
        
        for doc in docs_to_optimize:
            try:
                # 备份原文件
                backup_path = os.path.join(backup_dir, os.path.basename(doc['old_path']))
                shutil.copy2(doc['old_path'], backup_path)
                
                # 重命名文件
                shutil.move(doc['old_path'], doc['new_path'])
                print(f"✓ 重命名: {os.path.basename(doc['old_path'])} -> {os.path.basename(doc['new_path'])}")
                success_count += 1
                
            except Exception as e:
                print(f"✗ 错误: {os.path.basename(doc['old_path'])} - {str(e)}")
                error_count += 1
        
        print(f"\n优化完成!")
        print(f"成功: {success_count} 个文档")
        print(f"失败: {error_count} 个文档")
        print(f"备份位置: {backup_dir}")
        
    else:
        print("取消优化操作")

if __name__ == '__main__':
    optimize_titles()