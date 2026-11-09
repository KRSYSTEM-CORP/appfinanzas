# Learning: videos MP4 en Cloudflare R2

El admin de KR System (rledezma2001@gmail.com) sube los MP4 desde **Learning** (`/learning`). El
archivo va **directo del navegador a R2** con una URL de un solo uso (no pasa por el servidor de la
app), y para verlo se genera otra URL temporal que caduca a las 4 horas. El bucket es **privado**.

## 1. Bucket (separado del de respaldos)
Cloudflare → R2 → *Create bucket* → nombre `kr-learning` (privado, ubicación automática, Standard).

## 2. CORS del bucket (necesario para subir desde el navegador)
Bucket `kr-learning` → *Settings* → *CORS Policy* → *Add CORS policy* → pegar:

```json
[
  {
    "AllowedOrigins": ["https://TU-DOMINIO"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
Reemplaza `https://TU-DOMINIO` por el dominio real de la app (sin barra final). Agrega también la
URL de pruebas si vas a subir desde ahí.

## 3. Clave de acceso (token)
R2 → *Manage API tokens* → *Create API token*:
- Permiso: **Object Read & Write**.
- Alcance: **solo el bucket `kr-learning`**.
- Guarda el *Access Key ID* y el *Secret Access Key* (se muestran una sola vez).

> Usa una clave distinta a la de los respaldos: así una filtración de una no afecta a la otra.

## 4. Variables de entorno de la app
| Variable | Valor |
|---|---|
| `R2_ACCOUNT_ID` | el *Account ID* de Cloudflare |
| `R2_ACCESS_KEY_ID` | del token del paso 3 |
| `R2_SECRET_ACCESS_KEY` | del token del paso 3 |
| `R2_LEARNING_BUCKET` | `kr-learning` |

Mientras falte alguna, la pantalla muestra que la subida de archivos no está activa y el admin puede
seguir usando enlaces de YouTube o Vimeo.

## 5. Límites y avance
- Máximo **10 videos** y **300 MB** por archivo (MP4). Un tutorial de 1 minuto pesa unos 4 MB.
- Cada usuario tiene su avance personal («X de N completados» y «Marcar como visto»; también se marca
  solo al terminar el video).
- Al quitar un video se borra también su archivo de R2.
