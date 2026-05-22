# ClickBook — Deployment Guide

## 🚀 Backend en Railway

### Variables de entorno a configurar en Railway

Ve al proyecto en Railway → Variables → añade estas (NO las pongas en el repo):

| Variable | Valor | Notas |
|----------|-------|-------|
| `MONGO_URL` | `mongodb+srv://lidiabimba_db_user:<NEW_PASSWORD>@clickbook.cvypdop.mongodb.net/?appName=ClickBook` | ⚠️ Regenera la password en MongoDB Atlas y pon la nueva aquí |
| `DB_NAME` | `clickbook` | nombre de la BD |
| `EMERGENT_LLM_KEY` | `sk-emergent-093F8D7740f6a34D6A` | de tu cuenta Emergent |
| `GOOGLE_TTS_API_KEY` | `AIzaSyA-fs-ILCoCrkZRJ3SxaTUfYD2fnNytguU` | de Google Cloud |
| `FREE_DAILY_AUDIO_LIMIT` | `3` | límite gratis (configurable) |
| `AFFILIATE_AMAZON_TAG` | (vacío de momento) | rellena cuando tengas Amazon Asociados |
| `AFFILIATE_CASA_LIBRO` | (vacío de momento) | rellena cuando tengas Casa del Libro |

### Configuración del servicio en Railway

1. Crear nuevo proyecto → Deploy from GitHub repo
2. Seleccionar el repo
3. **Root Directory**: `backend` (importante porque el repo tiene frontend + backend)
4. Railway detectará Python automáticamente con `requirements.txt`
5. Start command (auto-detectado por `Procfile` o `railway.json`):
   ```
   uvicorn server:app --host 0.0.0.0 --port $PORT
   ```
6. Después del primer deploy, Railway te dará una URL pública estilo `https://clickbook-backend.up.railway.app`

### Una vez desplegado: actualiza el frontend

En el archivo `frontend/.env` cambia (o pon en variables de Expo build):

```
EXPO_BACKEND_URL=https://clickbook-backend.up.railway.app
```

---

## 📱 Frontend (Android — Google Play)

Para construir el APK/AAB con EAS Build:

1. Asegúrate de tener `eas-cli` instalado: `npm install -g eas-cli`
2. `eas login` con tu cuenta Expo
3. En `frontend/`: `eas build:configure`
4. Configurar `app.json` con bundle id (ej: `com.lidiabimba.clickbook`)
5. `eas build --platform android --profile production`
6. Descargar el `.aab` y subir a Google Play Console (Internal Testing primero)

---

## 💳 RevenueCat

La API key de TEST está integrada en el frontend. Para activar pagos reales:
1. En RevenueCat dashboard → crea un "Entitlement" llamado `premium`
2. Vincula con productos de Google Play (creados en Play Console → Monetización → Productos):
   - `clickbook_monthly` — 2,99€/mes
   - `clickbook_yearly` — 19,99€/año
3. La integración del frontend ya hace `Purchases.purchasePackage()` al pulsar "HACERSE PREMIUM"

---

## 🔐 Seguridad

- **Rota la password de MongoDB** después del primer deploy
- Las API keys sensibles SOLO van en variables de entorno de Railway, nunca en el código
- El `.env` del backend está en `.gitignore` por seguridad
