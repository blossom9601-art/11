import sys, os
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')

from app import create_app
from app.models import db, MsgChannel, MsgConversation, MsgConversationMember, MsgMessageV2

app = create_app()
with app.app_context():
    channels = MsgChannel.query.all()
    conv_ids = [ch.conversation_id for ch in channels if ch.conversation_id]
    print(f'삭제 대상: {len(channels)}개 채널, conversation_ids={conv_ids}')

    # 1. 메시지 삭제
    deleted_msgs = MsgMessageV2.query.filter(MsgMessageV2.conversation_id.in_(conv_ids)).delete(synchronize_session=False)
    print(f'메시지 {deleted_msgs}개 삭제')

    # 2. 멤버 삭제
    deleted_members = MsgConversationMember.query.filter(MsgConversationMember.conversation_id.in_(conv_ids)).delete(synchronize_session=False)
    print(f'멤버 {deleted_members}개 삭제')

    # 3. 채널 레코드 삭제
    deleted_ch = MsgChannel.query.delete(synchronize_session=False)
    print(f'채널 {deleted_ch}개 삭제')

    # 4. conversation 삭제
    deleted_conv = MsgConversation.query.filter(MsgConversation.id.in_(conv_ids)).delete(synchronize_session=False)
    print(f'대화 {deleted_conv}개 삭제')

    db.session.commit()
    print('완료: 모든 채널 및 연관 데이터 삭제됨')

    # 검증
    remaining = MsgChannel.query.count()
    print(f'남은 채널: {remaining}개')
