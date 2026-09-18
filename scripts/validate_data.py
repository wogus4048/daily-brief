#!/usr/bin/env python3
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
path = pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'data/latest.json'
data = json.loads(path.read_text(encoding='utf-8'))
assert isinstance(data.get('date'), str) and len(data['date']) == 10, 'date must be YYYY-MM-DD'
for key in ('contests','aiNews','support','archive'):
    assert isinstance(data.get(key), list), f'{key} must be a list'
ids=[]
for group in ('contests','aiNews','support'):
    for item in data[group]:
        for field in ('id','title','summary'):
            assert item.get(field), f'{group} item missing {field}'
        ids.append(item['id'])
assert len(ids)==len(set(ids)), 'duplicate item id'
print(f'OK: {path} ({len(ids)} items)')
