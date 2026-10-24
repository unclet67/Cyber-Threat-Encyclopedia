#!/usr/bin/env python3
"""Bounded public-feed screening. Produces review candidates only; no profile or API writes."""
import datetime as dt
import email.utils
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ALLOWED_HOSTS = {'www.cisa.gov','www.microsoft.com','cloud.google.com','blog.talosintelligence.com','www.ncsc.gov.uk','api.github.com'}

def clean(value):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html.unescape(value or ''))).strip()[:20000]

def safe_url(value):
    try:
        u=urllib.parse.urlsplit(value)
        return u.scheme in ('https','http') and bool(u.hostname) and not u.username and not u.password
    except ValueError:
        return False

def parse_feed(raw, kind):
    if len(raw)>2000000:
        raise ValueError('Feed exceeds 2 MB ceiling')
    if kind=='github-releases':
        return [{'title':clean(x.get('name') or x.get('tag_name')), 'summary':clean(x.get('body')), 'url':x.get('html_url',''), 'published':x.get('published_at',''), 'category':'taxonomy'} for x in json.loads(raw)[:100] if not x.get('draft') and not x.get('prerelease')]
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('Unsupported XML entities')
    root=ET.fromstring(raw)
    result=[]
    for item in root.iter():
        if item.tag.split('}')[-1] not in ('item','entry'): continue
        vals={}; link=''
        for child in item:
            key=child.tag.split('}')[-1]
            value=''.join(child.itertext())
            if key=='link' and child.attrib.get('rel','alternate')=='alternate':link=child.attrib.get('href') or value
            vals[key]=value
        result.append({'title':clean(vals.get('title')), 'summary':clean(vals.get('description') or vals.get('summary') or vals.get('content')), 'url':link.strip(), 'published':vals.get('pubDate') or vals.get('published') or vals.get('updated') or ''})
        if len(result)>=500:break
    if root.tag.split('}')[-1] not in ('rss','feed','RDF'):
        raise ValueError('Response is not an RSS or Atom feed')
    return result

def published_date(value):
    if not value:return None
    try:
        value=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
    except ValueError:
        try:value=email.utils.parsedate_to_datetime(value)
        except (TypeError,ValueError,OverflowError):return None
    return value.replace(tzinfo=value.tzinfo or dt.timezone.utc).astimezone(dt.timezone.utc)

def review_candidates(items, actors, seen, now, days, publisher):
    seen=dict(seen);out=[]
    for item in items:
        if not safe_url(item.get('url','')):continue
        published=published_date(item.get('published',''))
        if published and (published < now-dt.timedelta(days=days) or published>now+dt.timedelta(hours=24)):continue
        text=clean(item.get('title','')+' '+item.get('summary',''))
        matches={}
        for actor in actors:
            names=[actor.get('primaryName',''),actor.get('msName','')]+[a.get('name','') for a in actor.get('aliases',[]) if isinstance(a,dict)]
            found=sorted({n for n in names if len(n.strip())>=4 and re.search(r'(?<!\w)'+re.escape(n.strip())+r'(?!\w)',text,re.I)})
            if found:matches[actor['id']]=found
        if not matches and item.get('category')!='taxonomy':continue
        # Include content fingerprint so an updated report at the same URL can re-enter review.
        key=hashlib.sha256((item['url']+'\n'+text+'\n'+item.get('published','')).encode()).hexdigest()
        if key in seen:continue
        seen[key]=now.isoformat()
        out.append({'id':key,'title':item.get('title','Untitled'),'url':item['url'],'publisher':publisher,'publicationDate':item.get('published') or None,'publicationDateVerified':False,'retrievedAt':now.isoformat(),'actorIds':list(matches),'matchedNames':matches,'category':item.get('category','actor-reporting'),'summaryExcerpt':clean(item.get('summary',''))[:1200],'status':'Ready for Review','profileUpdatesApplied':False,'cautions':['Feed match is a research lead, not verified attribution or campaign linkage.','Verify original reporting, publication date and alias scope before proposing profile changes.']})
    # Keep one year of deduplication state; invalid cache rows are discarded.
    return out,{k:v for k,v in seen.items() if isinstance(v,str) and published_date(v) and published_date(v)>now-dt.timedelta(days=366)}

def main():
    config=json.loads(Path('config/monitoring.json').read_text())
    if config.get('paidResearchEnabled') is not False or config.get('profileUpdatesRequireApproval') is not True:
        raise ValueError('Monitoring must remain free and review-only')
    bundle=json.loads(Path('data/bundle.json').read_text()); by_id={a['id']:a for a in bundle['actors']}
    actors=[by_id[i] for i in config['actorIds']]
    if {a['country'] for a in actors}!={'CN','RU','IR','KP'}:raise ValueError('Expected all four country watch groups')
    output=Path('.monitoring');output.mkdir(exist_ok=True)
    state=output/'seen.json'
    try:seen=json.loads(state.read_text())
    except (FileNotFoundError,json.JSONDecodeError):seen={}
    now=dt.datetime.now(dt.timezone.utc);candidates=[];errors=[];successful=0
    for feed in config['feeds'][:8]:
        try:
            if urllib.parse.urlsplit(feed['url']).hostname not in ALLOWED_HOSTS:raise ValueError('Unapproved feed host')
            request=urllib.request.Request(feed['url'],headers={'User-Agent':'Cyber-Threat-Encyclopedia-Monitor/1.0','Accept':'application/rss+xml, application/atom+xml, application/json, application/xml, text/xml'})
            with urllib.request.urlopen(request,timeout=min(config['requestTimeoutSeconds'],20)) as response:
                if urllib.parse.urlsplit(response.url).hostname not in ALLOWED_HOSTS:raise ValueError('Unapproved feed redirect')
                raw=response.read(min(config['maxFeedBytes'],2000000)+1)
            items=parse_feed(raw,feed['format'])
            found,seen=review_candidates(items,actors,seen,now,min(config['lookbackDays'],14),feed['name'])
            candidates.extend(found);successful+=1
        except Exception as error:
            errors.append({'feed':feed['name'],'error':type(error).__name__+': '+str(error)[:200]})
    result={'generatedAt':now.isoformat(),'status':'Ready for Review','profileUpdatesApplied':False,'paidAPICalls':0,'actorsMonitored':config['actorIds'],'successfulFeeds':successful,'feedCount':len(config['feeds'][:8]),'coverage':'partial' if errors else 'configured feeds checked','limitations':['Feed screening is not exhaustive web research.','Private Site watchlists are not sent to GitHub; shared config/monitoring.json controls this scan.'],'feedErrors':errors,'candidates':candidates}
    (output/'review-candidates.json').write_text(json.dumps(result,indent=2))
    state.write_text(json.dumps(seen))
    # Feed text is untrusted. Only write fixed labels/counts to the Actions-rendered summary.
    summary=f'## Weekly actor monitoring\n\n{len(candidates)} review candidates; {successful}/{len(config["feeds"][:8])} feeds checked. Paid API calls: 0. Profile writes: 0.\n\nDownload the review-candidates artifact. Verify sources and approve changes manually.\n'
    (output/'summary.md').write_text(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:f.write(summary)
    print(summary)
    return 0 if successful else 1

if __name__=='__main__':sys.exit(main())
