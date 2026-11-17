# Microgames Inc.

Homenaje a **WarioWare: Do It Yourself** (Nintendo DS): un editor visual de microjuegos de 4 segundos, 8 segundos o infinitos, más una colección de ejemplos jugables. Todo funciona en el navegador, sin servidor y sin instalar nada.

El escenario interno es de **1280×720 píxeles** y se muestra siempre con proporción 16:9, sin deformar los sprites.

## Cómo ejecutarlo

Abre `index.html` con doble clic (funciona desde `file://`) o sirve la carpeta con cualquier servidor estático:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

y visita <http://127.0.0.1:8765/index.html>.

No hay backend, ni build, ni dependencias: HTML, CSS y JavaScript clásicos.

## Qué incluye

- **Editor visual sin código**
  - Escenario de 1280×720 con sprites pixel-art de 16×16 que se escalan al tamaño del objeto.
  - Objetos de entre **48×48 y 256×256 px**, ajustables con campos numéricos, presets o arrastrando el tirador azul de la esquina inferior derecha.
  - Objetos con 4 celdas de animación editables en un editor de píxeles con **zoom de 8 a 32 px por celda**, **cuadrícula opcional** y desplazamiento (lápiz, goma, relleno, línea, rectángulo, selector de color, deshacer/rehacer).
  - Etiquetas de objetos y zonas a alta resolución sobre el escenario, con nombres y medidas.
  - Colocación inicial en un punto fijo o aleatoria dentro de una zona definida por ti.
  - Zonas dibujables dentro o fuera del escenario.
  - **Editor de fondos** con 11 texturas predefinidas (liso, rejilla, puntos, damero, rayas, atardecer, estrellas, ladrillos, ondas, nubes y circuito), colores base/acento y paletas rápidas.
  - Reglas *sujeto → disparador → acciones*, con repetición opcional.
- **Disparadores**
  - Tocar (este objeto / cualquier punto del escenario).
  - Contacto (tocar objeto/zona, solaparse con objeto/zona).
  - Animación (animación concreta / fin de animación).
  - Tiempo (en un punto / durante un intervalo), con un mínimo de **0,1 segundos**.
  - Interruptor (un objeto se enciende, está encendido, se apaga o está apagado).
  - Victoria / derrota (ganar, después de ganar, antes de ganar, perder, después de perder, antes de perder).
- **Acciones**
  - Movimiento en línea recta (dirección fija o aleatoria, hacia un punto, desde otro sitio u objeto).
  - Salto a punto/zona (cualquier punto o intentando no solaparse) o a un objeto.
  - Vagar (meneo, billar, volar, botar), detenerse, intercambiar posiciones, acercarse a un objeto.
  - Derrota, sonido, interruptor ON/OFF, cambiar o detener animación.
  - Efectos: destello, confeti, temblor y congelar objetos y reloj.
- **Juego**
  - Ratón en ordenador y táctil en móvil/tablet.
  - El tiempo siempre llega a cero: ganar o perder es un estado, no un final anticipado.
  - Barra de tiempo, pausa, silencio, reintento y salida.
  - **Pista de entrada**: antes de empezar se muestra solo la pista del jugador, en blanco sobre negro y a tamaño grande, durante **1,5 segundos**, con un sonido característico y sin poder saltarla.
  - El campo de pista admite como máximo **20 caracteres, incluidos espacios**, con contador en el editor.
  - Resultado y regreso al editor tras una prueba.
- **Maratón**
  - Microjuegos consecutivos con **4 vidas**: cada derrota resta un corazón y al quedarse sin vidas termina la partida.
  - Los corazones se muestran en grande al ganar y al perder cada ronda.
  - Sin botones de siguiente/salir durante las rondas: tras una breve pausa se carga automáticamente el siguiente microjuego.
  - Cada 5 rondas el tiempo y la música se aceleran (hasta ×2.5).
  - Los microjuegos infinitos quedan fuera de la selección del maratón.
- **Contenido y datos**
  - 6 microjuegos de ejemplo: Ninja Escurridizo, Bomba o Plátano, Bombas Saltarinas, Lluvia de Estrellas, Cohete al Espacio y Fiesta Infinita.
  - Importar y exportar microjuegos como archivo `.json`.
  - 15 efectos de sonido 8-bit (incluido el de la pista de entrada) y 7 pistas chiptune seleccionables.
  - Guardado automático en `localStorage`, borrador de sesión y copias de los ejemplos.

## Controles

| Acción | Ratón / táctil |
| --- | --- |
| Jugar / pulsar botones | Clic o toque |
| Interactuar con el microjuego | Clic o toque sobre el escenario |
| Pausa | Botón ⏸ o `Esc` |
| Salir | Botón ✕ |

## Estructura

```
index.html        Estructura de pantallas, modales y carga de scripts
css/styles.css    Diseño retro responsive
js/core.js        Esquema, normalización, almacenamiento, import/export, modales
js/sprites.js     Paleta, sprites 16×16, texturas de fondo y miniaturas 16:9
js/audio.js       Efectos de sonido y música chiptune con tempo variable
js/engine.js      Motor de simulación (triggers, acciones, tiempo, dibujo)
js/examples.js    Microjuegos de ejemplo
js/editor.js      Editor visual, reglas, objetos, zonas, fondos y línea de tiempo
js/pixel.js       Editor de píxeles 16×16 con zoom, cuadrícula y 4 fotogramas
js/player.js      Reproductor, pista de entrada, resultados, pausa y maratón
js/app.js         Navegación, galería, borradores, ayuda y ajustes
```

## Notas

- Los microjuegos se guardan en el navegador (`localStorage`), no en la nube. Exporta un `.json` si quieres conservarlos o compartirlos.
- El estado de los interruptores solo existe durante la partida: al empezar, todos están apagados.
- Los ejemplos siempre están disponibles; al editarlos se abre una copia sin guardar.
- Los microjuegos antiguos creados en 320×240 se adaptan automáticamente a 1280×720 al cargarlos.
