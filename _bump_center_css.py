import re, glob

files = glob.glob('app/templates/**/*.html', recursive=True)
for f in files:
    text = open(f, encoding='utf-8').read()
    if 'center.css?' in text:
        text2 = re.sub(r'center\.css\?v=[^"\']+', 'center.css?v=1.2.2', text)
        if text2 != text:
            with open(f, 'w', encoding='utf-8', newline='\n') as fh:
                fh.write(text2)
            print('Updated:', f)
        else:
            print('Already OK:', f)
