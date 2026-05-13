# Auth Testing Playbook (Emergent Google Auth)

## Create Test User & Session
```
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Test Backend API
```
curl -X GET "$URL/api/auth/me" -H "Authorization: Bearer <SESSION_TOKEN>"
curl -X GET "$URL/api/favorites" -H "Authorization: Bearer <SESSION_TOKEN>"
```

## Success
- `/api/auth/me` returns user JSON
- Favorites CRUD work with Bearer token

## Notes
- Sessions stored in `user_sessions` with `user_id`, `session_token`, `expires_at`
- Backend accepts Authorization: Bearer <token> OR session_token cookie
