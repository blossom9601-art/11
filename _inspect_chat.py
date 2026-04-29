import sqlite3
con = sqlite3.connect('/opt/blossom/web/instance/dev_blossom.db')
c = con.cursor()
print('-- all msgs --')
for r in c.execute('SELECT id, room_id, sender_user_id, created_at, is_deleted FROM msg_message ORDER BY id').fetchall():
    print(r)
print()
print('-- room3 msgs --')
for r in c.execute('SELECT * FROM msg_message WHERE room_id=3').fetchall():
    print(r)
print()
print('-- members for user 1 --')
for r in c.execute('SELECT id, room_id, user_id, joined_at, left_at FROM msg_room_member WHERE user_id=1').fetchall():
    print(r)
