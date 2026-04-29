from app import create_app
from app.models import MsgChannel, MsgConversation, MsgMessageV2
app = create_app()
with app.app_context():
    ch = MsgChannel.query.filter_by(name='smoke-040545').first()
    if ch:
        print(f"channel.id={ch.id}  conversation_id={ch.conversation_id}")
        conv = MsgConversation.query.get(ch.conversation_id)
        if conv:
            print(f"conversation.id={conv.id}  type={conv.conversation_type}  deleted={conv.is_deleted}")
        else:
            print("conversation NOT FOUND")
        msgs = MsgMessageV2.query.filter_by(conversation_id=ch.conversation_id).count()
        print(f"messages count={msgs}")
    else:
        print("channel 'smoke-040545' not found")
