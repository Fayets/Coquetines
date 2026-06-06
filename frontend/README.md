# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Probar en local y desplegar

**En tu máquina (desarrollo):**

1. Backend: en la carpeta `backend` ejecutá `uvicorn main:app --reload`.
2. Frontend: en la carpeta `frontend` ejecutá `npm run dev`.
3. Opcional: en `.env` o `.env.local` definí `VITE_API_URL` (por ejemplo `http://localhost:8000`). Si no la definís, el fallback es `http://localhost:8000`. Probá todo (ventas, caja, etc.) sin subir nada.

**Docker (imagen de producción):** desde `frontend/`, con la URL pública del API (la que el navegador puede alcanzar):

```bash
docker build --build-arg VITE_API_URL=https://tu-api.example.com -t coquetines-frontend .
docker run -p 8080:80 coquetines-frontend
```

El sitio queda en `http://localhost:8080`.

**Al subir a Render:**

- El **backend** en Render se actualiza con tu último push (mismo código que probaste en local).
- El **frontend** en Netlify/Vercel/Render: en el dashboard del sitio configurá la variable de entorno `VITE_API_URL=https://loqueellasquierencta.onrender.com` (o la URL de tu backend en Render). El build usará esa URL; no hace falta tocar el código.

Mismo código en los dos lados: probás en local y cuando subís, Render (y el frontend desplegado) usan la misma versión.

---

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh
