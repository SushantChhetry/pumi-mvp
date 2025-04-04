Here’s your updated `README.md` with clear instructions on using **ngrok**, including how to reserve a custom domain and set `NEXTAUTH_URL` correctly — all tailored to your current setup:

---

```markdown
# 🧠 PuMi – Product Minds from Slack Feedback

PuMi is an AI-powered feedback intelligence tool that connects with your Slack workspace, fetches product feedback, and turns it into actionable insights using GPT.

## 🚀 Features Implemented

✅ Slack OAuth Login using NextAuth  
✅ Securely stores Slack access token in user session  
✅ Fetches messages from a specific Slack channel (e.g. `#user-feedback`)  
✅ Syncs messages into a Supabase (Postgres) database  
✅ API endpoint ready to build GPT-powered trend reports  

## 🧑‍💻 Tech Stack

- **Frontend:** React + TypeScript + Next.js (App Router)
- **Auth:** Slack via NextAuth.js
- **Backend:** API Routes (Edge/serverless)
- **Database:** Supabase (Postgres)
- **Hosting:** Vercel-ready setup
- **Dev Tools:** ngrok for local HTTPS tunneling (Slack-compatible)

## 📦 Project Structure (Partial)

```
app/
  api/
    auth/
      [...nextauth]      # NextAuth API route
      options.ts         # NextAuth config
    slack/
      sync/              # POST route to sync Slack messages
  messages/              # Frontend page for displaying messages or reports
  layout.tsx
  page.tsx
lib/
  slack-utils.ts         # Slack API helper (conversations.history)
  supabase.ts            # Supabase client
.env
README.md
```

## 🧪 How to Run Locally

### 1. Clone and install
```bash
git clone https://github.com/your-username/pumi.git
cd pumi
npm install
```

---

### 2. Set up `.env` file

### 3. Start your local server
```bash
npm run dev
```

---

### 4. Start ngrok (to expose localhost for Slack OAuth)
```bash
ngrok http 3000
```

> Copy the HTTPS URL from the terminal (e.g. `https://abcd-1234.ngrok-free.app`)  
> Paste it in `.env` as `NEXTAUTH_URL` and `NEXT_PUBLIC_BASE_URL`

---

### 5. Update Slack app settings

Go to [https://api.slack.com/apps](https://api.slack.com/apps):
- Navigate to your app
- Go to **OAuth & Permissions**
- Add this to **Redirect URLs**:
  ```
  https://your-ngrok-url.ngrok-free.app/api/auth/slack
  ```
- Save Changes

---

### 6. Sync messages from Slack (manual test)

```bash
curl -X POST http://localhost:3000/api/slack/sync
```

Messages from your Slack `#user-feedback` channel will now be saved to your Supabase database 🎉

---

## 💡 Optional: Use a custom ngrok subdomain

Want your ngrok URL to stay consistent across sessions?

1. Sign up at https://dashboard.ngrok.com
2. Get your auth token and run:

```bash
ngrok config add-authtoken <your-token>
```

3. Reserve a domain like `pumi.ngrok-free.app`
4. Then run:

```bash
ngrok http 3000 --domain=pumi.ngrok-free.app
```

Update `.env` and Slack settings with this domain so you don’t have to change it each time.

---

## 🛣️ Upcoming Features

- [ ] AI-generated trend reports from feedback (`/api/report`)
- [ ] Ask questions about product feedback ("What are the top user pain points?")
- [ ] Frontend dashboard to view reports
- [ ] Slack Event subscription for real-time syncing
- [ ] Team-based feedback views and export tools

---

## 🧑‍🎤 Author

**Sushant Chhetry**  
[LinkedIn](https://linkedin.com/in/ushantchhetry) – [Twitter](https://twitter.com/ushantchhetry)

---

**Built with ❤️ to help product teams make smarter decisions from Slack feedback.**
