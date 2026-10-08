# Aurum Preventa

App Android para los vendedores que salen a la calle a tomar pedidos (preventa). Funciona
**sin conexión**: el vendedor sincroniza con señal, sale con sus clientes, artículos, precios y
stock en el teléfono, y los pedidos se envían solos cuando vuelve la señal.

Se conecta al servidor de Aurum ERP de cada cliente (módulo **Preventa móvil** de
[facturacion-service](https://github.com/mhredil/aurum-erp)). Una sola app sirve para todos los
clientes: el teléfono se vincula al servidor de la empresa con un código QR.

## Cómo funciona

1. En el portal, **Distribución → Fuerza de ventas**: el vendedor tiene que tener un usuario
   asociado (rol Vendedor o uno similar con permiso de pedidos).
2. **Distribución → Preventa móvil → Vincular teléfono**: se genera un QR de un solo uso (vence
   en 15 minutos).
3. En la app, **Escanear código QR** (o escribir servidor y código). El teléfono queda vinculado
   y hace la primera sincronización.
4. Cada día: **Sincronizar** con señal, recorrer la **Ruta del día** (clientes de las rutas que se
   visitan ese día, en orden de visita) y tomar los pedidos.
5. Los pedidos quedan en el teléfono y se envían al haber señal (también al reabrir la app o al
   tocar Sincronizar). Reenviar nunca duplica: cada pedido lleva un id generado en el teléfono.
6. En la oficina, los pedidos aparecen en **Ventas → Pedidos** marcados como *Teléfono*. Si el
   precio que vio el vendedor ya no es el actual, el pedido queda **para revisión de precios** y
   no se factura hasta decidir, línea por línea, si se mantiene el precio del vendedor o se usa el
   actual.

Si se pierde un teléfono: **Preventa móvil → Desvincular**. Deja de funcionar en el acto.

## Estructura

```
src/
  app/          pantallas (Expo Router): vincular, escanear, hoy, cliente/[id], pedido/[customerId], pedidos
  components/   botón, barra de sincronización, tarjeta de pedido
  domain/       lógica pura con tests: montos, QR de vinculación, ruta del día, búsqueda
  lib/          API, sesión (SecureStore), base local (SQLite), sincronización
```

- **Base local** (`expo-sqlite`): el catálogo se reemplaza en cada sincronización; la tabla
  `outbox` guarda los pedidos hasta que el servidor los confirma (no se pierden al sincronizar
  ni al volver a vincular).
- **Token del dispositivo** en `expo-secure-store`. Solo sirve para la API móvil
  (`/mobile/sync`, `/mobile/orders`), no para el resto del sistema.
- Los montos que muestra el teléfono son una estimación: el servidor recalcula con sus precios.

## Desarrollo

```bash
npm install
npx expo start          # escanear el QR de Expo con Expo Go en el teléfono
npm run typecheck       # TypeScript
npm test                # tests de src/domain (runner de Node, sin dependencias)
npx expo-doctor         # dependencias y configuración
```

Para probar contra el servidor de desarrollo desde un teléfono en la misma red, abrir el portal
con la IP de la computadora (por ejemplo `http://192.168.0.10:8080`) antes de generar el QR, así
el código lleva esa dirección.

## Generar el APK

Con [EAS](https://docs.expo.dev/eas/) (necesita una cuenta de Expo):

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview      # APK para instalar directo
npx eas-cli@latest build -p android --profile production   # AAB para Google Play
```

La versión se cambia en `app.json` (`expo.version`) y el servidor la ve en cada sincronización
(columna *Teléfono* de Preventa móvil).
