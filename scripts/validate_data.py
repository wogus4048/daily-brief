#!/usr/bin/env python3
import json, pathlib, sys, re

ROOT = pathlib.Path(__file__).resolve().parents[1]
path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'data/latest.json'
data = json.loads(path.read_text(encoding='utf-8'))

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')

def assert_date(value, label):
    assert isinstance(value, str) and DATE_RE.match(value), f'{label} must be YYYY-MM-DD'

assert_date(data.get('date'), 'date')
for key in ('contests', 'aiNews', 'aiDiscovery', 'support', 'archive'):
    assert isinstance(data.get(key), list), f'{key} must be a list'

ids = []
for group in ('contests', 'support'):
    for item in data[group]:
        for field in ('id', 'title', 'summary', 'firstSeenDate', 'status', 'lastVerifiedDate'):
            assert item.get(field), f'{group} item missing {field}'
        assert_date(item['firstSeenDate'], f"{group}.{item['id']}.firstSeenDate")
        assert_date(item['lastVerifiedDate'], f"{group}.{item['id']}.lastVerifiedDate")
        if item.get('lastUpdatedDate'):
            assert_date(item['lastUpdatedDate'], f"{group}.{item['id']}.lastUpdatedDate")
        assert item['status'] in ('UPCOMING', 'OPEN', 'CLOSED'), f"{group}.{item['id']}.status must be UPCOMING, OPEN or CLOSED"
        if item['status'] == 'UPCOMING':
            assert item.get('openingAt'), f"{group}.{item['id']}.UPCOMING item missing openingAt"
        ids.append(item['id'])

for item in data['aiNews']:
    for field in ('id', 'title', 'summary', 'firstSeenDate', 'lastUpdatedDate', 'updates'):
        assert item.get(field), f'aiNews item missing {field}'
    assert_date(item['firstSeenDate'], f"aiNews.{item['id']}.firstSeenDate")
    assert_date(item['lastUpdatedDate'], f"aiNews.{item['id']}.lastUpdatedDate")
    assert isinstance(item['updates'], list) and item['updates'], f"aiNews.{item['id']}.updates must be non-empty"
    for i, update in enumerate(item['updates']):
        assert update.get('date') and update.get('text'), f"aiNews.{item['id']}.updates[{i}] missing date/text"
        assert_date(update['date'], f"aiNews.{item['id']}.updates[{i}].date")
    ids.append(item['id'])

for item in data['aiDiscovery']:
    for field in ('id', 'title', 'summary', 'discoveryType', 'firstSeenDate', 'lastUpdatedDate', 'links'):
        assert item.get(field), f'aiDiscovery item missing {field}'
    assert item['discoveryType'] in ('site', 'github', 'skill', 'mcp', 'agent', 'workflow', 'directory', 'discussion', 'platform'), f"aiDiscovery.{item['id']}.discoveryType invalid"
    assert_date(item['firstSeenDate'], f"aiDiscovery.{item['id']}.firstSeenDate")
    assert_date(item['lastUpdatedDate'], f"aiDiscovery.{item['id']}.lastUpdatedDate")
    assert isinstance(item['links'], list) and item['links'], f"aiDiscovery.{item['id']}.links must be non-empty"
    for field in ('awareness', 'trend', 'newsState'):
        assert item.get(field), f"aiDiscovery.{item['id']} missing {field}"
    assert item['awareness'] in ('WELL_KNOWN', 'SPECIALIZED', 'EARLY'), f"aiDiscovery.{item['id']}.awareness invalid"
    assert item['trend'] in ('HOT', 'RISING', 'STEADY', 'RESURFACED'), f"aiDiscovery.{item['id']}.trend invalid"
    assert item['newsState'] in ('NEW_RELEASE', 'NEWLY_DISCOVERED', 'UPDATED'), f"aiDiscovery.{item['id']}.newsState invalid"
    ids.append(item['id'])

assert len(ids) == len(set(ids)), 'duplicate item id'
for d in data['archive']:
    assert_date(d, 'archive item')

print(
    f"OK: {path} "
    f"({len(data['contests'])} contests, {len(data['aiNews'])} aiNews, {len(data['aiDiscovery'])} aiDiscovery, {len(data['support'])} support)"
)
