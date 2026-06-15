"""Create admin account."""
import sys; sys.path.insert(0, '.')
from core.db import get_teacher_by_email, create_teacher, update_teacher
from core.security import hash_password

email = 'eudesjohn@gmail.com'
password = 'Johnson@@40'

existing = get_teacher_by_email(email)
if existing:
    update_teacher(existing['id'], {
        'password_hash': hash_password(password),
        'role': 'admin',
        'is_verified': True,
        'full_name': 'Eudes Johnson',
        'login_attempts': 0,
        'locked_until': None,
    })
    print('Admin updated')
else:
    t = create_teacher({
        'email': email,
        'password_hash': hash_password(password),
        'full_name': 'Eudes Johnson',
        'institution': 'PEAN',
        'discipline': 'Administration',
        'role': 'admin',
        'is_verified': True,
    })
    if t:
        print('Admin created')

check = get_teacher_by_email(email)
if check:
    print(f"Role: {check['role']}, Verified: {check['is_verified']}")
else:
    print('Not found')
