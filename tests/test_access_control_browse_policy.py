from app.services import web_access_control_service as service


def test_policy_extra_columns_and_browse_snapshot(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        with service._get_connection(app) as conn:
            cols = {row[1] for row in conn.execute(f'PRAGMA table_info({service.POLICY_TABLE})').fetchall()}
        assert 'web_open_mode' in cols
        assert 'web_host_gate_patterns' in cols
        assert 'web_iframe_allow_patterns' in cols
        assert 'web_infra_runbook' in cols

        service.update_default_policy(
            {
                'web_open_mode': 'iframe_embed',
                'web_host_gate_patterns': 'good.example.com\n',
                'web_iframe_allow_patterns': 'good.example.com',
                'web_infra_runbook': 'proxy: https://gate.test/',
            },
            'pytest',
            app,
        )
        snap = service.get_browse_policy_for_user(app)
        assert snap['web_open_mode'] == 'iframe_embed'
        assert snap['web_host_gate_patterns'] == ['good.example.com']
        assert snap['web_iframe_allow_patterns'] == ['good.example.com']
