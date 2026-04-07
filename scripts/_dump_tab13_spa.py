from app import create_app
app = create_app()
c = app.test_client()
# SPA 요청 시뮬레이션
r = c.get('/p/hw_server_onpremise_package', headers={'X-Requested-With': 'blossom-spa'})
html = r.data.decode('utf-8')
with open('_tab13_spa.html', 'w', encoding='utf-8') as f:
    f.write(html)
print(f'Status: {r.status_code}, Length: {len(html)}')
for needle in ['pk-page-size-wrap', 'pk-download-btn', 'tab13-package.css', 'detail.css?v=4.35', 'page-size-selector', 'add-btn-icon']:
    idx = html.find(needle)
    if idx > -1:
        ctx = html[max(0,idx-40):idx+60].replace('\n',' ').strip()
        print(f'  FOUND [{needle}]: ...{ctx}...')
    else:
        print(f'  MISSING [{needle}]')
