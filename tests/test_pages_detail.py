import pytest
from app import create_app


@pytest.fixture
def app():
    app = create_app('testing')
    yield app


@pytest.fixture
def client(app):
    return app.test_client()


def test_frame_detail_route_renders(client):
    resp = client.get('/p/hw_server_frame_detail?legacy=1')
    assert resp.status_code == 200, resp.data.decode('utf-8')
    html = resp.data.decode('utf-8')
    assert '기본정보' in html or 'frame_detail' in html


def test_frame_detail_redirect_to_spa(client):
    """Without ?legacy=1, /p/ routes redirect to SPA."""
    resp = client.get('/p/hw_server_frame_detail')
    assert resp.status_code == 302
    assert '/spa/hardware/frame' in resp.headers['Location']


def test_list_redirect_to_spa(client):
    """List pages redirect to corresponding SPA route."""
    resp = client.get('/p/hw_server_onpremise')
    assert resp.status_code == 302
    assert '/spa/hardware/onpremise' in resp.headers['Location']


def test_legacy_bypass(client):
    """?legacy=1 bypasses redirect and renders MPA template."""
    resp = client.get('/p/hw_server_onpremise?legacy=1')
    assert resp.status_code == 200


def test_gov_ad_detail_routes_render(client):
    # Gov detail pages with ?id= trigger session store + internal redirect.
    # Use follow_redirects=True to follow the internal chain.
    resp = client.get('/p/gov_ad_policy_detail?legacy=1&id=1',
                      follow_redirects=True)
    assert resp.status_code == 200, resp.data.decode('utf-8')[:500]

    # tab52 — once context is in session, tab pages render directly
    resp = client.get('/p/gov_ad_policy_account?legacy=1',
                      follow_redirects=True)
    assert resp.status_code == 200, resp.data.decode('utf-8')[:500]

    # tab14
    resp = client.get('/p/gov_ad_policy_log?legacy=1',
                      follow_redirects=True)
    assert resp.status_code == 200, resp.data.decode('utf-8')[:500]

    # tab15
    resp = client.get('/p/gov_ad_policy_file?legacy=1',
                      follow_redirects=True)
    assert resp.status_code == 200, resp.data.decode('utf-8')[:500]


def test_gov_ad_detail_redirect_to_spa(client):
    """Gov AD detail pages redirect to SPA without ?legacy=1."""
    resp = client.get('/p/gov_ad_policy')
    assert resp.status_code == 302
    assert '/spa/governance/ad' in resp.headers['Location']
