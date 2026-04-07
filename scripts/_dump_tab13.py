from app import create_app
app = create_app()
c = app.test_client()
r = c.get('/p/hw_server_onpremise_package')
html = r.data.decode('utf-8')
# Save to file for inspection
with open('_tab13_served.html', 'w', encoding='utf-8') as f:
    f.write(html)
print(f'Status: {r.status_code}, Length: {len(html)}')
# Check key markers
for needle in ['pk-page-size-wrap', 'pk-download-btn', 'tab13-package.css', 'detail.css', 'page-size-selector', 'page-size-select']:
    idx = html.find(needle)
    if idx > -1:
        print(f'  FOUND [{needle}] at {idx}: ...{html[max(0,idx-30):idx+50]}...')
    else:
        print(f'  MISSING [{needle}]')
