import re
text = open('app/routes/pages.py', encoding='utf-8').read()
start = text.find("TEMPLATE_MAP = {")
depth = 0
end = start
found = False
for i in range(start, len(text)):
    ch = text[i]
    if ch == '{':
        depth += 1
    elif ch == '}':
        depth -= 1
        if depth == 0:
            end = i + 1
            found = True
            break
block = text[start:end]
keys = re.findall(r"'([^']+)'\s*:", block)
for k in keys:
    print('/p/' + k)
print('')
print('Total: ' + str(len(keys)) + ' routes')
