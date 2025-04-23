import firebase_admin
from firebase_admin import auth
# Assume SDK is initialized
firebase_admin.initialize_app()
user_id_to_make_admin = "4KIDbPqDBrWWuxp24lLkJ2bVNXn2"
try:
    # Set custom user claims
    auth.set_custom_user_claims(user_id_to_make_admin, {'role': 'admin'})
    print(f"Successfully set admin claim for user {user_id_to_make_admin}")

    # Optional: Verify by fetching the user record
    # user = auth.get_user(user_id_to_make_admin)
    # print('Custom claims: ', user.custom_claims)
except Exception as e:
    print(f"Error setting custom claims: {e}")
