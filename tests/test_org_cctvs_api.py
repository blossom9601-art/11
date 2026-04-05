import pytest


@pytest.mark.usefixtures("client")
def test_org_cctvs_unique_business_name(client):
    base = {
        "business_status": "가동",
        "vendor": "HPE",
        "model": "DL380",
        "place": "센터-A",
        "business_name": "업무-중복금지-1",
    }

    r1 = client.post("/api/org-cctvs", json=base)
    assert r1.status_code == 201, r1.get_json()

    r2 = client.post("/api/org-cctvs", json=base)
    assert r2.status_code == 400
    body = r2.get_json()
    assert body["success"] is False
    assert "업무 이름" in body["message"]


@pytest.mark.usefixtures("client")
def test_org_cctvs_unique_serial_number(client):
    base = {
        "business_status": "가동",
        "vendor": "HPE",
        "model": "DL380",
        "place": "센터-A",
        "serial": "SN-UNIQ-001",
    }

    r1 = client.post("/api/org-cctvs", json=base)
    assert r1.status_code == 201, r1.get_json()

    r2 = client.post("/api/org-cctvs", json=base)
    assert r2.status_code == 400
    body = r2.get_json()
    assert body["success"] is False
    assert "시스템 일련번호" in body["message"]


@pytest.mark.usefixtures("client")
def test_org_cctvs_unique_on_update(client):
    r1 = client.post(
        "/api/org-cctvs",
        json={
            "business_status": "가동",
            "vendor": "HPE",
            "model": "DL380",
            "place": "센터-A",
            "business_name": "업무-업데이트-1",
            "serial": "SN-UPD-001",
        },
    )
    assert r1.status_code == 201, r1.get_json()
    id1 = r1.get_json()["item"]["id"]

    r2 = client.post(
        "/api/org-cctvs",
        json={
            "business_status": "가동",
            "vendor": "DELL",
            "model": "R750",
            "place": "센터-B",
            "business_name": "업무-업데이트-2",
            "serial": "SN-UPD-002",
        },
    )
    assert r2.status_code == 201, r2.get_json()
    id2 = r2.get_json()["item"]["id"]

    # try to update 2 -> duplicate business_name
    r = client.put(f"/api/org-cctvs/{id2}", json={"business_name": "업무-업데이트-1"})
    assert r.status_code == 400
    assert "업무 이름" in r.get_json()["message"]

    # try to update 2 -> duplicate serial
    r = client.put(f"/api/org-cctvs/{id2}", json={"serial": "SN-UPD-001"})
    assert r.status_code == 400
    assert "시스템 일련번호" in r.get_json()["message"]

    # sanity: updating itself with same values should be ok
    r = client.put(f"/api/org-cctvs/{id1}", json={"business_name": "업무-업데이트-1", "serial": "SN-UPD-001"})
    assert r.status_code == 200, r.get_json()


def test_org_cctvs_bulk_update_persists(client):
    base_1 = {
        'business_status': '가동',
        'vendor': 'HPE',
        'model': 'DL380',
        'place': '센터-A',
        'business_name': '업무-벌크-1',
    }
    base_2 = {
        'business_status': '가동',
        'vendor': 'DELL',
        'model': 'R750',
        'place': '센터-A',
        'business_name': '업무-벌크-2',
    }

    r1 = client.post('/api/org-cctvs', json=base_1)
    assert r1.status_code == 201, r1.get_json()
    id1 = r1.get_json()['item']['id']

    r2 = client.post('/api/org-cctvs', json=base_2)
    assert r2.status_code == 201, r2.get_json()
    id2 = r2.get_json()['item']['id']

    bulk = client.post(
        '/api/org-cctvs/bulk-update',
        json={'ids': [id1, id2], 'updates': {'business_status': '대기', 'place': '센터-B'}},
    )
    assert bulk.status_code == 200, bulk.get_json()
    payload = bulk.get_json()
    assert payload['success'] is True
    assert payload['updated'] == 2

    listed = client.get('/api/org-cctvs').get_json()['items']
    by_id = {row['id']: row for row in listed}
    assert by_id[id1]['business_status'] == '대기'
    assert by_id[id2]['business_status'] == '대기'
    assert by_id[id1]['place'] == '센터-B'
    assert by_id[id2]['place'] == '센터-B'
