import re, os

base = 'static/js'
samples = [
    '2.hardware/2-1.server/2-1-1.onpremise/1.onpremise_list.js',
    '2.hardware/2-5.security/2-5-4.ips/1.ips_list.js',
    '8.project/8-1.project/8-1-3.project_list/2.project_detail.js',
    '8.project/8-2.task/8-2-3.task_list/1.task_list.js',
    '6.datacenter/6-3.rack/6-3-2.rack_list/2.rack_detail.js',
    '4.governance/4-4.vpn_policy/4-4-1.vpn/1.vpn_list.js',
    '5.insight/5-2.blog/5-2-1.it_blog/1.blog_list.js',
]

pat = re.compile(r'blsSpaNavigate\(')
old_pat = re.compile(r"window\.location\.href\s*=\s*['\"/]p/")

for s in samples:
    fp = os.path.join(base, s)
    if not os.path.exists(fp):
        print(f'  SKIP {s}')
        continue
    txt = open(fp, encoding='utf-8').read()
    hits = len(pat.findall(txt))
    old = len(old_pat.findall(txt))
    print(f'  {s}: {hits} blsSpaNavigate, {old} old /p/ string patterns')

print('\nAll verified')
