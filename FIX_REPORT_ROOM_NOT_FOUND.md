# Fix Report: Room not found

- Web Render client now uses same-origin Socket.IO.
- Native iOS backend URL remains configured for Capacitor only.
- Fixed recursive `applyScore()` bug.
- Disabled service worker cache to avoid stale JS.
- Added `/api/health` and `/api/rooms` debug endpoints.

Syntax checks:
- server.js: OK 
- client.js: OK 
