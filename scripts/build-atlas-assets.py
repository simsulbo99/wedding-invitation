#!/usr/bin/env python3
"""Validate Atlas paths and build small, EXIF-free WebP derivatives (Pillow required).

python scripts/build-atlas-assets.py           # validate & build
python scripts/build-atlas-assets.py --check   # validate, including derivatives
python scripts/build-atlas-assets.py --refresh # re-read ONLY the 11 configured folders
"""
import argparse
import json
import re
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'atlas-data.js'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true')
parser.add_argument('--refresh', action='store_true')
args = parser.parse_args()
assert not (args.check and args.refresh), 'Choose --check or --refresh.'
header, content = DATA.read_text().split('window.ATLAS_DATA = ', 1)
data = json.loads(content.rstrip().removesuffix(';'))
assert len({c['id'] for c in data['collections']}) == len(data['collections'])
assert len({c['number'] for c in data['collections']}) == len(data['collections'])
assert data['defaultCollection'] in {c['id'] for c in data['collections']}
assert data['routeOrigin'] in {c['id'] for c in data['collections']}
counts = {}
total_bytes = 0
for c in data['collections']:
    folder = ROOT / c['folder']
    actual = sorted(p.name for p in folder.iterdir() if p.suffix.lower() in ('.jpg', '.webp'))
    pattern = re.compile(re.escape(c['filePrefix']) + r'_\d+\.(jpg|webp)', re.IGNORECASE)
    assert all(pattern.fullmatch(name) for name in actual), f'Unexpected filename: {folder}'
    if args.refresh:
        c['photos'] = []
        for name in actual:
            with Image.open(folder / name) as image:
                width, height = ImageOps.exif_transpose(image).size
            c['photos'].append({'file': name, 'width': width, 'height': height})
    assert sorted(p['file'] for p in c['photos']) == actual, f'File list differs: {folder}'
    assert len(actual) == len(set(actual)) and actual, f'Empty or duplicate list: {folder}'
    assert c['representative'] in actual, f'Representative missing: {c["id"]}'
    assert bool(c['map']) == (c['group'] != 'details')
    counts[c['group']] = counts.get(c['group'], 0) + len(actual)
    for photo in c['photos']:
        source = folder / photo['file']
        dest = ROOT / 'images' / 'atlas-thumbs' / c['id'] / (source.stem + '.webp')
        with Image.open(source) as original:
            image = ImageOps.exif_transpose(original).convert('RGB')
            assert image.size == (photo['width'], photo['height']), f'Dimensions differ: {source}'
            if not args.check:
                dest.parent.mkdir(parents=True, exist_ok=True)
                ImageOps.fit(image, (160, 160), method=Image.Resampling.LANCZOS).save(dest, 'WEBP', quality=72, method=6)
        assert dest.exists(), f'Missing thumbnail: {dest}'
        with Image.open(dest) as thumbnail:
            thumbnail.load()
            assert thumbnail.size == (160, 160)
        total_bytes += dest.stat().st_size
    if c['group'] == 'wedding':
        dest = ROOT / 'images' / 'atlas-featured' / (c['id'] + '.webp')
        if not args.check:
            dest.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(folder / c['representative']) as original:
                image = ImageOps.exif_transpose(original).convert('RGB')
                ImageOps.fit(image, (560, 700), method=Image.Resampling.LANCZOS).save(dest, 'WEBP', quality=84, method=6)
        with Image.open(dest) as image:
            image.load()
            assert image.size == (560, 700)
    print(f'{c["number"]:02d} {c["id"]}: {len(actual)} photos OK')
if args.refresh:
    DATA.write_text(header + 'window.ATLAS_DATA = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n')
print(f'{len(data["collections"])} collections / {sum(counts.values())} photos: {counts}')
print(f'Thumbnails: {total_bytes:,} bytes; original JPGs untouched.')
