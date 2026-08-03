# DCL MINI

**Professional WhatsApp Multi-Device Bot**  
Node.js + Baileys + MongoDB Session Storage + Pairing Website

---

## ⚠️ Important Notices

1. **WhatsApp Terms of Service**  
   Unofficial clients (including Baileys) violate WhatsApp's Terms of Service. Your number can be banned. Use at your own risk. Prefer a secondary number.

2. **Credentials Security**  
   Never commit your `.env` file or share your MongoDB connection string publicly. The URI you posted contains a password — **rotate it** in MongoDB Atlas if this chat is shared.

3. **Under-age / Content**  
   Keep all custom commands appropriate. This starter includes only clean utility & fun commands.

4. **This is a Starter Template**  
   Full production bots with every downloader, AI provider, anti-spam, etc. require significant extra work, API keys, and ongoing maintenance. Download features are stubbed intentionally to avoid copyright / ToS issues.

---

## Features Included

- ✅ Baileys Multi-Device (latest RC)
- ✅ MongoDB session storage (no local auth files)
- ✅ Auto reconnect + session restore
- ✅ Pairing Code + QR login
- ✅ Modern dark-theme pairing website (mobile friendly)
- ✅ Modular command system (`commands/` folders)
- ✅ Owner / Group / Utility / Fun example commands
- ✅ Rate limiting
- ✅ Anti-crash handlers
- ✅ Express dashboard endpoints
- ✅ Docker + docker-compose
- ✅ Procfile (Heroku / Railway / Render ready)
- ✅ Beautiful console logs (chalk)

---

## Folder Structure

```
dcl-mini-bot/
├── commands/
│   ├── owner/
│   ├── group/
│   ├── download/     (stubs)
│   ├── ai/           (stubs)
│   ├── utility/
│   └── fun/
├── database/
│   └── mongoAuthState.js
├── events/
│   └── message.js
├── lib/
│   ├── bot.js
│   ├── commandHandler.js
│   ├── logger.js
│   └── server.js
├── config/
│   └── index.js
├── website/
│   └── index.html    (pairing UI)
├── index.js
├── package.json
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── Procfile
└── README.md
```

---

## Quick Start

### 1. Clone / copy the project

```bash
cd dcl-mini-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
MONGODB_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/?appName=Cluster0
OWNER_NUMBER=9477XXXXXXX
BOT_NAME=DCL MINI
PREFIX=.
SESSION_ID=dcl-mini-main
PORT=3000
```

### 4. Run

```bash
npm start
```

Open the pairing website: **http://localhost:3000**

- Enter your phone number (country code, no `+`)
- Click **Generate Pairing Code**
- On your phone: WhatsApp → Linked Devices → Link a Device → **Link with phone number instead**
- Enter the code

Once connected the bot stays online and sessions are restored from MongoDB on restart.

---

## Adding New Commands

Create a file in the appropriate category folder, e.g. `commands/utility/weather.js`:

```js
module.exports = {
  name: 'weather',
  aliases: ['w'],
  description: 'Get weather info',
  category: 'utility',
  // ownerOnly: true,   // optional
  // groupOnly: true,   // optional
  async execute({ sock, msg, from, args, senderNumber, isGroup, config }) {
    await sock.sendMessage(from, { text: 'Weather command example' }, { quoted: msg });
  },
};
```

Restart the bot (or implement hot-reload).

---

## Deployment

### Railway / Render / Heroku

1. Push the repo
2. Set environment variables (`MONGODB_URI`, `OWNER_NUMBER`, etc.)
3. Build command: `npm install`
4. Start command: `node index.js` (or use the Procfile)

### Docker

```bash
docker-compose up -d --build
```

### VPS + PM2

```bash
npm install -g pm2
pm2 start index.js --name dcl-mini
pm2 save
pm2 startup
```

---

## MongoDB Session Notes

Sessions are stored in the database `dcl_mini_bot` → collection `sessions`.

Each document is keyed by `sessionId` + `key` (creds, app-state-sync, etc.).

To force re-pair, either:

- Delete the documents for that `sessionId` in MongoDB, or
- Change `SESSION_ID` in `.env`

---

## Extending Download / AI Commands

The provided `.play`, `.ai` etc. are **stubs**.

For real functionality you need:

- A legal audio/video source or licensed API
- API keys (OpenAI, Groq, WeatherAPI, etc.)
- Proper error handling & rate limits

Do not use methods that scrape or download copyrighted content without permission.

---

## Security Checklist

- [ ] `.env` is in `.gitignore`
- [ ] MongoDB user has least-privilege access
- [ ] Rotate any password that was shared
- [ ] Owner number is set correctly
- [ ] Rate limit is enabled
- [ ] Bot runs on a secondary number if possible

---

## License

MIT — use, modify, and distribute freely.  
No warranty. You are responsible for compliance with WhatsApp ToS and local laws.

---

**DCL MINI** — Clean • Modular • MongoDB-powered
