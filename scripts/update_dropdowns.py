from pathlib import Path

ROOT = Path('c:/Users/ME/Desktop/blossom').resolve()
HTML_GLOB = 'app/templates/**/1.*.html'
JS_GLOB = 'static/js/2.hardware/**/1.*.js'
HTML_TARGET = '<select name="virtualization" class="form-input">'
HTML_REPLACEMENT = '<select name="virtualization" class="form-input search-select" data-searchable="false">'
JS_OLD_BLOCK = """        if(opts[col]){\n            return `<select name=\"${col}\" class=\"form-input ${['confidentiality','integrity','availability'].includes(col)?'score-trigger':''}\">`+\n                opts[col].map(o=>`<option value=\"${o}\" ${o===String(value)?'selected':''}>${o||'-'}</option>`).join('')+`</select>`;\n        }\n"""
JS_NEW_BLOCK = """        if(opts[col]){\n            const isScoreField = ['confidentiality','integrity','availability'].includes(col);\n            const classList = ['form-input','search-select'];\n            if(isScoreField){ classList.push('score-trigger'); }\n            return `<select name=\"${col}\" class=\"${classList.join(' ')}\" data-searchable=\"false\">`+\n                opts[col].map(o=>`<option value=\"${o}\" ${o===String(value)?'selected':''}>${o||'-'}</option>`).join('')+`</select>`;\n        }\n"""

def patch_html_files():
    count = 0
    for path in ROOT.glob(HTML_GLOB):
        text = path.read_text(encoding='utf-8')
        if HTML_TARGET not in text:
            continue
        new_text = text.replace(HTML_TARGET, HTML_REPLACEMENT)
        if new_text != text:
            path.write_text(new_text, encoding='utf-8')
            count += 1
    return count

def patch_js_files():
    count = 0
    for path in ROOT.glob(JS_GLOB):
        text = path.read_text(encoding='utf-8')
        if JS_OLD_BLOCK not in text:
            continue
        new_text = text.replace(JS_OLD_BLOCK, JS_NEW_BLOCK)
        if new_text == text:
            continue
        path.write_text(new_text, encoding='utf-8')
        count += 1
    return count

html_count = patch_html_files()
js_count = patch_js_files()
print({'html_updated': html_count, 'js_updated': js_count})
