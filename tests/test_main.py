def test_home_page(client):
    """홈페이지가 정상적으로 로드되는지 테스트합니다."""
    response = client.get('/')
    assert response.status_code == 200
    assert b'Blossom' in response.data

def test_dashboard_page(client):
    """대시보드 페이지가 정상적으로 로드되는지 테스트합니다."""
    response = client.get('/dashboard')
    assert response.status_code == 200
    html = response.data.decode('utf-8')
    assert '자산관리 시스템' in html

def test_api_dashboard_stats(client):
    """대시보드 통계 API가 정상적으로 작동하는지 테스트합니다."""
    response = client.get('/api/dashboard/stats')
    assert response.status_code == 200
    
    data = response.get_json()
    assert 'total_companies' in data
    assert 'total_servers' in data
    assert 'total_employees' in data
    assert 'total_projects' in data

def test_api_companies_empty(client):
    """회사 목록 API가 빈 상태에서 정상적으로 작동하는지 테스트합니다."""
    response = client.get('/api/companies')
    assert response.status_code == 200
    
    data = response.get_json()
    assert isinstance(data, list)
    assert len(data) == 0

def test_api_servers_empty(client):
    """서버 목록 API가 빈 상태에서 정상적으로 작동하는지 테스트합니다."""
    response = client.get('/api/servers')
    assert response.status_code == 200
    
    data = response.get_json()
    assert isinstance(data, list)
    assert len(data) == 0

def test_api_employees_empty(client):
    """직원 목록 API가 빈 상태에서 정상적으로 작동하는지 테스트합니다."""
    response = client.get('/api/employees')
    assert response.status_code == 200
    
    data = response.get_json()
    assert isinstance(data, list)
    assert len(data) == 0

def test_api_projects_empty(client):
    """프로젝트 목록 API가 빈 상태에서 정상적으로 작동하는지 테스트합니다."""
    response = client.get('/api/projects')
    assert response.status_code == 200
    
    data = response.get_json()
    assert isinstance(data, list)
    assert len(data) == 0

def test_api_tasks_empty(client):
    """작업 목록 API가 빈 상태에서 정상적으로 작동하는지 테스트합니다."""
    response = client.get('/api/tasks')
    assert response.status_code == 200
    
    data = response.get_json()
    assert isinstance(data, list)
    assert len(data) == 0

def test_404_page(client):
    """존재하지 않는 페이지 요청 시 404 페이지가 렌더링되는지 테스트합니다."""
    response = client.get('/this-page-does-not-exist')
    assert response.status_code == 404
    html = response.data.decode('utf-8')
    assert '페이지를 찾을 수 없습니다' in html

def test_construction_page(client):
    """공사중 페이지가 정상적으로 로드되는지 테스트합니다."""
    response = client.get('/construction')
    assert response.status_code == 200
    html = response.data.decode('utf-8')
    assert '공사중' in html
