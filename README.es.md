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

### Texto de pentagrama en la linea de acordes
Los textos de pentagrama, expresiones y tecnicas de interpretacion del pentagrama de acompanamiento se imprimen en la linea de acordes entre parentesis, para que se lean como palabras y no como un acorde: `(muy suave)`, `(8va 2nd time)`. Cuando uno comparte tiempo con un acorde se imprimen los dos, el acorde primero. El PDF les da un color propio en lugar de los parentesis, y ChordPro los escribe como `[*muy suave]`, que una aplicacion que transporta deja en paz. Por dentro viajan entre llaves, que ninguna notacion de acordes usa, porque el parentesis si forma parte del vocabulario de los acordes, `Mi7(b5)`: eso es lo que permite al PDF saber que colorear y a ChordPro que marcar, y los parentesis se ponen al final, para quien lee. La opcion **Textos de pentagrama**, o `--no-annotations`, los deja fuera.

### Exportar a ChordPro
**Guardar ChordPro** escribe un fichero `.cho`, el formato que leen las aplicaciones de cancionero: acordes en linea y en cifrado anglosajon para que cualquier lector pueda transportarlos, etiquetas de seccion como comentarios, y el titulo y la tonalidad de la partitura como `{title:}` y `{key:}`.

### Letras huerfanas
Cuando una partitura tiene mas lineas de letra que pasadas tiene la musica, las ultimas se quedan sin cantar. El plugin dice cual es esa linea, y la opcion **Letras huerfanas** la imprime tras la musica, despues de una raya, con los acordes de sus propios compases encima.

### Modo solo acordes
Para partituras sin letras (instrumentales), el plugin muestra automaticamente la progresion de acordes estructurada por secciones, barlines y marcas de repeticion.

### Diagramas de trastes
Extrae diagramas de trastes desde frames FBox (incluyendo excerpts de guitarra) y los renderiza graficamente en la cabecera del PDF. Cuando la API de QML expone `FretDiagram`, los diagramas y nombres de acordes se leen de la partitura en memoria. Eso es [el PR 32996 de MuseScore](https://github.com/musescore/MuseScore/pull/32996), integrado en abril de 2026, cuando la rama 4.7 ya estaba cortada: ninguna release 4.7.x lo lleva. Hasta que salga una que si, el plugin recurre a leer el .mscz del disco, y por eso pide el directorio donde tienes tus partituras. El CLI lee siempre el archivo directamente y no necesita ninguna de las dos cosas.

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
| **Pentagrama** | De que pentagrama leer la letra, cuando hay letra en varios. En automatico se usa el que tiene mas silabas |
| **Extraer** | Extraer letras con acordes, mostrar vista previa |
| **Copiar** | Copiar texto extraido al portapapeles |
| **Guardar txt** | Guardar archivo de texto junto a la partitura y abrirlo |
| **Guardar ChordPro** | Guardar un fichero `.cho` junto a la partitura |
| **Depurar** | Exportar datos crudos como JSON |

### Ajustes (persistentes)

Todas las opciones del dialogo se recuerdan entre sesiones, bajo la categoria `LyricsExtractor`.

| Ajuste | Descripcion |
|--------|-------------|
| Solfeo | Convierte nombres de acordes a solfeo (Do, Re, Mi) o anglo (C, D, E) |
| Repetir todo | Expandir todas las repeticiones D.S./D.C. aunque no haya nuevas letras |
| Solo letras | Omitir las lineas de acordes, dejando letra y etiquetas de seccion |
| Letras huerfanas | Imprimir las lineas de letra que ninguna pasada canta |
| Textos de pentagrama | Incluir textos de pentagrama, expresiones y tecnicas en la linea de acordes |
| Ajustar a 1 pagina, Numeros de linea, Sin diagramas | Las opciones de PDF de abajo |
| Encabezado, Pie | El texto de encabezado y pie del PDF |
| Directorio de partituras | De donde lee el plugin un `.mscz` para encontrar sus diagramas |

### Opciones PDF (visibles tras la extraccion)

| Opcion | Descripcion |
|--------|-------------|
| Cabecera | Texto alineado a la derecha en cada pagina (ej: nombre del grupo) |
| Pie de pagina | Texto centrado al pie de cada pagina (ej: nombre de la banda) |
| Condensar en 1 pagina | Reduce espaciado y fuente para caber en una pagina (prioriza mantener fuente legible) |
| Num. linea | Numeros secuenciales en lineas de letra |
| Sin diagramas de acordes | Omitir diagramas de trastes de la cabecera |
| **Guardar** (PDF) | Guardar PDF junto a la partitura y abrirlo |

## Donde lee y escribe el plugin

Hay dos decisiones de MuseScore detras de esto, y conviene saber cual es cual.

**Escribir esta restringido a las carpetas que MuseScore conoce.** Desde [el PR 31066](https://github.com/musescore/MuseScore/pull/31066), `FileIO` rechaza cualquier ruta fuera de ellas: la carpeta de datos del usuario (`Documents/MuseScore4`, que contiene Scores, Plugins, SoundFonts, Styles y Templates), la carpeta temporal del sistema, y cada carpeta configurada en *Preferencias → Carpetas*. Los datos de aplicacion de MuseScore quedan fuera a proposito, porque ahi viven credenciales, atajos y logs. Un plugin no puede escribir junto a un archivo cualquiera de tu disco, y este no es una excepcion: **Guardar txt**, **Guardar pdf** y **Guardar ChordPro** escriben en

```
~/Documents/MuseScore4/Scores/<titulo>-lyrics.pdf
~/Documents/MuseScore4/<titulo>-lyrics.pdf      (si la primera no se puede escribir)
```

venga la partitura de donde venga, porque la API no le dice a un plugin ni la ruta de la partitura abierta ni la carpeta de partituras que tengas configurada. El CLI no tiene ese limite: escribe al lado de la partitura que le pases.

**Leer el .mscz es lo que necesita el fallback de los diagramas**, por el motivo de arriba. El campo **Directorio** del dialogo es donde busca, en este orden:

```
<Directorio>/<nombre>/<nombre>.mscz     una carpeta por cancion
<Directorio>/<nombre>.mscz              todas juntas
<Directorio>/**/<nombre>.mscz           en cualquier sitio por debajo, recursivamente
```

**Asi que apunta los dos al mismo sitio.** Ten tus partituras bajo `Documents/MuseScore4/Scores`, pon *Preferencias → Carpetas → Partituras* en esa carpeta, y pon tambien ahi el **Directorio** del plugin. Entonces el fallback encuentra la partitura que tienes abierta, y lo que el plugin guarda aparece donde vas a buscarlo. Si tus partituras viven en otro sitio, el fallback sigue funcionando mientras **Directorio** apunte alli, pero lo guardado seguira apareciendo bajo `Documents/MuseScore4/`.

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
| `--save` | Guardar como `<partitura>-lyrics.txt` junto al .mscz |
| `--pdf` | Generar PDF como `<partitura>-lyrics.pdf` |
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
| `--compact` | Abreviar una estrofa que se repite, imprimiendola una vez con `...` |
| `--check` | Analizar letras (sinalefa, guiones, silabico, puntuacion) |
| `--fix` | Corregir letras, sincronizar acordes y propiedades del proyecto |
| `--debug` | Exportar datos crudos como JSON |

Por defecto, los nombres de acorde usan la ortografia de la partitura. Usar `--anglo` o `--solfeo` para forzar.

## Traducir el dialogo

El dialogo toma el idioma de MuseScore. El ingles vive en `ui/i18n/en.js` y es la referencia;
cualquier otro idioma es un JSON al lado, que se lee al arrancar el plugin:

```
ui/i18n/en.js     ingles, importado por el dialogo, asi que siempre esta
ui/i18n/es.json   español
ui/i18n/<codigo>.json   el tuyo
```

Para añadir uno, copia las claves de `en.js` a `ui/i18n/<codigo>.json` como objeto JSON, traduce
los valores y suelta el fichero en la extension instalada. No hay nada mas que tocar: el plugin
busca primero `<idioma>_<REGION>.json` y luego `<idioma>.json`, segun lo que diga MuseScore.

Una traduccion puede estar a medias. Lo que no lleve se lee del ingles, asi que un fichero con
diez claves es una contribucion perfectamente valida, y una clave que falte en todos los idiomas
se muestra con su propio nombre, `save.txtDone`, que dice donde mirar.

Los `{marcadores}` se rellenan en tiempo de ejecucion y se pueden reordenar como pida el idioma:

```json
"extract.summary": "{syllables} silabas, {chords} acordes extraidos"
```

`node --test test/unit/i18n.test.js` comprueba que toda clave que pide el dialogo existe en
ingles, que una traduccion no inventa claves ni marcadores, e imprime cuanto lleva cada idioma.

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
ui/      el dialogo, su pagina de ayuda, y un fichero por idioma en ui/i18n/
test/    unit/ para las suites unitarias, its/ para el corpus de snapshot y sus
           referencias, y local/, si existe, para la suite propia de cada uno
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

925 tests cubriendo lectores de partitura, formateo, repeticiones, navegacion, salida PDF, modo solo acordes, deteccion de ortografia, diagramas de trastes, API nativa, busqueda de archivos, clasificacion de tipos de elemento, layout de la linea de acordes, manejo de puntuacion e integracion.

Las suites unitarias estan en `test/unit/`, una por modulo. Al lado, los tests de snapshot comparan la salida del CLI con ficheros `.txt` de referencia:

```
test/its/scores/       el corpus, .mscz pequeños, versionados
test/its/baselines/    lo que el CLI tiene que imprimir para cada uno
```

Cada partitura del corpus existe para alcanzar codigo que las demas no tocan: sin letra ninguna, repeticiones sin letra, frases que hay que partir, cifrados de acorde, etiquetas de seccion, intros e interludios instrumentales, diagramas de acorde en la part de guitarra, texto de pentagrama compartiendo tiempo con un acorde dentro de una repeticion. De donde salieron no es asunto del repositorio: son las fixtures oficiales, y bien puede ser que el mantenedor dibujara alguna a mano en MuseScore.

`test/its/snapshot.js` es quien las corre, y no sabe ningun nombre: una cancion entra porque existe una referencia suya, y un modo se ejecuta porque existe la referencia de ese modo. Asi que añadir una partitura es copiarla y generar sus referencias, sin ninguna lista que editar.

Eso es tambien lo que permite mantener una suite propia al lado, en una carpeta que git ignora entera:

```
test/local/scores/      copias congeladas de partituras reales
test/local/baselines/   sus referencias
test/local/generators/  los scripts que escriben el corpus de test/its/scores
test/local/local.test.js
```

`npm test` es un glob recursivo, asi que esa suite corre cuando esta y no se echa de menos cuando no: nada en `package.json` la nombra. Ninguna letra de esa musica llega al repositorio, y los generadores se quedan alli tambien, de modo que el corpus vale por lo que cubre y no por como se escribio.

`node test/its/coverage-gap.js` mide cuanto de `lib/` y `score/` alcanza solo una suite local, corriendo los snapshots dos veces bajo cobertura. Es la medida que una sintetica nueva tiene que mover: escribirlas llevo los tests de snapshot que un colaborador puede correr de 14 a 26, y la suite entera desde un checkout limpio cubre ahora el 91,4% de lineas y el 90,0% de ramas, lo mismo que con una suite local de veintiuna partituras reales anadida: el corpus llega ya donde llega esa musica.

Las referencias se revisan a mano: nunca regenerar una sin comprobar antes si la partitura cambio (cada referencia guarda el mtime del `.mscz` en un comentario final).

`npm run test:package` es el que importa antes de una release: minifica y luego pasa la suite por el CLI empaquetado, asi que una minificacion que cambie cualquier salida falla. El workflow de release hace lo mismo paso a paso en vez de llamarlo, porque tiene que empaquetar la version real primero y no puede permitir que ese arbol se reconstruya como version dev por debajo. En cualquiera de los dos casos la carpeta de montaje se borra despues: MuseScore lee un manifiesto de cualquier subdirectorio, asi que una que se quede olvidada mientras se desarrolla hace que el plugin aparezca dos veces en el menu de extensiones.

## Construir el paquete .mext

```bash
npm install --ignore-scripts   # una vez, para terser
npm run build                  # build de desarrollo
node build.js 2.0.3            # build con version
node build.js dev --no-minify  # fuentes tal cual, para aislar un problema de empaquetado
npm run install-local          # construir y copiar al directorio local de extensiones
```

Los nombres de fichero y las rutas relativas del paquete son las de este arbol, asi que los imports de QML resuelven alli igual que aqui. Solo se incluyen ficheros de runtime, ni tests ni documentacion.

El JavaScript se minifica: fuera comentarios y espacios, y las expresiones se comprimen, lo que baja el paquete de 156K a 103K. Los identificadores **no** se acortan. Es a proposito: acortarlos costo dos bugs en release, deja inservible la traza de error en un entorno donde solo hay `console.log`, y ahorraria solo 9K mas. `test/minify.test.js` sostiene esas opciones comprobando que los modulos minificados conservan todos sus exports y todos los nombres que llama el dialogo. Los fuentes se leen en este repositorio, no en el paquete.

## Licencia

Licencia Publica General de GNU, version 3 o posterior, la misma que MuseScore Studio. Ver
[LICENSE](LICENSE) para la licencia y [ATTRIBUTION.md](ATTRIBUTION.md) para el copyright y el
termino añadido. Copyright (C) 2026 Manolo Carrasco (do2tis).

Puedes usar, estudiar, compartir y modificar esto, y tienes que transmitir esas mismas
libertades: una version modificada tiene que ser software libre tambien, con su fuente
disponible.

Hay un requisito adicional, al amparo de la seccion 7(b) de la licencia, y es solo sobre el
credito:

> Debes conservar la atribucion de autor en el dialogo del plugin, donde se muestra hoy, y en la
> linea de credito impresa en cada pagina de los documentos que el programa genera. Si modificas
> el programa puedes añadir tu propia atribucion al lado, pero no puedes quitar ni ocultar la
> original.

Sumar al credito es bienvenido. Sustituirlo es lo unico que esta licencia no permite.
