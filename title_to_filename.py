#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将文档内容标题写入文件名
"""

import os
import re
import shutil

def read_file_content(filepath, max_chars=2000):
    """读取文件内容"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read(max_chars)
    except:
        try:
            with open(filepath, 'r', encoding='gbk') as f:
                return f.read(max_chars)
        except:
            return ""

def extract_content_title(content):
    """从内容中提取标题"""
    if not content:
        return None
    
    lines = content.split('\n')
    
    # 优先级1：查找 # 标题（一级标题）
    for line in lines[:20]:
        match = re.match(r'^#\s+(.+)$', line.strip())
        if match:
            title = match.group(1).strip()
            if len(title) > 5:
                return title
    
    # 优先级2：查找 ## 标题（二级标题）
    for line in lines[:20]:
        match = re.match(r'^##\s+(.+)$', line.strip())
        if match:
            title = match.group(1).strip()
            if len(title) > 5:
                return title
    
    # 优先级3：查找 ### 标题（三级标题）
    for line in lines[:20]:
        match = re.match(r'^###\s+(.+)$', line.strip())
        if match:
            title = match.group(1).strip()
            if len(title) > 5:
                return title
    
    return None

def clean_title_for_filename(title):
    """清理标题作为文件名"""
    if not title:
        return None
    
    # 移除Markdown格式
    title = re.sub(r'[*_`#]', '', title)
    
    # 移除常见前缀
    prefixes = [
        r'^第[一二三四五六七八九十]+[章节篇]：',
        r'^第[一二三四五六七八九十]+[章节篇]\s*',
        r'^文章[一二三四五六七八九十\d]+：',
        r'^文章[一二三四五六七八九十\d]+\s*',
        r'^第一篇文章大纲：',
        r'^大纲：',
    ]
    
    for prefix in prefixes:
        title = re.sub(prefix, '', title)
    
    # 移除非法字符
    illegal_chars = r'[<>:"/\\|?*]'
    title = re.sub(illegal_chars, '-', title)
    
    # 清理空格和连字符
    title = re.sub(r'\s+', ' ', title).strip()
    title = re.sub(r'-+', '-', title)
    
    # 限制长度
    if len(title) > 80:
        title = title[:80] + '...'
    
    # 确保不为空
    if len(title) < 3:
        return None
    
    return title

def analyze_files(root_dir):
    """分析所有文件，提取标题"""
    
    print("分析文档，提取内容标题")
    print("=" * 60)
    
    files_to_rename = []
    
    for root, dirs, files in os.walk(root_dir):
        # 跳过.temp_writing目录
        if '.temp_writing' in root:
            continue
            
        for file in files:
            if file.endswith('.md'):
                filepath = os.path.join(root, file)
                current_filename = os.path.splitext(file)[0]
                
                # 读取内容
                content = read_file_content(filepath, 3000)
                
                # 提取内容标题
                content_title = extract_content_title(content)
                
                if content_title:
                    # 清理标题作为文件名
                    clean_title = clean_title_for_filename(content_title)
                    
                    if clean_title and clean_title != current_filename:
                        files_to_rename.append({
                            'filepath': filepath,
                            'current_filename': current_filename,
                            'content_title': content_title,
                            'clean_title': clean_title,
                            'new_filename': clean_title + '.md',
                            'category': os.path.basename(root)
                        })
    
    return files_to_rename

def preview_renames(files_to_rename):
    """预览重命名计划"""
    
    if not files_to_rename:
        print("没有需要重命名的文件")
        return
    
    print(f"\n找到 {len(files_to_rename)} 个需要重命名的文件")
    print("\n重命名计划预览（前20个）：")
    print("-" * 80)
    
    for i, file_info in enumerate(files_to_rename[:20], 1):
        rel_path = os.path.relpath(file_info['filepath'], r"D:\MyGit\Tech-Docs")
        print(f"{i:2d}. {rel_path}")
        print(f"    当前文件: {file_info['current_filename']}.md")
        print(f"    内容标题: {file_info['content_title']}")
        print(f"    新文件: {file_info['new_filename']}")
        print()

def execute_renames(files_to_rename, dry_run=True):
    """执行重命名"""
    
    if not files_to_rename:
        print("没有需要重命名的文件")
        return 0
    
    print(f"\n=== 执行重命名操作 (dry_run={dry_run}) ===")
    
    executed = 0
    errors = []
    
    for i, file_info in enumerate(files_to_rename, 1):
        old_path = file_info['filepath']
        new_path = os.path.join(os.path.dirname(old_path), file_info['new_filename'])
        
        print(f"\n{i:3d}. {os.path.basename(old_path)}")
        print(f"     内容标题: {file_info['content_title']}")
        print(f"     新文件: {file_info['new_filename']}")
        
        if old_path == new_path:
            print(f"     文件名不变")
            executed += 1
            continue
        
        if dry_run:
            print(f"     [模拟] 将重命名为: {file_info['new_filename']}")
        else:
            try:
                # 检查目标文件是否已存在
                if os.path.exists(new_path):
                    print(f"     警告: 目标文件已存在，跳过")
                    errors.append(f"目标文件已存在: {new_path}")
                    continue
                
                # 重命名文件
                shutil.move(old_path, new_path)
                print(f"     已重命名为: {file_info['new_filename']}")
                executed += 1
                
            except Exception as e:
                print(f"     错误: {e}")
                errors.append(f"{old_path} -> {e}")
    
    # 打印统计
    print(f"\n=== 重命名完成 ===")
    print(f"计划重命名: {len(files_to_rename)} 个文件")
    print(f"成功重命名: {executed} 个文件")
    
    if errors:
        print(f"错误数量: {len(errors)}")
        for error in errors[:5]:
            print(f"  - {error}")
    
    return executed

def main():
    root_dir = r"D:\MyGit\Tech-Docs"
    
    # 分析文件
    print("正在分析文档内容标题...")
    files_to_rename = analyze_files(root_dir)
    
    # 预览重命名计划
    preview_renames(files_to_rename)
    
    if not files_to_rename:
        return
    
    # 执行重命名（自动执行）
    print("\n" + "="*80)
    print("开始执行重命名操作...")
    
    # 先模拟运行
    executed = execute_renames(files_to_rename, dry_run=True)
    
    # 实际执行
    print("\n" + "="*80)
    print("实际执行重命名...")
    executed = execute_renames(files_to_rename, dry_run=False)
    
    # 保存报告
    save_report(files_to_rename, executed, root_dir)

def save_report(files_to_rename, executed_count, root_dir):
    """保存重命名报告"""
    report_path = os.path.join(root_dir, '标题写入文件名报告.md')
    
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("# 标题写入文件名报告\n\n")
        f.write(f"## 统计摘要\n")
        f.write(f"- 操作时间: 2026年4月12日\n")
        f.write(f"- 分析文件: {len(files_to_rename)} 个\n")
        f.write(f"- 成功重命名: {executed_count} 个\n\n")
        
        f.write("## 重命名详情\n\n")
        f.write("| 序号 | 原文件名 | 新文件名 | 内容标题 |\n")
        f.write("|------|----------|----------|----------|\n")
        
        for i, file_info in enumerate(files_to_rename, 1):
            f.write(f"| {i} | {file_info['current_filename']}.md | {file_info['new_filename']} | {file_info['content_title']} |\n")
    
    print(f"\n重命名报告已保存到: {report_path}")

if __name__ == "__main__":
    main()