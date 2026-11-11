# Universal Cart (Share-sheet MVP)

Share a product link from Amazon / Flipkart / any shopping app to this app. It is saved in one cart, grouped by store.

```
universal-cart/
  backend/   Fastify + Prisma + Postgres API (auth, cart, link parser)
  mobile/    Expo (React Native) source files to drop into a fresh Expo app
```

## 1. Backend

```bash
cd backend
cp .env.example .env          # set JWT_SECRET
docker compose up -d          # Postgres on :5432
npm install
npx prisma migrate dev --name init
npm run test:parser           # quick sanity check of the parser
npm run dev                   # API on :3000
```

Quick test without the app:

```bash
curl -X POST localhost:3000/auth/register -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"secret123"}'
# copy the token, then:
curl -X POST localhost:3000/items -H 'content-type: application/json' \
  -H "authorization: Bearer <TOKEN>" \
  -d '{"text":"Check this out https://www.amazon.in/dp/B0XXXXXXXX"}'
curl localhost:3000/items -H "authorization: Bearer <TOKEN>"
```

## 2. Mobile app

The share-sheet library needs native code, so **Expo Go will not work**. You need a development build.

```bash
npx create-expo-app@latest mobile-app      # default template (has expo-router)
cd mobile-app
npx expo install expo-share-intent expo-secure-store expo-dev-client expo-linking expo-constants
```

Then copy from this zip's `mobile/` folder into `mobile-app/`:
- `app/` (replace the generated `app/` folder)
- `lib/`
- `.env.example` -> `.env` (put your computer's LAN IP)
- merge `app.json.snippet` into `app.json` (scheme, package name, plugins)

Run on an Android phone (USB debugging on):

```bash
npx expo prebuild
npx expo run:android
```

(or `eas build --profile development --platform android`)

Then: open Amazon app -> product -> Share -> pick "Universal Cart".

## How it works

1. Share sheet gives the app text like `Check this out https://a.co/d/xyz`.
2. App sends the text to `POST /items`.
3. Backend extracts the URL, follows short-link redirects, fetches the page, reads JSON-LD / Open Graph tags for title, image, price.
4. Item is saved. The same product shared twice updates the existing row (Amazon links are reduced to `/dp/<ASIN>`).
5. If a store blocks the fetch (Amazon often does), the link is still saved with whatever was found. Title/price may be empty.

## Known limits

- Amazon blocks server-side fetches fairly often, so price/title can be missing. Next step for that: the WebView approach (page is loaded on the phone, so details come from there) or the Product Advertising API.
- No price tracking yet (`PriceHistory` table is ready for it).
- iOS needs a Mac and Apple developer account for the share extension build.
- Backend runs with `tsx` directly, fine for MVP. Add a build step before production.
