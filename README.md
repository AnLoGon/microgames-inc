# Microgames Inc. 0.3

Homenaje a **WarioWare: Do It Yourself** (Nintendo DS): un editor visual de microjuegos de 4 segundos, 8 segundos o infinitos, más una colección de ejemplos jugables. Todo funciona en el navegador, sin servidor y sin instalar nada.

La portada incluye el botón **🆕 Novedades**, con el registro de actualizaciones, mejoras y arreglos de cada versión.

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
  - Objetos con **4 animaciones** por objeto. Cada animación tiene nombre (máximo **12 caracteres**), **4 celdas** editables y velocidad de **1 (más lenta) a 5 (más rápida)**, en un editor de píxeles con **zoom de 8 a 32 px por celda**, **cuadrícula opcional** y desplazamiento (lápiz, goma, relleno, línea, rectángulo, selector de color, deshacer/rehacer).
  - **Mis objetos**: guarda en el navegador los objetos que creas o personalizas, con sus 4 animaciones, para reutilizarlos en cualquier microjuego.
  - Al añadir un objeto puedes elegir un **sprite predefinido**, empezar con un **lienzo vacío** desde cero o usar uno de **Mis objetos**.
  - Etiquetas de objetos y zonas a alta resolución sobre el escenario, con nombres y medidas.
  - Colocación inicial en un punto fijo o aleatoria dentro de una zona definida por ti.
  - Zonas dibujables dentro o fuera del escenario.
  - **Editor de fondos** con 11 texturas predefinidas (liso, rejilla, puntos, damero, rayas, atardecer, estrellas, ladrillos, ondas, nubes y circuito), colores base/acento y paletas rápidas.
  - Reglas *sujeto → disparador → acciones*, con repetición opcional.
  - **Textos en el escenario**: hasta 30 textos fijos con contenido, fuente, tamaño, color y alineación. Se colocan con la herramienta **T Texto** o desde la pestaña **Juego**.
  - **Objetos invisibles**: dejan de dibujarse, no reciben toques ni se ven afectados por reglas de contacto, movimiento o animación, pero conservan su interruptor ON/OFF.
  - **Rejilla** visible sobre el escenario (casilla junto a Deshacer): al activarla, objetos y zonas se ajustan a la cuadrícula; al desactivarla se mueven libremente.
- **Disparadores**
  - Tocar (este objeto / cualquier punto del escenario).
  - Contacto (tocar objeto/zona, solaparse con objeto/zona).
  - Animación (una animación y celda concretas / fin de animación).
  - Tiempo (en un punto / durante un intervalo), con un mínimo de **0,1 segundos**.
  - Interruptor (un objeto se enciende, está encendido, se apaga o está apagado).
  - Victoria / derrota (ganar, después de ganar, antes de ganar, perder, después de perder, antes de perder).
  - **Varios activadores por regla** combinados con **Y** (se cumplen todos) u **O** (basta con uno), hasta 6 activadores extra.
- **Acciones**
  - Movimiento en línea recta (dirección fija o aleatoria, hacia un punto, desde otro sitio u objeto), con velocidad de **1 a 5**.
  - Salto a punto/zona (cualquier punto o intentando no solaparse) o a un objeto.
  - Vagar (meneo, billar, volar, botar), detenerse, intercambiar posiciones, acercarse a un objeto. Deambular y acercarse también usan velocidad de **1 a 5**.
  - Derrota, sonido, interruptor ON/OFF, cambiar a una animación y celda concretas o detener animación.
  - **Objeto invisible** (ocultar o volver a mostrar) y **Añadir texto** temporal con fuente, tamaño, color, alineación, posición y duración.
  - Efectos: destello, confeti, temblor y congelar objetos y reloj.
  - **Orden visible y editable**: cada acción lleva un número y se puede arrastrar con el asa **⋮⋮** o mover con **▲ / ▼**.
- **Lógica por objeto**
  - La pestaña **Lógica** muestra solo las reglas del objeto seleccionado; al cambiar de objeto se mantiene la pestaña abierta.
  - Cada regla se puede **copiar** con **⧉** y **pegar** en otro objeto eligiendo el destino.
- **Objetivo de victoria**
  - Solo mediante **interruptores encendidos**: dentro de una condición todos los objetos deben estar ON (**Y**).
  - Hasta **5 condiciones alternativas**: se gana al cumplirse cualquiera de ellas (**O**).
  - Si no hay condiciones configuradas, se gana sobreviviendo hasta el final del tiempo.
- **Juego**
  - Ratón en ordenador y táctil en móvil/tablet.
  - El tiempo siempre llega a cero: ganar o perder es un estado, no un final anticipado.
  - Barra de tiempo, pausa, silencio, reintento y salida.
  - **Pista de entrada**: antes de empezar se muestra solo la pista del jugador, en blanco sobre negro y a tamaño grande, durante **1,5 segundos**, con un sonido característico y sin poder saltarla.
  - El campo de pista admite como máximo **20 caracteres, incluidos espacios**, con contador en el editor.
  - Resultado y regreso al editor tras una prueba.
- **Prueba desde el editor**
  - Selector de velocidad **0,5× / 1× / 2× / 3×** antes de probar; también se puede cambiar en vivo desde el panel de prueba.
  - Panel **Interruptores** con el estado ON/OFF de cada objeto, la marca **invisible** y el aviso de pausa.
  - La prueba no modifica el borrador.
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
js/pixel.js       Editor de píxeles 16×16 con zoom, cuadrícula y celdas por animación
js/player.js      Reproductor, pista de entrada, resultados, pausa y maratón
js/app.js         Navegación, galería, borradores, ayuda y ajustes
```

## Notas

- Los microjuegos se guardan en el navegador (`localStorage`), no en la nube. Exporta un `.json` si quieres conservarlos o compartirlos.
- «Mis objetos» también se guarda en `localStorage`; si borras los datos del navegador se pierden esos objetos guardados (los ya colocados en un microjuego se conservan con él).
- Los textos fijos del escenario se dibujan por debajo de los objetos; los textos de la acción «Añadir texto» aparecen por encima y pueden tener duración o quedarse hasta el final.
- Un objeto invisible conserva su interruptor ON/OFF y puede volver a mostrarse con la misma acción «Objeto invisible».
- El estado de los interruptores solo existe durante la partida: al empezar, todos están apagados.
- Los ejemplos siempre están disponibles; al editarlos se abre una copia sin guardar.
- Los microjuegos antiguos creados en 320×240 se adaptan automáticamente a 1280×720 al cargarlos. Los creados con la versión 0.2 convierten sus 4 celdas y su velocidad en fps a la primera de las 4 animaciones nuevas.
- Los objetivos antiguos de tocar o alcanzar siguen siendo jugables; al editar una copia, el editor los convierte al sistema de interruptores cuando puede deducir la condición.
