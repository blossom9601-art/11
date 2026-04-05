from pathlib import Path

SRC = Path('static/js/9.category/9-4.component/9-4-6.hba/1.hba_list.js')
DST = Path('static/js/9.category/9-4.component/9-4-7.etc/1.etc_list.js')
text = SRC.read_text(encoding='utf-8')
text = text.replace('HBA', 'ETC')
text = text.replace('hba', 'etc')
DST.write_text(text, encoding='utf-8')
