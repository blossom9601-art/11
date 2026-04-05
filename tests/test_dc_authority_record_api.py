import json


def test_dc_authority_record_crud_flow(client, app):
    """권한 기록 CRUD 전체 흐름 테스트."""

    # 1) Create
    payload = {
        'status': '활성',
        'change_datetime': '2025-06-01 10:00',
        'change_type': '신규 등록',
        'changed_by': '홍길동',
        'manager': '홍길동',
        'change_details': '- 소속: 인프라팀 → 보안팀',
        'change_reason': '팀 개편',
    }
    res = client.post(
        '/api/datacenter/access/authority-records',
        data=json.dumps(payload),
        content_type='application/json',
    )
    assert res.status_code == 201, res.data
    created = res.get_json()
    assert created['id']
    assert created['status'] == '활성'
    assert created['change_type'] == '신규 등록'
    assert created['changed_by'] == '홍길동'
    record_id = created['id']

    # 2) List
    res = client.get('/api/datacenter/access/authority-records')
    assert res.status_code == 200
    rows = res.get_json()
    assert isinstance(rows, list)
    assert any(r['id'] == record_id for r in rows)

    # 3) Get single
    res = client.get(f'/api/datacenter/access/authority-records/{record_id}')
    assert res.status_code == 200
    row = res.get_json()
    assert row['id'] == record_id
    assert row['change_details'] == '- 소속: 인프라팀 → 보안팀'

    # 4) Update
    upd = {
        'status': '만료',
        'change_reason': '프로젝트 종료',
    }
    res = client.put(
        f'/api/datacenter/access/authority-records/{record_id}',
        data=json.dumps(upd),
        content_type='application/json',
    )
    assert res.status_code == 200, res.data
    updated = res.get_json()
    assert updated['status'] == '만료'
    assert updated['change_reason'] == '프로젝트 종료'
    # unchanged fields
    assert updated['changed_by'] == '홍길동'

    # 5) Delete (soft)
    res = client.delete(
        f'/api/datacenter/access/authority-records/{record_id}',
        content_type='application/json',
    )
    assert res.status_code == 200
    assert res.get_json()['success'] is True

    # 6) Get deleted -> 404
    res = client.get(f'/api/datacenter/access/authority-records/{record_id}')
    assert res.status_code == 404


def test_dc_authority_record_bulk_delete(client, app):
    """권한 기록 bulk-delete 테스트."""

    ids = []
    for i in range(3):
        res = client.post(
            '/api/datacenter/access/authority-records',
            data=json.dumps({
                'status': '활성',
                'change_type': '정보 수정',
                'changed_by': f'사용자{i}',
                'change_details': f'변경 {i}',
            }),
            content_type='application/json',
        )
        assert res.status_code == 201
        ids.append(res.get_json()['id'])

    # bulk delete
    res = client.post(
        '/api/datacenter/access/authority-records/bulk-delete',
        data=json.dumps({'ids': ids}),
        content_type='application/json',
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body['success'] is True
    assert body['deleted'] == 3

    # verify all soft-deleted
    for rid in ids:
        res = client.get(f'/api/datacenter/access/authority-records/{rid}')
        assert res.status_code == 404


def test_dc_authority_record_list_filter(client, app):
    """권한 기록 목록 필터링 테스트."""

    for status in ['활성', '만료']:
        client.post(
            '/api/datacenter/access/authority-records',
            data=json.dumps({'status': status, 'change_type': '정보 수정'}),
            content_type='application/json',
        )

    res = client.get('/api/datacenter/access/authority-records?status=활성')
    assert res.status_code == 200
    rows = res.get_json()
    assert all(r['status'] == '활성' for r in rows)

    res = client.get('/api/datacenter/access/authority-records?change_type=정보 수정')
    assert res.status_code == 200
    rows = res.get_json()
    assert all(r['change_type'] == '정보 수정' for r in rows)
