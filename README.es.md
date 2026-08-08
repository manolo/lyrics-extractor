# Extractor de Letras y Acordes

Extension de MuseScore 4 que extrae letras con acordes alineados de partituras, generando texto plano y PDF para cancioneros, hojas de ensayo y cartas de acordes. Tambien disponible como CLI de Node.js.

![Plugin extrayendo letras y acordes de una partitura de MuseScore, mostrando vista previa del texto y salida PDF con diagramas de acordes](docs/lyrics-extractor-txt-pdf.png)

**Leyenda:**

| # | Origen / Salida | Descripcion |
|---|-----------------|-------------|
| 1 | Partitura | Letras en el pentagrama de melodia (una silaba por nota) |
| 2 | Partitura | Simbolos de acorde en el pentagrama de acompanamiento |
| 3 | Plugin | Vista previa del texto extraido con acordes alineados sobre las silabas |
| 4 | PDF | PDF generado, listo para imprimir o compartir |
| 5 | PDF | Titulo de la cancion en tipografia grande y en negrita |
| 6 | PDF | Diagramas de trastes para cada acorde unico usado en la cancion |
| 7 | PDF | Etiquetas de seccion desde marcas de ensayo y textos de sistema (INTRO, ESTROFA, ESTRIBILLO) |
| 8 | PDF | Progresion de acordes en partes instrumentales (intro, interludios, salida) |
| 9 | PDF | Letra con cada acorde colocado exactamente sobre la silaba donde cambia |
| 10 | PDF | Numeros de linea opcionales para facilitar referencias en los ensayos |

## Instalacion

1. Descargar `lyrics-extractor.mext` de la [ultima release](https://github.com/manolo/lyrics-extractor/releases/latest)
2. Arrastrar el archivo `.mext` sobre MuseScore 4 (o hacer doble click)
3. La extension aparece en la barra de herramientas y en **Extensiones**

## Funcionalidades

![Demo de uso del plugin](docs/lyrics-extractor-video.gif)

La demo de arriba muestra un flujo de trabajo completo: se introducen los simbolos de acorde en el pentagrama de acompanamiento, las letras se escriben en el pentagrama de voz usando la entrada estandar de MuseScore (`.` para sinalefas entre vocales, `Espacio` para avanzar a la siguiente palabra, `-` para dividir una palabra entre varias notas, y signos como `,` `.` `;` para marcar fronteras de frase). Una vez lista la partitura, se abre el plugin, se extraen letras y acordes con un solo click, y el PDF formateado se guarda y se abre automaticamente.

### Verificacion de la partitura
Al abrir el plugin, analiza la partitura y muestra un indicador de estado:
- **Verde**: la partitura esta correcta, lista para extraer
- **Naranja**: problemas detectados con conteo especifico (sinalefas, guiones, cadenas silabicas, sincronizacion de acordes)

El boton **Corregir** arregla todos los problemas automaticamente:
- Formatea sinalefas: punto entre vocales (da.es -> da&#x203F;es)
- Elimina guiones manuales de las silabas
- Repara cadenas silabicas rotas (begin/middle/end)
- Sincroniza acordes del pentagrama principal de una parte al resto de sus pentagramas, normalmente su copia en tablatura
- Sincroniza campos del VBox (titulo, subtitulo, compositor, letrista) a las propiedades del proyecto

### Extraccion de letras y acordes
- Extrae letras con simbolos de acorde alineados sobre las silabas correspondientes
- Maneja repeticiones, voltas, D.S., D.C., Coda, Fine
- Expande secciones multi-verso (verso 0, verso 1, etc.)
- Abrevia secciones repetidas con "..." o etiquetas de seccion
- Detecta textos de sistema (INTRO, SOLISTA, ESTRIBILLO) y guias de ensayo como marcadores de seccion (deduplica automaticamente cuando aparecen en multiples pentagramas). Dos tipos de texto no son nombres de seccion y se ignoran: una guia de ensayo cuyo texto es el numero de su propio compas, que es como MuseScore numera las referencias de ensayo, y una etiqueta que solo es una cuenta de pasadas como `3x` o `x3`, que la barra de repeticion ya lleva como numero de pasadas
- Los nombres de acordes siguen la ortografia de la partitura (solfeo o anglo), sin conversion manual
- Funciona desde cualquier pestana, incluyendo vistas de excerpt/particella (usa masterScore automaticamente)

### Modo solo acordes
Para partituras sin letras (instrumentales), el plugin muestra automaticamente la progresion de acordes estructurada por secciones, barlines y marcas de repeticion.

### Diagramas de trastes
Extrae diagramas de trastes desde frames FBox (incluyendo excerpts de guitarra) y los renderiza graficamente en la cabecera del PDF. Cuando la API de QML expone `FretDiagram`, los diagramas y nombres de acordes se leen de la partitura en memoria. Ninguna release 4.7.x la expone (la clase llega a `api/v1/elements.h` despues del corte de la rama 4.7), asi que en esos builds un fallback lee los datos del archivo .mscz en disco y el plugin pide el directorio donde esta. El CLI lee siempre el archivo directamente y no necesita ninguna de las dos cosas.

### Salida PDF
- Layout compacto optimizado para impresion (A4, margenes seguros)
- Acordes en verde, letras en negro, alineacion monoespaciada
- Opcional: ajustar a una pagina, numeros de linea, cabecera de grupo
- Diagramas de trastes en la cabecera con cejillas, marcadores y numeros de traste
- Abrir el archivo generado directamente desde el plugin

### Controles del plugin

| Control | Descripcion |
|---------|-------------|
| **Corregir** | Corregir sinalefas, guiones, cadenas silabicas, sincronizar acordes |
| **Extraer** | Extraer letras con acordes, mostrar vista previa |
| **Copiar** | Copiar texto extraido al portapapeles |
| **Guardar** (texto) | Guardar archivo de texto junto a la partitura y abrirlo |
| **Debug** | Exportar datos crudos como JSON |

### Ajustes (persistentes)

| Ajuste | Descripcion |
|--------|-------------|
| Solfeo | Convierte nombres de acordes a solfeo (Do, Re, Mi) o anglo (C, D, E) |
| Repetir todo | Expandir todas las repeticiones D.S./D.C. aunque no haya nuevas letras |

### Opciones PDF (visibles tras la extraccion)

| Opcion | Descripcion |
|--------|-------------|
| Cabecera | Texto alineado a la derecha en cada pagina (ej: nombre del grupo) |
| Pie de pagina | Texto centrado al pie de cada pagina (ej: nombre de la banda) |
| Condensar en 1 pagina | Reduce espaciado y fuente para caber en una pagina (prioriza mantener fuente legible) |
| Num. linea | Numeros secuenciales en lineas de letra |
| Sin diagramas de acordes | Omitir diagramas de trastes de la cabecera |
| **Guardar** (PDF) | Guardar PDF junto a la partitura y abrirlo |

## Escribir letras para mejores resultados

### Introducir letras en MuseScore

| Accion | Atajo | Efecto |
|--------|-------|--------|
| Modo letras | `Cmd+L` | Empezar a escribir letras en la nota seleccionada |
| Siguiente nota (misma palabra) | `-` (guion) | Avanzar dentro de la misma palabra |
| Siguiente nota (nueva palabra) | `Espacio` | Completar la palabra y avanzar |
| Sinalefa (union de vocales) | `.` entre letras | `da.es` se muestra como `da es` |
| Simbolo de acorde | `Cmd+K` | Agregar un simbolo de acorde sobre el pentagrama |
| Texto de sistema | `Cmd+Shift+T` | Agregar etiqueta de seccion (Intro, Estrofa, etc.) |

### Saltos de linea y puntuacion

El extractor divide las letras en lineas automaticamente usando puntuacion, silencios musicales, barras de seccion y longitud de linea. Para mejores resultados, conviene poner marcadores explicitos en la partitura:

| En la partitura | Tras Corregir | Salida | Salto de linea? |
|----------------|---------------|--------|-----------------|
| `;` (punto y coma) | `,` (coma fullwidth) | `,` | SI (recomendado) |
| `.` `!` `?` (simple) | sin cambio | sin cambio | SI |
| `,,` (doble coma) | `,` (coma pequena) | `,` | NO (continuacion) |
| `..` (doble punto) | `.` (punto pequeno) | `.` | NO (continuacion) |
| `...` (triple punto) | `...` (elipsis) | `...` | NO (continuacion) |

**Division automatica de lineas:** Cuando las letras no tienen marcadores explicitos de salto, el extractor divide lineas largas en comas cercanas a la longitud tipica del verso, en silencios musicales y en barras dobles. Las lineas que exceden el ancho de pagina del PDF (75 caracteres) se dividen en la mejor pausa disponible.

**Consejos para resultados optimos:**
- Usar `;` (punto y coma) en las letras para forzar un salto de linea. El boton Corregir lo convierte en una coma fullwidth visible en la partitura, y se muestra como `,` en la salida.
- Poner **barras dobles** entre secciones (Solista, Estribillo) para marcar limites estructurales.
- Agregar **Texto de Sistema** (`Cmd+Shift+T`) con nombres de seccion. Estos controlan los saltos de estrofa y la emision de etiquetas.
- Sin ninguno de los anteriores, el extractor se basa en heuristicas (puntuacion, silencios, longitud) que pueden dar resultados suboptimos en partituras con frases largas sin pausas.

### Etiquetas de seccion

Agregar Texto de Sistema (`Cmd+Shift+T`) para marcar secciones. Las etiquetas controlan la estructura de la salida:
- **Con etiquetas:** los cortes ocurren solo en los limites de etiqueta
- **Una etiqueta en `|: :|`:** aparece una vez (misma seccion en ambas pasadas)
- **Varias etiquetas en `|: :|`:** todas se re-emiten en cada pasada
- **Etiquetas numeradas:** usar `#` (ej: `Estrofa #`) para `ESTROFA 1`, `ESTROFA 2`
- **Secuencia explicita:** usar `:` para listar valores (ej: `Solista manolo:juan:pedro` produce `SOLISTA MANOLO`, `SOLISTA JUAN`, `SOLISTA PEDRO`). Funciona con numeros: `Estrofa 1:2`. Los items vacios entre separadores se ignoran (`Estrofa 1::2::` = `Estrofa 1:2`). Cuando la secuencia se agota, la etiqueta se suprime

### Numeracion de versos

Para canciones con barras de repeticion y letras diferentes por pasada, usar la funcion de numero de verso de MuseScore (verso 0, verso 1). El extractor expande las repeticiones con el verso correcto para cada pasada.

### Simbolos de acorde

Agregar acordes (`Cmd+K`) en cualquier pentagrama. El extractor detecta automaticamente el pentagrama con mas simbolos de acorde. Los pentagramas enlazados/tab y ocultos se excluyen automaticamente. Los nombres de acorde usan la ortografia de la partitura (Formato > Estilo > Simbolos de acorde).

### Deteccion del titulo

El plugin resuelve el titulo de la cancion en este orden:
1. **Propiedades del proyecto** (Archivo > Propiedades del proyecto > Titulo)
2. **Titulo del VBox** (el elemento de texto titulo en el marco superior de la partitura)
3. **Nombre del archivo** (derivado del nombre del .mscz, separando camelCase/guiones)

El boton **Corregir** tambien sincroniza los campos del VBox (titulo, subtitulo, compositor, letrista) a las propiedades del proyecto para mantenerlos en sincronizacion.

## Uso por linea de comandos (CLI)

El mismo motor de extraccion esta disponible como CLI de Node.js (sin dependencias adicionales).

```bash
node cli/index.js cancion.mscz                              # stdout
node cli/index.js cancion.mscz --save                       # guardar txt
node cli/index.js cancion.mscz --pdf --header "Mi Tuna"     # PDF con cabecera
node cli/index.js cancion.mscz --pdf --footer "Mi Tuna"     # PDF con pie
node cli/index.js cancion.mscz --pdf --single --numbers     # PDF, 1 pagina, numerado
node cli/index.js cancion.mscz --chords-only                # solo progresion de acordes
```

### Flags del CLI

| Flag | Descripcion |
|------|-------------|
| `--save` | Guardar como `<partitura>-letra.txt` junto al .mscz |
| `--pdf` | Generar PDF como `<partitura>-letra.pdf` |
| `--single` | Ajustar a una pagina (reduce espaciado y luego fuente) |
| `--header <nombre>` | Texto alineado a la derecha en cada pagina |
| `--footer <nombre>` | Texto centrado al pie de cada pagina |
| `--numbers` | Numeros de linea en PDF |
| `--no-diagrams` | Omitir diagramas de trastes del PDF |
| `--chords-only` | Forzar modo solo acordes (ignorar letras) |
| `--lyrics-only` | Solo letra sin lineas de acordes |
| `--chordpro` | Exportar en formato ChordPro (.cho) |
| `--no-annotations` | Omitir textos de pentagrama y expresiones de la linea de acordes |
| `--orphan-lyrics` | Imprimir las letras que ninguna pasada de la partitura canta |
| `--staff <nombre\|num>` | Extraer letras de un pentagrama especifico (por indice o nombre de instrumento) |
| `--anglo` | Forzar nombres de acorde anglo (C, D, E) |
| `--solfeo` | Forzar nombres de acorde solfeo (Do, Re, Mi) |
| `--full` | Expandir todas las repeticiones D.S./D.C. |
| `--check` | Analizar letras (sinalefa, guiones, silabico, puntuacion) |
| `--fix` | Corregir letras, sincronizar acordes y propiedades del proyecto |
| `--debug` | Exportar datos crudos como JSON |

Por defecto, los nombres de acorde usan la ortografia de la partitura. Usar `--anglo` o `--solfeo` para forzar.

## Instalacion manual

| SO | Ruta |
|----|------|
| macOS | `~/Library/Application Support/MuseScore/MuseScore4/extensions/lyrics-extractor/` |
| Linux | `~/.local/share/MuseScore/MuseScore4/extensions/lyrics-extractor/` |
| Windows | `%LOCALAPPDATA%\MuseScore\MuseScore4\extensions\lyrics-extractor\` |

## Estructura del repositorio

```
lib/     convierte los datos extraidos en texto, PDF y ChordPro. Lo comparten el dialogo
         y el CLI, y no depende de nada mas del arbol
score/   lee una partitura de MuseScore, y escribe en ella, un modulo por direccion y
         por origen: api-extractor.js lee la partitura abierta en MuseScore por la API de
         QML y api-patcher.js escribe en ella, que es lo que hace el boton Corregir,
         mientras xml-extractor.js lee el XML de un .mscz y xml-patcher.js escribe en el
         para el CLI. mscz-reader.js descomprime el archivo, y fallback-runner.js lanza
         el CLI cuando la API del plugin no da los diagramas de trastes
cli/     los dos puntos de entrada: index.js para la linea de comandos, y
         extract-chords.js, que el dialogo lanza para ese fallback
ui/      el dialogo y su texto de ayuda
test/    suites unitarias, y test/its/ para las de snapshot con las partituras
           sinteticas. test/local/, si existe, lleva la suite local de cada uno
```

Las dependencias van en una sola direccion: `score/` y `cli/` tiran de `lib/`, nunca al
contrario. Todo `.js` fuera de `cli/` funciona igual en el motor de QML y en Node, y por eso
el mismo codigo de formateo sirve al dialogo y a la linea de comandos. Un modulo que
necesita a otro lo recibe por `require` en Node y por referencia inyectada en QML
(`setTextUtils`, `setLineBuilder`, `setConvertChord`), porque en QML no hay `require`.

## Tests

```bash
npm test              # equivalente a: node --test 'test/**/*.test.js'
npm run test:package  # construye el paquete y corre la misma suite contra su CLI minificado
```

820 tests cubriendo lectores de partitura, formateo, repeticiones, navegacion, salida PDF, modo solo acordes, deteccion de ortografia, diagramas de trastes, API nativa, busqueda de archivos, clasificacion de tipos de elemento, layout de la linea de acordes, manejo de puntuacion e integracion.

Los tests de snapshot en `test/its/` comparan la salida del CLI con ficheros `.txt` de referencia. Todas las partituras que leen son sinteticas y se versionan, una por cada generador `build-*.js` que esta al lado, y cada una existe para alcanzar codigo que las demas no tocan: sin letra ninguna, repeticiones sin letra, frases que hay que partir, cifrados de acorde, etiquetas de seccion, intros e interludios instrumentales, diagramas de acorde en la part de guitarra. La `.mscz` es la fixture oficial y el generador es como se edita, y `test/synthetic-scores.test.js` falla si las dos se separan.

`test/its/snapshot.js` es quien las corre, y no sabe ningun nombre: una cancion entra porque existe una referencia suya, y un modo se ejecuta porque existe la referencia de ese modo. Asi que quien quiera probar contra partituras reales pone copias congeladas en `test/local/scores/`, genera las referencias al lado, y añade un fichero suyo:

```js
// test/local/its.test.js
require("../its/snapshot").define({ label: "local", baselinesDir: __dirname });
```

El `.gitignore` de la raiz excluye `test/local/` entero, asi que ningun titulo, nombre de fichero ni letra de esa musica llega al repositorio, y `npm test` la corre cuando esta sin echarla de menos cuando no.

`node test/its/coverage-gap.js` mide cuanto de `lib/` y `score/` alcanza solo una suite local, corriendo los snapshots dos veces bajo cobertura. Es la medida que una sintetica nueva tiene que mover: escribirlas llevo los tests de snapshot que un colaborador puede correr de 14 a 28, y la suite entera desde un checkout limpio cubre ahora el 90,9% de lineas y el 89,1% de ramas, frente al 91,1% y el 90,0% con una suite local de diecinueve partituras reales.

Las referencias se revisan a mano: nunca regenerar una sin comprobar antes si la partitura cambio (cada referencia guarda el mtime del `.mscz` en un comentario final).

`npm run test:package` es el que importa antes de una release: minifica y luego pasa la suite por el CLI empaquetado, asi que una minificacion que cambie cualquier salida falla. El workflow de release lo usa como puerta.

## Construir el paquete .mext

```bash
npm install --ignore-scripts   # una vez, para terser
npm run build                  # build de desarrollo
node build.js 1.6.1            # build con version
node build.js dev --no-minify  # fuentes tal cual, para aislar un problema de empaquetado
npm run install-local          # construir y copiar al directorio local de extensiones
```

Los nombres de fichero y las rutas relativas del paquete son las de este arbol, asi que los imports de QML resuelven alli igual que aqui. Solo se incluyen ficheros de runtime, ni tests ni documentacion.

El JavaScript se minifica: fuera comentarios y espacios, y las expresiones se comprimen, lo que baja el paquete de 156K a 103K. Los identificadores **no** se acortan. Es a proposito: acortarlos costo dos bugs en release, deja inservible la traza de error en un entorno donde solo hay `console.log`, y ahorraria solo 9K mas. `test/minify.test.js` sostiene esas opciones comprobando que los modulos minificados conservan todos sus exports y todos los nombres que llama el dialogo. Los fuentes se leen en este repositorio, no en el paquete.

## Licencia

Licencia Publica General de GNU, version 3 o posterior, ver [LICENSE](LICENSE). Copyright (C) 2026 Manolo Carrasco (do2tis)
