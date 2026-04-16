from app import create_app
from app.models import UserProfile
app = create_app()
with app.app_context():
    from app import db
    
    # Fix ADMIN profile (id=2)
    admin_profile = UserProfile.query.filter_by(id=2).first()
    if admin_profile:
        old_dept = admin_profile.department
        old_img = admin_profile.profile_image
        
        # Update to admin group (관리자)
        admin_profile.department = '관리자'
        
        db.session.commit()
        print(f'✓ Updated ADMIN profile:')
        print(f'  Department: {old_dept} -> {admin_profile.department}')
        print(f'  Current Profile Image: {old_img}')
        print(f'  emp_no: {admin_profile.emp_no}')
