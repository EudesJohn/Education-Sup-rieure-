#!/usr/bin/env python
"""Copy project files to server/server/ for Vercel deploy workaround."""
import shutil, os
from pathlib import Path

root = Path(r"D:\Etudiant Note\server")
dest = root / "server"

if dest.exists():
    shutil.rmtree(dest)
dest.mkdir(parents=True)

items = ["api", "core", "services", "schemas", "tests",
         "main.py", "pyproject.toml", "requirements.txt", "vercel.json",
         "alembic.ini"]

exclude_dirs = {"__pycache__", ".vercel", "logs", "server", ".git"}
exclude_exts = {".pyc", ".pyo", ".py~"}

def copy_tree(src, dst):
    dst.mkdir(parents=True, exist_ok=True)
    for item in os.listdir(str(src)):
        s = src / item
        d = dst / item
        if s.name in exclude_dirs or s.suffix in exclude_exts: continue
        if s.is_dir(): copy_tree(s, d)
        else: shutil.copy2(str(s), str(d))

for name in items:
    src = root / name
    if src.is_dir(): copy_tree(src, dest / name)
    elif src.exists(): shutil.copy2(str(src), str(dest / name))

print("Copy complete.", list(dest.iterdir()))
