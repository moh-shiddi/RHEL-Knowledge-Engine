#!/usr/bin/env python3
from pathlib import Path
import json,re,sys
path=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).with_name('knowledge.json')
data=json.loads(path.read_text(encoding='utf-8'))
errors=[]; ids=set(); pat=re.compile(r'^[a-z0-9][a-z0-9-]*$')
required={'id','entity_type','content_level','title_ar','goal_ar','summary_ar','category','difficulty','estimated_minutes','keywords_ar','supported_versions','risk','prerequisites_ar','variables','steps','verification','rollback_ar','common_errors','files','ports','related_tasks','safety_notes_ar','sources','status'}
for i,t in enumerate(data.get('tasks',[])):
    missing=required-set(t)
    if missing: errors.append(f'tasks[{i}] missing: {sorted(missing)}')
    if not pat.fullmatch(t.get('id','')): errors.append(f'tasks[{i}] invalid id')
    if t.get('id') in ids: errors.append(f'tasks[{i}] duplicate id')
    ids.add(t.get('id'))
    if not t.get('steps'): errors.append(f'tasks[{i}] has no steps')
    for j,s in enumerate(t.get('steps',[])):
        if not pat.fullmatch(s.get('id','')): errors.append(f'tasks[{i}].steps[{j}] invalid id')
        if not s.get('command','').strip(): errors.append(f'tasks[{i}].steps[{j}] empty command')
if errors:
    print('Validation failed:',len(errors))
    for e in errors: print('-',e)
    raise SystemExit(1)
print('Valid knowledge file')
print('Tasks:',len(data['tasks']))
print('Workflows:',sum(t['content_level']!='legacy' for t in data['tasks']))
print('Legacy:',sum(t['content_level']=='legacy' for t in data['tasks']))
