# Conforme · web

Interfaz, API y motor de reglas. Cómo correrlo y el guion de la demo están en [`../README.md`](../README.md).

```bash
npm run dev        # http://localhost:3000
npm test           # tests de normalización, lector de PDF y reglas
npm run samples    # escribe los PDF de la demo en ./samples
```

- `src/lib/rules.ts`: los controles contra la orden de compra.
- `src/lib/extract/`: lectura de PDF por reglas y, opcionalmente, con IA.
- `src/lib/chain.ts`: conexión con el contrato de custodia.
- `src/lib/samples.ts`: generador de documentos de prueba.
