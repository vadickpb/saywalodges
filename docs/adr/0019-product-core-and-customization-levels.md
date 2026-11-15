# ADR 0019 · Núcleo único del producto y tres niveles de personalización

- Estado: aceptado · Fecha: 2026-11-14 · Complementa ADR 0010 (instalación por cliente). Ticket: SD-1101.

## Contexto

El producto se vende instalado por cliente (ADR 0010) y debe poder entregarse «tal cual» o ajustado a pedido. Sin una
regla, cada pedido a medida termina en una copia o rama por cliente y el mantenimiento se vuelve imposible.

## Decisión

Un solo repositorio y un solo `main` para todos los clientes. Lo que cambia entre instalaciones entra por uno de tres
niveles:

| Nivel | Qué cubre | Cómo |
|---|---|---|
| 1 · Configuración | Marca, colores, textos, secciones, tarifas, plantillas | Panel del dueño y variables de entorno |
| 2 · Módulos | Finanzas, guía privada, WhatsApp, pago en línea, CRM | Interruptores por instalación leídos solo en servidor (SD-1103) |
| 3 · A medida | Una función que el producto no tiene | Ticket pagado; entra a `main` apagada por defecto detrás de un interruptor y se enciende solo en esa instalación |

Reglas:

1. **Nunca** se crea una rama, fork o copia por cliente.
2. Ningún valor de un cliente (nombre, dominio, colores, textos) vive en el código fuera de seeds, demo, tests y docs
   (SD-1102).
3. Un módulo apagado no aparece en la navegación y sus rutas y acciones responden 404; el interruptor se lee en servidor,
   nunca lo decide el navegador.
4. Las versiones (`vX.Y.Z`, SD-903) llegan a todos los clientes; `main` alimenta la demo.
5. Una función a medida que sirva a otros clientes se documenta como módulo y se puede vender de nuevo.

## Consecuencias

- Mantenimiento lineal: un arreglo llega a todas las instalaciones.
- Cada función a medida cuesta un interruptor y sus pruebas con el módulo apagado.
- `CLAUDE.md` deja de describir el producto como SaaS multi-tenant: es un producto instalado por cliente que conserva
  `org_id` + RLS como segunda barrera (ADR 0010).
