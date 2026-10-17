# Conforme

Revisa los documentos de embarque de una importación (factura comercial, packing list y conocimiento de embarque) contra la orden de compra, con las reglas que usan los bancos, antes de que lleguen al banco o a la aduana. El pago queda en custodia en un contrato en Rootstock y se le libera al proveedor solo cuando el dictamen da **conforme**.

Prototipo del equipo Tiramisu para EDU HUB · LABITCONF 2026 (track Inclusión Financiera).

## El problema

La ICC estima que entre 65 % y 80 % de los juegos de documentos presentados bajo carta de crédito se rechazan en la primera presentación. Para una pyme, cada rechazo es mercadería parada en el puerto, costos de depósito y un proveedor que no cobra. Las discrepancias más comunes son tontas: un peso que no coincide entre el BL y el packing list, una posición arancelaria mal copiada, un puerto distinto.

## Cómo funciona

1. El importador carga la orden de compra y deposita el pago en custodia (contrato `ConformeEscrow`).
2. El proveedor sube factura, packing list y BL en PDF. Conforme extrae los datos de cada uno.
3. El motor de reglas corre más de 20 controles: partes, descripción, NCM, cantidades, cuentas, monto, moneda, Incoterm, puertos, fecha de embarque, plazo de presentación, pesos y bultos entre documentos. Cada control cita la regla (UCP 600, Incoterms 2020, NCM) y dice cómo corregirlo.
4. Si no hay discrepancias, el contrato le paga al proveedor y registra en la cadena la huella SHA-256 del juego de documentos aprobado. Si hay discrepancias, el pago sigue retenido hasta que se corrijan.

## Estructura

```
conforme/
  contracts/   Hardhat: ConformeEscrow.sol, TestUSD.sol (token de prueba), tests y deploy
  web/         Next.js 16: interfaz, API, motor de reglas, lectura de PDF y conexión con la cadena
```

## Correrlo en la compu (nodo local)

Requiere Node 20 o más nuevo. Son tres terminales.

```bash
# 1. Nodo local de Hardhat
cd conforme/contracts
npm install
npm run node

# 2. Desplegar los contratos (en otra terminal)
cd conforme/contracts
npm run deploy:local

# 3. La aplicación
cd conforme/web
npm install
npm run dev
```

Abrí http://localhost:3000. La barra superior tiene que decir **Nodo local (Hardhat)** con un punto verde.

Si reiniciás el nodo, volvé a correr el deploy: el nodo arranca vacío. Las operaciones viejas que tenían fondos en custodia van a dar error al liberar, así que abrí una nueva.

## Guion de la demo (3 minutos)

1. **Inicio.** El formulario ya trae un caso real: Rodados del Litoral S.A. (Santa Fe) le compra 20.000 neumáticos de bicicleta rodado 29 a un fabricante de Ningbo, FOB Ningbo, USD 24.000. Clic en **Abrir la operación**.
2. **Depositar en custodia.** El panel de la derecha muestra los 24.000 tUSD pasando del importador al contrato, con las transacciones.
3. **Simular envío del proveedor → Con errores.** Se generan los tres PDF y se leen igual que si los subiera el proveedor.
4. **Verificar documentos.** Sale el sello **OBSERVADO** con tres discrepancias: el BL dice 18.900 kg y el packing list 18.400 kg, la factura trae la posición 4011.90.00 en vez de 4011.50.00, y el BL descarga en Montevideo. Cada una con lo esperado, lo encontrado, qué hacer y la regla. El pago sigue en custodia.
5. **Simular envío del proveedor → Correctos** y **Volver a verificar.** Sello **CONFORME**: el contrato le paga al proveedor en el momento y registra la huella de los documentos.

Para mostrar que no es un truco: abrí cualquier PDF desde su nombre, corregí un dato a mano con **Corregir datos** y volvé a verificar, o subí un PDF propio.

`npm run samples` (en `web/`) escribe los dos juegos de PDF en `web/samples/` para arrastrarlos a mano. Las fechas se calculan a partir de hoy, así que generalos el mismo día de la demo y usalos con la orden de compra que viene cargada en el formulario.

## Rootstock Testnet

1. Generá dos billeteras descartables:
   ```bash
   cd conforme/contracts
   npm run wallets
   ```
   Copiá las líneas que imprime a `contracts/.env` y a `web/.env.local` (hay ejemplos en `.env.example`).
2. Cargá tRBTC en la dirección del deployer desde https://faucet.rootstock.io. Desplegar cuesta muy poco (el gas en testnet ronda los 0,006 gwei).
3. Desplegá:
   ```bash
   npm run deploy:testnet
   ```
   El script despliega `TestUSD` y `ConformeEscrow`, le acuña 1.000.000 tUSD al importador, le manda un poco de tRBTC para gas y guarda las direcciones en `web/deployments/rskTestnet.json`. Subí ese archivo al repo para que el resto del equipo use los mismos contratos.
4. En `web/.env.local` dejá `CHAIN_NETWORK=rskTestnet` y reiniciá `npm run dev`.

Cada transacción en testnet tarda unos 30 segundos. El depósito manda la aprobación y el depósito juntos para esperar un solo bloque. Los enlaces de las transacciones abren el explorador de Rootstock.

## Lectura con IA (opcional)

Por defecto los PDF con texto se leen por reglas (etiquetas como "Gross Weight:" o "Puerto de carga:", en inglés y castellano). Para leer PDF escaneados o fotos, configurá en `web/.env.local` una API compatible con OpenAI:

```
LLM_API_KEY=...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

La IA solo extrae datos. El dictamen siempre lo da el motor de reglas, que es determinístico y explicable.

## Qué es real y qué está simplificado

| Real | Simplificado para la demo |
| --- | --- |
| Lectura de PDF y extracción de campos | Los documentos "simulados" se generan a partir de la orden de compra |
| Motor de reglas y dictamen | El servidor firma por el importador (en producción firma desde su billetera) |
| Contrato de custodia en Rootstock, con tests | El token es `tUSD` de prueba, no una stablecoin real |
| Huella de los documentos registrada en la cadena | El verificador es el único árbitro del contrato |
| | Las operaciones se guardan en un archivo JSON (`web/data/`) |

## Encuadre regulatorio

Pensado como piloto en sandbox, no como atajo cambiario:

- La normativa de Exterior y Cambios del BCRA ya prevé pagos de importaciones "a la vista contra documentación de embarque" (punto 10.4.1.2). Conforme hace que esa documentación llegue sin discrepancias, y el control sirve igual si el pago sale por el banco.
- Para acceder al mercado oficial de cambios, la declaración jurada del punto 3.16.3 exige, entre otras cosas, no haber entregado pesos u otros activos locales para comprar criptoactivos en los 90 días previos y no hacerlo en los 90 siguientes (con excepciones, como los dólares ya depositados en un banco local). Por eso la custodia en stablecoin es para pilotos dentro de un sandbox, como el de la Ciudad de Buenos Aires, y no para la operatoria general de la pyme. Conviene confirmar el alcance con un especialista antes de cualquier piloto real.
- El seguimiento posterior (registro de ingreso aduanero dentro de los 90 días, 270 para bienes de capital) es una extensión natural.

## Tests

```bash
cd conforme/contracts && npm test   # 15 tests del contrato
cd conforme/web && npm test         # normalización, lector de PDF y reglas, incluido el circuito PDF -> dictamen
cd conforme/web && npx tsx scripts/smoke.ts   # demo completa contra el servidor y el nodo corriendo
```

## Próximos pasos

- Firma del importador desde su billetera y aceptación del proveedor.
- Árbitro múltiple (por ejemplo, Conforme + despachante) o liberación parcial por embarque.
- Más documentos: certificado de origen, póliza de seguro, certificados sanitarios.
- Integración con el registro aduanero para cerrar el seguimiento de pagos de importaciones.
