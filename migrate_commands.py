#!/usr/bin/env python3
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parent
old=json.loads((ROOT/'commands.json').read_text(encoding='utf-8'))
seed=json.loads((ROOT/'workflows.seed.json').read_text(encoding='utf-8'))
def slug(v):
    v=re.sub(r'[^a-z0-9-]+','-',str(v).lower()).strip('-')
    return re.sub(r'-+','-',v) or 'task'
def convert(c):
    return {
      'id':'legacy-'+slug(c['id']),'entity_type':'task','content_level':'legacy',
      'title_ar':c['title_ar'],'goal_ar':c['title_ar'],'summary_ar':c['description_ar'],
      'category':c.get('category','legacy'),'difficulty':'beginner','estimated_minutes':3,
      'keywords_ar':list(dict.fromkeys(c.get('keywords_ar',[])+[c['title_ar'],c['command']])),
      'supported_versions':c.get('rhel_versions',['8','9','10']),'risk':c.get('risk','low'),
      'prerequisites_ar':['صلاحية sudo'] if c.get('requires_sudo') else [],'variables':[],
      'steps':[{'id':'run-command','title_ar':c['title_ar'],'command':c['command'],
                'explanation_ar':c['description_ar'],'requires_sudo':bool(c.get('requires_sudo')),
                'risk':c.get('risk','low'),'optional':False,'expected_result_ar':'','notes_ar':c.get('notes_ar','')}],
      'verification':[],'rollback_ar':[],'common_errors':[],'files':[],'ports':[],
      'related_tasks':[],'safety_notes_ar':[c['notes_ar']] if c.get('notes_ar') else [],
      'sources':[],'status':'draft'}
categories=dict(old.get('categories',{})); categories.update(seed.get('categories',{}))
result={'schema_version':'2.0.0','project':'RHEL Arabic Knowledge Base','language':'ar',
        'baseline':old.get('baseline','Red Hat Enterprise Linux 9'),
        'supported_versions':old.get('supported_versions',['8','9','10']),
        'categories':categories,'tasks':seed['tasks']+[convert(c) for c in old['commands']]}
(ROOT/'knowledge.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('Curated workflows:',len(seed['tasks']))
print('Legacy tasks:',len(old['commands']))
print('Total tasks:',len(result['tasks']))
