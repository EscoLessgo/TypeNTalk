# Lovense Sync App Setup Guide

This app allows a **Host** (toy wearer) to pair their Lovense toy and share a private link with a **Typist**. The typist's keystrokes and voice (whispers) are synchronized to the host's toy in real-time.

## 1. Lovense Developer Setup
To use the real Lovense API (not MOCK), you need a Developer Token:
1. Go to [Lovense Developer Portal](https://developer.lovense.com/).
2. Log in and Create an App.
3. In the App settings, set the **Callback URL** to:
   `https://[your-railway-app-url]/api/lovense/callback`
4. Copy your **Developer Token**.

## 2. Deployment on Railway
1. Push this repository to GitHub.
2. Link the repository to Railway.
3. Add a **PostgreSQL** service in Railway.
4. Set the following Environment Variables in the Backend service:
   - `DATABASE_URL`: (Railway will usually provide this automatically once you link the DB).
   - `LOVENSE_DEVELOPER_TOKEN`: Your token from step 1.
   - `FRONTEND_URL`: `https://[your-frontend-url]`

## 3. Usage
### For the Host:
1. Open the app and enter your Lovense Username (the one you use in the Lovense Remote app).
2. Scan the generated QR code with the **Lovense Remote App** (Standard Solution).
3. Once linked, a private URL will be generated.
4. Send this URL to your typist.
5. Approve their connection request when it appears.

### For the Typist:
1. Open the private link.
2. Type in the text field; each keypress sends a 15% pulse to the host.
3. Click the Mic icon to enable **Voice Sync**. Whispers and sounds will be mapped to vibration intensity.
4. Press **Enter** to submit a "Final Surge" based on the length of your message.
5. Favorite responses can be replayed from the history section.
