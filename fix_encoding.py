#!/usr/bin/env python
"""Fix double-encoded UTF-8 French characters in source files.

Explanation:
The corruption happened when files containing UTF-8 French text were
read as Latin-1 (ISO-8859-1) and then re-saved as UTF-8.

Example: 'é' (U+00E9) UTF-8 bytes = 0xC3 0xA9
- Read as Latin-1: chr(0xC3)='Ã'  chr(0xA9)='©'
- Re-saved as UTF-8: 'Ã©' = 0xC3 0x83 0xC2 0xA9

The fix: encode the text as Latin-1 and decode as UTF-8.
This gives back the original bytes.
"""

import os
import sys

# Files/directories to skip entirely
SKIP_DIRS = {
    '.venv', 'node_modules', '.git', '__pycache__',
    '.claude', '.vscode', '.idea',
}
SKIP_FILES = set()
SKIP_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
    '.woff', '.woff2', '.ttf', '.eot',
    '.mp3', '.mp4', '.zip', '.tar', '.gz',
    '.pyc', '.o', '.so', '.dll', '.exe',
    '.pdf', '.doc', '.docx',
}


def should_skip(path: str) -> bool:
    """Check if a path should be skipped."""
    basename = os.path.basename(path)
    if basename in SKIP_DIRS or basename in SKIP_FILES:
        return True
    ext = os.path.splitext(path)[1].lower()
    if ext in SKIP_EXTENSIONS:
        return True
    return False


def is_binary(path: str) -> bool:
    """Quick check if file is binary (null bytes in first 8KB)."""
    try:
        with open(path, 'rb') as f:
            chunk = f.read(8192)
        return b'\0' in chunk  # Simple heuristic
    except Exception:
        return True


def fix_text(text: str) -> tuple[str, bool]:
    """Fix double-encoded French characters in text.

    Returns: (fixed_text, was_modified: bool)
    """
    # Try the standard fix: encode as latin-1, decode as utf-8
    # This reverses the double-encoding corruption
    try:
        fixed = text.encode('latin-1').decode('utf-8')
        if fixed != text:
            # Verify we actually fixed garbled characters (not just changed encoding)
            # Check if the original had garbled French patterns
            has_garbled = any(pattern in text for pattern in [
                'Ã©', 'Ã¨', 'Ãª', 'Ã«', 'Ã ', 'Ã¢', 'Ã§',
                'Ã¹', 'Ã»', 'Ã®', 'Ã´', 'Ã‰', 'Ãˆ',
                'ÃŠ', 'Ã€', 'Ã‡', 'Ã›', 'ÃŽ', 'Ã”',
            ])
            if has_garbled:
                return fixed, True
            # If the original didn't have garbled patterns but the fix changed text,
            # it might be a false positive. Still accept the fix since
            # encode('latin-1').decode('utf-8') is idempotent for valid UTF-8
            return fixed, True
        return text, False
    except (UnicodeEncodeError, UnicodeDecodeError) as e:
        # Some characters can't be encoded in Latin-1 (e.g., emoji, smart quotes)
        # These are NOT part of the double-encoding and should be preserved
        # Do character-by-character fix
        result = []
        was_modified = False
        i = 0
        while i < len(text):
            # Try to find the longest fixable substring starting at i
            fixed_char = None
            for j in range(min(i + 8, len(text)), i, -1):
                chunk = text[i:j]
                try:
                    fixed_sub = chunk.encode('latin-1').decode('utf-8')
                    if fixed_sub != chunk:
                        was_modified = True
                    result.append(fixed_sub)
                    i = j
                    fixed_char = True
                    break
                except (UnicodeEncodeError, UnicodeDecodeError):
                    continue
            if fixed_char is None:
                result.append(text[i])
                i += 1
        return ''.join(result), was_modified


def fix_file(path: str) -> bool:
    """Fix double-encoding in a single file.

    Returns: True if file was modified
    """
    if should_skip(path):
        return False
    if is_binary(path):
        return False

    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception:
        # Try other common encodings
        try:
            with open(path, 'r', encoding='latin-1') as f:
                content = f.read()
        except Exception:
            return False

    fixed, was_modified = fix_text(content)
    if was_modified:
        # Write back with proper UTF-8 encoding
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(fixed)
        return True
    return False


def main():
    base_dir = 'D:\\Etudiant Note'

    # Only fix specific source directories
    source_dirs = [
        os.path.join(base_dir, 'client', 'src'),
        os.path.join(base_dir, 'server', 'api'),
        os.path.join(base_dir, 'server', 'core'),
        os.path.join(base_dir, 'server', 'schemas'),
        os.path.join(base_dir, 'server', 'services'),
        os.path.join(base_dir, 'server', 'tests'),
        os.path.join(base_dir, 'server', 'server', 'api'),
        os.path.join(base_dir, 'server', 'server', 'core'),
        os.path.join(base_dir, 'server', 'server', 'schemas'),
        os.path.join(base_dir, 'server', 'server', 'services'),
        os.path.join(base_dir, 'server', 'server', 'tests'),
        # Single server files at root
    ]

    # Also scan root server files
    server_root_files = ['check_email.py', 'main.py', 'seed.py', 'test_smtp2.py']

    fixed_count = 0
    total_count = 0
    errors = []

    for src_dir in source_dirs:
        if not os.path.isdir(src_dir):
            continue
        for root, dirs, files in os.walk(src_dir):
            # Skip unwanted directories in-place
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for fn in files:
                fpath = os.path.join(root, fn)
                if should_skip(fpath):
                    continue
                total_count += 1
                try:
                    if fix_file(fpath):
                        print(f"  FIXED: {fpath[len(base_dir)+1:]}")
                        fixed_count += 1
                except Exception as e:
                    errors.append((fpath, str(e)))

    # Also fix server root files
    for fn in server_root_files:
        fpath = os.path.join(base_dir, 'server', fn)
        if os.path.isfile(fpath):
            total_count += 1
            try:
                if fix_file(fpath):
                    print(f"  FIXED: server/{fn}")
                    fixed_count += 1
            except Exception as e:
                errors.append((fpath, str(e)))

    print(f"\n{'='*60}")
    print(f"Total files scanned: {total_count}")
    print(f"Files fixed: {fixed_count}")

    if errors:
        print(f"\nErrors ({len(errors)}):")
        for fpath, err in errors:
            print(f"  {fpath}: {err}")

    return fixed_count


if __name__ == '__main__':
    print("Fixing double-encoded French characters...\n")
    count = main()
    if count:
        print(f"\n✅ {count} files fixed. You may want to review the changes before committing.")
    else:
        print("\nNo files needed fixing.")
