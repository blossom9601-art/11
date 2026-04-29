import sys
sys.path.insert(0, '/opt/blossom/web')
import os
os.chdir('/opt/blossom/web')
from app import create_app
from app.models import db, MsgChannel, MsgConversation, MsgConversationMember, MsgMessageV2

app = create_app()
with app.app_context():
    channels = MsgChannel.query.all()
    for ch in channels:
        conv = MsgConversation.query.get(ch.conversation_id) if ch.conversation_id else None
        print(f'channel.id={ch.id} name={ch.name!r} conv_id={ch.conversation_id} conv_deleted={conv.is_deleted if conv else "N/A"}')
    print(f'total channels: {len(channels)}')
