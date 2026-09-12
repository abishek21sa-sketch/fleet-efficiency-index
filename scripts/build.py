"""Splice data/data_export.json (+ data/safety_export.json, if present) into
template.html to produce index.html. Run this after any analyze*.py script
changes the data exports, or after editing template.html directly.

Usage: python scripts/build.py   (run from repo root)
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return f.read()

def main():
    template = read('template.html')

    with open(os.path.join(ROOT, 'data', 'data_export.json'), encoding='utf-8') as f:
        data_json = f.read()

    safety_path = os.path.join(ROOT, 'data', 'safety_export.json')
    if os.path.exists(safety_path):
        with open(safety_path, encoding='utf-8') as f:
            safety_json = f.read()
    else:
        safety_json = 'null'
        print('Warning: data/safety_export.json not found, embedding null.')

    out = template.replace('__DATA_JSON__', data_json).replace('__SAFETY_JSON__', safety_json)

    out_path = os.path.join(ROOT, 'index.html')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(out)
    print(f'Wrote index.html ({len(out)/1024:.0f} KB)')

if __name__ == '__main__':
    main()
