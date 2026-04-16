import re

with open('static/css/category2.css', encoding='utf-8') as f:
    content = f.read()

# Find .server-add-body or .server-edit-body at start of line (no prefix selector)
matches = list(re.finditer(r'^(\.(server-add-body|server-edit-body)[\s,{])', content, re.MULTILINE))
print(f"Base rules found: {len(matches)}")
for m in matches:
    line_no = content[:m.start()].count('\n') + 1
    print(f"  Line {line_no}: {content[m.start():m.start()+150].split(chr(10))[0]}")

print()
# Also check blossom.css
with open('static/css/blossom.css', encoding='utf-8') as f:
    content2 = f.read()
matches2 = list(re.finditer(r'^(\.(server-add-body|server-edit-body)[\s,{])', content2, re.MULTILINE))
print(f"blossom.css base rules: {len(matches2)}")
for m in matches2:
    line_no = content2[:m.start()].count('\n') + 1
    print(f"  Line {line_no}: {content2[m.start():m.start()+150].split(chr(10))[0]}")

# Check for padding in category2.css near the modal body sections
print()
print("=== category2.css lines with 'padding' near the modal section (search 'form-section') ===")
for i, line in enumerate(content.split('\n'), 1):
    if 200 <= i <= 400 and 'padding' in line.lower():
        print(f"  {i}: {line}")

# Find server-add-content padding rules
print()
print("=== server-add-content padding ===")
for m in re.finditer(r'server-add-content', content):
    line_no = content[:m.start()].count('\n') + 1
    snippet = content[m.start():m.start()+200].split('\n')[0]
    print(f"  Line {line_no}: {snippet}")
