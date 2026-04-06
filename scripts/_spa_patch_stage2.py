"""Stage 2: Convert remaining window.location.href navigations to blsSpaNavigate.
Covers DETAIL_URL, _virtTabMap, buildDetailUrl, variable href patterns.
Excludes: blossom.js, auth login/redirect, /api/, /static/, mailto:.
Safe UTF-8. No binary files."""
import os, re

ROOT = os.path.join(os.path.dirname(__file__), '..', 'static', 'js')
SKIP = {'blossom.js'}

# Files where window.location.href = <variable> should NOT be converted
SKIP_VARIABLE_IN = {
    'sign-in.js',     # login redirect → needs full reload
    '3.chat.js',      # mailto: links
}

# Broad pattern: any window.location.href = <expr>;
PAT_ALL = re.compile(
    r'(window\.location\.href\s*=\s*)([^;]+)(;)'
)

def should_convert(fname, line_stripped):
    """Return True if this line should be converted to blsSpaNavigate."""
    if 'blsSpaNavigate' in line_stripped:
        return False
    if line_stripped.startswith('//') or line_stripped.startswith('*'):
        return False
    # Already handled auth/api/static
    if '/login' in line_stripped or '/logout' in line_stripped:
        return False
    if '/api/' in line_stripped and 'download' in line_stripped:
        return False
    if 'mailto:' in line_stripped:
        return False
    if fname in SKIP_VARIABLE_IN:
        return False
    return True

changed_files = []
total_replacements = 0

for dirpath, _, files in os.walk(ROOT):
    for fname in files:
        if not fname.endswith('.js') or fname in SKIP:
            continue
        fpath = os.path.join(dirpath, fname)
        try:
            text = open(fpath, encoding='utf-8').read()
        except (UnicodeDecodeError, PermissionError):
            continue

        original = text
        lines = text.split('\n')
        new_lines = []
        file_count = 0

        for line in lines:
            stripped = line.strip()
            if not should_convert(fname, stripped) or not PAT_ALL.search(stripped):
                new_lines.append(line)
                continue

            # Replace window.location.href = EXPR; → blsSpaNavigate(EXPR);
            new_line = PAT_ALL.sub(lambda m: 'blsSpaNavigate(' + m.group(2).strip() + ');', line, count=1)
            if new_line != line:
                file_count += 1
            new_lines.append(new_line)

        if file_count > 0:
            new_text = '\n'.join(new_lines)
            with open(fpath, 'w', encoding='utf-8', newline='\n') as f:
                f.write(new_text)
            rel = os.path.relpath(fpath, ROOT)
            changed_files.append((rel, file_count))
            total_replacements += file_count
            print(f'  ✓ {rel}  ({file_count} replacements)')

print(f'\nTotal: {len(changed_files)} files, {total_replacements} replacements')
