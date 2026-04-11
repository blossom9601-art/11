"""Find all db.Text columns that have ForeignKey constraints or are referenced by ForeignKey.
These fail on MySQL because TEXT can't be used in indexes (required for FK).
"""
import re, sys

with open("app/models.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

# Parse all column definitions
results = []
current_class = None
for i, line in enumerate(lines, 1):
    # Track class
    cm = re.match(r'^class\s+(\w+)\(', line)
    if cm:
        current_class = cm.group(1)
    
    # Find db.Text columns with ForeignKey
    if 'db.Text' in line and 'ForeignKey' in line:
        col_m = re.match(r'\s+(\w+)\s*=\s*db\.Column', line)
        if col_m:
            results.append((i, current_class, col_m.group(1), 'FK+Text'))
    
    # Find db.Text columns  with unique=True
    if 'db.Text' in line and 'unique=True' in line:
        col_m = re.match(r'\s+(\w+)\s*=\s*db\.Column', line)
        if col_m:
            results.append((i, current_class, col_m.group(1), 'Unique+Text'))

if results:
    print(f"Found {len(results)} issues:")
    for line_no, cls, col, issue in results:
        print(f"  L{line_no}: {cls}.{col} -> {issue}")
else:
    print("No Text+FK/Unique issues found.")

# Also find all db.Text columns used in table-level ForeignKeyConstraint or Index
# Check for ForeignKey references to Text columns
print("\n--- Also checking FK references to Text columns ---")
# Find all FK target columns
fk_targets = []
for i, line in enumerate(lines, 1):
    fk_match = re.findall(r"ForeignKey\(['\"](\w+)\.(\w+)['\"]\)", line)
    for table, col in fk_match:
        fk_targets.append((table, col, i))

# Find the target columns and check if they are Text
# Build a map of tablename -> {colname: type}
table_columns = {}
current_tablename = None
for i, line in enumerate(lines, 1):
    tn_m = re.match(r'\s+__tablename__\s*=\s*[\'"](\w+)[\'"]', line)
    if tn_m:
        current_tablename = tn_m.group(1)
        table_columns[current_tablename] = {}
    
    if current_tablename:
        col_m = re.match(r'\s+(\w+)\s*=\s*db\.Column\(db\.(Text|String)', line)
        if col_m:
            table_columns[current_tablename][col_m.group(1)] = col_m.group(2)

# Check FK targets
text_fk_targets = []
for table, col, line_no in fk_targets:
    if table in table_columns and col in table_columns[table]:
        if table_columns[table][col] == 'Text':
            text_fk_targets.append((table, col, line_no))

if text_fk_targets:
    print(f"Found {len(text_fk_targets)} FK references TO Text columns:")
    for table, col, line_no in text_fk_targets:
        print(f"  L{line_no}: FK -> {table}.{col} (is Text)")
else:
    print("No FK references to Text columns found.")
