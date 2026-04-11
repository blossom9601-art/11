"""Find db.Text columns that are directly indexed in their own table."""
import re

with open('app/models.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

results = []
current_class = None
table_args_indexes = {}  # class -> set of indexed col names

for i, line in enumerate(lines):
    m = re.match(r'^class\s+(\w+)', line)
    if m:
        current_class = m.group(1)
        table_args_indexes[current_class] = set()

    if current_class:
        # Collect column names from db.Index('name', 'col1', 'col2', ...)
        idx_match = re.findall(r"db\.Index\(\s*'[^']+'\s*,\s*(.+?)\)", line)
        if idx_match:
            cols = re.findall(r"'(\w+)'", idx_match[0])
            table_args_indexes[current_class].update(cols)

# Second pass: find Text columns in their own indexes
current_class = None
for i, line in enumerate(lines):
    m = re.match(r'^class\s+(\w+)', line)
    if m:
        current_class = m.group(1)

    if current_class and current_class in table_args_indexes:
        # db.Text column
        col_m = re.match(r'\s+(\w+)\s*=\s*db\.Column\(db\.Text', line)
        if col_m:
            col_name = col_m.group(1)
            if col_name in table_args_indexes[current_class]:
                results.append(f'L{i+1} {current_class}.{col_name} = db.Text IN OWN INDEX')

        # db.Text with unique=True
        if 'db.Text' in line and 'unique=True' in line:
            col_m2 = re.match(r'\s+(\w+)\s*=\s*db\.Column\(', line)
            if col_m2:
                results.append(f'L{i+1} {current_class}.{col_m2.group(1)} = db.Text + unique=True')

        # db.Text with index=True
        if 'db.Text' in line and 'index=True' in line:
            col_m3 = re.match(r'\s+(\w+)\s*=\s*db\.Column\(', line)
            if col_m3:
                results.append(f'L{i+1} {current_class}.{col_m3.group(1)} = db.Text + index=True')

for r in sorted(set(results)):
    print(r)
