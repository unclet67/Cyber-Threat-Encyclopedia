import importlib.util, pathlib, unittest, datetime, json
spec=importlib.util.spec_from_file_location('monitoring', pathlib.Path('scripts/monitor-watchlist.py'))
mod=importlib.util.module_from_spec(spec)
try: spec.loader.exec_module(mod)
except FileNotFoundError: mod=None
class MonitoringTests(unittest.TestCase):
 def test_rss_matching_is_boundary_safe_deduplicated_and_review_only(self):
  self.assertIsNotNone(mod,'Monitoring scanner is not implemented')
  xml=b'<rss><channel><item><title>Salt Typhoon targets telecoms</title><link>https://example.org/report</link><pubDate>Sat, 24 Oct 2026 10:00:00 GMT</pubDate><description>APT10 activity</description></item></channel></rss>'
  items=mod.parse_feed(xml,'xml'); actors=[{'id':'salt','primaryName':'Salt Typhoon','aliases':[]},{'id':'apt1','primaryName':'APT1','aliases':[]}]
  now=datetime.datetime(2026,10,24,12,tzinfo=datetime.timezone.utc)
  out,seen=mod.review_candidates(items,actors,{},now,8,'Publisher')
  self.assertEqual(len(out),1);self.assertEqual(out[0]['actorIds'],['salt']);self.assertEqual(out[0]['status'],'Ready for Review');self.assertFalse(out[0]['profileUpdatesApplied'])
  self.assertEqual(mod.review_candidates(items,actors,seen,now,8,'Publisher')[0],[])
 def test_atom_partial_dates_unsafe_links_and_entity_payloads(self):
  self.assertIsNotNone(mod)
  items=mod.parse_feed(b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Volt Typhoon</title><link href="https://example.org/volt"/><published>2026-10-24T10:00:00Z</published></entry></feed>','xml')
  self.assertEqual(items[0]['url'],'https://example.org/volt')
  with self.assertRaises(ValueError):mod.parse_feed(b'<!DOCTYPE rss [<!ENTITY x "bad">]><rss/>','xml')
  now=datetime.datetime(2026,10,24,12,tzinfo=datetime.timezone.utc);actors=[{'id':'volt','primaryName':'Volt Typhoon'}]
  out,_=mod.review_candidates([{'title':'Volt Typhoon','url':'javascript:bad','published':''}],actors,{},now,8,'Publisher');self.assertFalse(out)
  out,_=mod.review_candidates([{'title':'Volt Typhoon','url':'https://example.org/a','published':'2025-01-01'}],actors,{},now,8,'Publisher');self.assertFalse(out)
 def test_defaults_cover_four_countries_and_mitre_release_requires_review(self):
  self.assertIsNotNone(mod)
  config=json.loads(pathlib.Path('config/monitoring.json').read_text());bundle=json.loads(pathlib.Path('data/bundle.json').read_text());actors={a['id']:a for a in bundle['actors']}
  self.assertEqual({actors[i]['country'] for i in config['actorIds']},{'CN','RU','IR','KP'});self.assertFalse(config['paidResearchEnabled']);self.assertTrue(config['profileUpdatesRequireApproval'])
  items=mod.parse_feed(json.dumps([{'tag_name':'v20','name':'ATT&CK release','html_url':'https://github.com/mitre-attack/attack-stix-data/releases/tag/v20','published_at':'2026-10-24T09:00:00Z'}]).encode(),'github-releases')
  now=datetime.datetime(2026,10,24,12,tzinfo=datetime.timezone.utc);out,_=mod.review_candidates(items,[],{},now,8,'MITRE ATT&CK releases')
  self.assertEqual(out[0]['category'],'taxonomy');self.assertEqual(out[0]['status'],'Ready for Review')
