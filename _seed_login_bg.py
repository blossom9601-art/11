# -*- coding: utf-8 -*-
"""Seed login.backgroundImage into brand_setting table."""
from app import create_app
from app.models import db

app = create_app()
with app.app_context():
    row = db.session.execute(
        db.text("SELECT id FROM brand_setting WHERE `key`='login.backgroundImage'")
    ).fetchone()
    if row:
        print('Already exists, id=', row[0])
    else:
        db.session.execute(db.text(
            "INSERT INTO brand_setting (category, `key`, value, value_type) "
            "VALUES ('login', 'login.backgroundImage', '/static/image/login/bada.png', 'image')"
        ))
        db.session.commit()
        print('Inserted login.backgroundImage seed')
