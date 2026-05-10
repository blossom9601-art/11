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
        assert 'access_click_cooldown_seconds' in cols
        assert 'access_rate_limit_window_seconds' in cols
        assert 'access_rate_limit_max_count' in cols

        service.update_default_policy(
            {
                'web_open_mode': 'iframe_embed',
                'web_host_gate_patterns': 'good.example.com\n',
                'web_iframe_allow_patterns': 'good.example.com',
                'web_infra_runbook': 'proxy: https://gate.test/',
                'access_click_cooldown_seconds': 4,
                'access_rate_limit_window_seconds': 30,
                'access_rate_limit_max_count': 2,
            },
            'pytest',
            app,
        )
        snap = service.get_browse_policy_for_user(app)
        assert snap['web_open_mode'] == 'iframe_embed'
        assert snap['web_host_gate_patterns'] == ['good.example.com']
        assert snap['web_iframe_allow_patterns'] == ['good.example.com']
        assert snap['access_click_cooldown_seconds'] == 4
        assert snap['access_rate_limit_window_seconds'] == 30
        assert snap['access_rate_limit_max_count'] == 2

        saved = service.update_default_policy(
            {
                'default_period_days': 9999,
                'max_period_days': 9999,
                'notify_before_days': 9999,
                'access_click_cooldown_seconds': 9999,
                'access_rate_limit_window_seconds': 999999,
                'access_rate_limit_max_count': 9999,
            },
            'pytest',
            app,
        )
        assert saved['default_period_days'] == 365
        assert saved['max_period_days'] == 365
        assert saved['notify_before_days'] == 30
        assert saved['access_click_cooldown_seconds'] == 60
        assert saved['access_rate_limit_window_seconds'] == 3600
        assert saved['access_rate_limit_max_count'] == 100
