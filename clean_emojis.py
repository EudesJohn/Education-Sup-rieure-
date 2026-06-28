"""Supprime tous les emojis des fichiers source du projet."""

import os
import re

EMOJI_PATTERN = re.compile(
    '[\U0001F300-\U0001F9FF'
    '\U0001FA00-\U0001FA6F'
    '\U0001FA70-\U0001FAFF'
    '\U00002702-\U000027B0'
    '\U000024C2-\U0001F251'
    '\U0001F600-\U0001F64F'
    '\U0001F680-\U0001F6FF'
    '\U00002600-\U000026FF'
    '\U00002700-\U000027BF'
    '\U0000FE00-\U0000FE0F'
    '\U0000200D'
    ']'
)

REPLACEMENTS = {
    '✅': '',      # ✅
    '❌': '',      # ❌
    '⚠️': '', # ⚠️
    '⚠': '',      # ⚠
    'ℹ️': '', # ℹ️
    '⛔': '',      # ⛔
    '✔️': '', # ✔️
    '✔': '',      # ✔
    '✖': '',      # ✕
    '✗': '',      # ✗
    '✍': '',      # ✍
    '✍️': '', # ✍️
    '❄️': '', # ❄️
    '❓': '',      # ❓
    '❗': '',      # ❗
    '❤': '',      # ❤
    '➕': '',      # ➕
    '➖': '',      # ➖
    '➡️': '', # ➡️
    '⭐': '',      # ⭐
    '⭕': '',      # ⭕
    '〰': '',      # 〰
}

def clean_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        original = content

        # Remove specific emoji characters
        content = EMOJI_PATTERN.sub('', content)

        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f'  ERROR {filepath}: {e}')
        return False

def main():
    base = os.path.dirname(os.path.abspath(__file__))

    extensions = ('.py', '.ts', '.tsx', '.js', '.jsx', '.html', '.css')
    exclude_dirs = {'node_modules', '.git', '__pycache__', 'dist', '.vercel', 'venv'}

    source_dirs = [
        os.path.join(base, 'server'),
        os.path.join(base, 'client', 'src'),
    ]

    cleaned = 0
    total_files = 0

    for src_dir in source_dirs:
        if not os.path.exists(src_dir):
            continue
        for root, dirs, files in os.walk(src_dir):
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            for fname in files:
                if fname.endswith(extensions):
                    total_files += 1
                    fp = os.path.join(root, fname)
                    if clean_file(fp):
                        cleaned += 1
                        print(f'  CLEANED: {os.path.relpath(fp, base)}')

    print(f'\nTermine: {cleaned}/{total_files} fichiers modifies')

if __name__ == '__main__':
    main()
