# CyberShield — Frontend + Real Backend

The original frontend design/sections are preserved. The demo `localStorage` data layer has been replaced with a Node.js + Express + MongoDB backend.

## Folder structure
- frontend/index.html
- frontend/style.css
- frontend/app.js
- backend/server.js
- backend/uploads/
- package.json
- .env.example

## Setup
1. Install Node.js 18+.
2. Create a MongoDB Atlas database and copy its connection string.
3. Copy `.env.example` to `.env`.
4. Generate an admin password hash:
   `node -e "const b=require('bcryptjs'); console.log(b.hashSync('YourStrongPasswordHere',12))"`
5. Put the generated hash into `ADMIN_PASSWORD_HASH`.
6. Run:
   `npm install`
   `npm start`
7. Open `http://localhost:5000`.

## Important
The admin password is NOT stored in frontend code. Keep `.env` private.
Evidence files are stored under `backend/uploads/`; for production hosting, use persistent storage/object storage.
