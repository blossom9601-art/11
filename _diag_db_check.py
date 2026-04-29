import sys, os
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')
from app import create_app
from app.models import MsgChannel, MsgConversation
app = create_app()
with app.app_context():
    ch_cnt = MsgChannel.query.count()
    conv_cnt = MsgConversation.query.count()
    print(f'channels: {ch_cnt}')
    print(f'conversations: {conv_cnt}')
    # 남은 것들 목록
    for c in MsgConversation.query.all():
        print(f'  conv id={c.id} type={c.conversation_type} name={c.name!r} deleted={c.is_deleted}')
