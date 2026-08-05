// Help dialog content (bilingual Spanish/English)
// Imported by LyricsForm.qml as HelpText

var es =
    "<table cellpadding='4' width='100%'>" +
    "<tr><td colspan='2'><h3>C\u00f3mo usar el plugin</h3>" +
    "<ol>" +
    "<li>Abre una partitura con letra y acordes en MuseScore.</li>" +
    "<li>Pulsa <b>Extraer</b> para extraer letra con acordes alineados.</li>" +
    "<li>Revisa el resultado en la previsualizaci\u00f3n.</li>" +
    "<li>Pulsa <b>Guardar txt</b> para guardar como texto plano, " +
    "o <b>Guardar pdf</b> para generar un PDF con formato.</li>" +
    "</ol></td></tr>" +
    "<tr><td colspan='2'><hr></td></tr><tr><td colspan='2'><h3>Preparar la partitura General</h3></td></tr>" +
    "<tr><td width='150' nowrap><b>T\u00edtulo</b></td><td>El plugin busca el t\u00edtulo en: 1) Propiedades del proyecto, " +
    "2) Texto del VBox (marco superior), 3) Nombre del archivo. " +
    "El bot\u00f3n <b>Corregir</b> sincroniza los campos del VBox (t\u00edtulo, subt\u00edtulo, compositor, letrista) a las propiedades del proyecto.</td></tr>" +
    "<tr><td width='150' nowrap><b>Texto de sistema</b></td><td><code>Ctrl+Shift+T</code>. Marca secciones (Intro, Estrofa, Estribillo, M\u00fasica). " +
    "Aparecen como nueva secci\u00f3n <b>ETIQUETA</b> en la salida. Usa <code>#</code> para numeraci\u00f3n autom\u00e1tica: <code>Coro #</code> produce Coro 1, Coro 2, etc. " +
    "Usa <code>:</code> o <code>-</code> para secuencias expl\u00edcitas: <code>Solista manolo:juan</code> produce Solista Manolo, Solista Juan, luego Solista.</td></tr>" +
    "<tr><td width='150' nowrap><b>Marca de ensayo</b></td><td><code>Ctrl+M</code>. Se tratan igual que los textos de sistema (generan etiquetas de secci\u00f3n). " +
    "Excepci\u00f3n: si el texto de la marca es el n\u00famero de su propio comp\u00e1s, es una referencia de ensayo de las que MuseScore numera sola, no un t\u00edtulo, y se ignora. " +
    "Una marca numerada a mano que no coincida con su comp\u00e1s (<code>1</code>, <code>2</code>, <code>3</code> como secciones) s\u00ed genera etiqueta.</td></tr>" +
    "<tr><td width='150' nowrap><b>Repeticiones</b></td><td>Las barras de repetici\u00f3n, casillas de volta, Da Capo, Da Segno y saltos se respetan. " +
    "El plugin expande las repeticiones en orden de ejecuci\u00f3n.</td></tr>" +
    "<tr><td width='150' nowrap><b>Separar estrofas</b></td><td>Estos elementos generan un salto de p\u00e1rrafo (l\u00ednea en blanco) en la salida: " +
    "textos de sistema, marcas de ensayo (salvo las numeradas por comp\u00e1s), barras de fin, doble barra y barra gruesa.</td></tr>" +
    "<tr><td colspan='2'><hr></td></tr><tr><td colspan='2'><h3>Preparar la partitura de Guitarra</h3></td></tr>" +
    "<tr><td width='150' nowrap><b>Acordes</b></td><td><code>Ctrl+K</code>. A\u00f1ade s\u00edmbolos de acorde en la nota justa donde cambia la armon\u00eda. " +
    "Utiliza el estilo solfeo o anglosaj\u00f3n seg\u00fan tus preferencias. " +
    "Se extraen autom\u00e1ticamente del pentagrama de acompa\u00f1amiento.</td></tr>" +
    "<tr><td width='150' nowrap><b>Colecci\u00f3n de acordes</b></td><td>Inserta una leyenda de diagramas de acordes seleccionando el primer " +
    "elemento de la partitura general o de cualquier parte de guitarra: <i>A\u00f1adir > Marcos > Leyenda de diagrama de acordes</i>. " +
    "Se dibujan en el encabezado del PDF. Los diagramas colocados sobre notas tambi\u00e9n se extraen como acordes.</td></tr>" +
    "<tr><td width='150' nowrap><b>Texto de partitura</b></td><td><code>Ctrl+T</code>. Los textos en el pentagrama de acompa\u00f1amiento se muestran en la l\u00ednea de acordes " +
    "como si fueran un acorde (ej: <code>Bajos</code>, <code>Capella</code>).</td></tr>" +
    "<tr><td width='150' nowrap><b>Expresi\u00f3n</b></td><td><code>Ctrl+E</code>. Los textos de expresi\u00f3n en el pentagrama de acompa\u00f1amiento tambi\u00e9n aparecen en la l\u00ednea de acordes.</td></tr>" +
    "<tr><td colspan='2'><hr></td></tr><tr><td colspan='2'><h3>Preparar la partitura de Voz</h3></td></tr>" +
    "<tr><td width='150' nowrap><b>Introducci\u00f3n de texto</b></td><td><code>Ctrl+L</code>. Introduce el texto en la partitura s\u00edlaba a s\u00edlaba " +
    "y utiliza ciertos caracteres descritos m\u00e1s abajo para separaciones.</td></tr>" +
    "<tr><td width='150' nowrap><b>S\u00edlabas (gui\u00f3n)</b></td><td>Usa gui\u00f3n para separar s\u00edlabas de la misma palabra (<code>co-ra-z\u00f3n</code>).</td></tr>" +
    "<tr><td width='150' nowrap><b>Palabras (espacio)</b></td><td>Usa espacio para saltar a la siguiente nota e iniciar una nueva palabra.</td></tr>" +
    "<tr><td width='150' nowrap><b>Extensi\u00f3n (gui\u00f3n bajo)</b></td><td>Usa gui\u00f3n bajo para notas que contin\u00faan la s\u00edlaba anterior (melisma). " +
    "Se muestra como l\u00ednea continua en la salida.</td></tr>" +
    "<tr><td width='150' nowrap><b>Sinalefa</b></td><td>Usa un punto u otro car\u00e1cter de puntuaci\u00f3n entre dos letras para marcar sinalefas: " +
    "<code>da.es</code> o <code>da\u00aces</code> generar\u00e1n <code>da es</code> separado en la extracci\u00f3n. " +
    "Cualquier s\u00edmbolo entre dos letras (excepto gui\u00f3n y gui\u00f3n bajo) se interpreta como sinalefa.</td></tr>" +
    "<tr><td width='150' nowrap><b>Divisi\u00f3n autom\u00e1tica</b></td><td>El plugin divide las l\u00edneas autom\u00e1ticamente por puntuaci\u00f3n, silencios musicales, " +
    "barras dobles y longitud de l\u00ednea. Para mejores resultados: usa <code>;</code> para forzar saltos, " +
    "a\u00f1ade <b>barras dobles</b> entre secciones, y a\u00f1ade <b>Texto de sistema</b> con nombres de secci\u00f3n. " +
    "Sin estos marcadores, el plugin se basa en heur\u00edsticas que pueden dar resultados suboptimos en frases largas sin pausas.</td></tr>" +
    "<tr><td width='150' nowrap><b>Forzar salto de l\u00ednea</b></td><td>Usa <code>;</code> (punto y coma) en la s\u00edlaba para forzar un salto de l\u00ednea. " +
    "El bot\u00f3n <b>Corregir</b> lo convierte en una coma especial visible en la partitura, y se muestra como <code>,</code> en la salida.</td></tr>" +
    "<tr><td width='150' nowrap><b>Evitar salto de l\u00ednea</b></td><td>A veces la puntuaci\u00f3n o un silencio cortan la frase en dos l\u00edneas. " +
    "Para evitarlo, duplica el car\u00e1cter en la s\u00edlaba: " +
    "<code>..</code> muestra un punto, <code>,,</code> muestra una coma, <code>...</code> muestra puntos suspensivos. " +
    "Todos impiden que el plugin parta la l\u00ednea ah\u00ed.</td></tr>" +
    "<tr><td width='150' nowrap><b>M\u00faltiples versos</b></td><td>MuseScore soporta m\u00faltiples letras para el mismo pasaje (verso 1, 2, 3...). " +
    "El plugin las extrae en el orden de la partitura.</td></tr>" +
    "<tr><td colspan='2'><hr></td></tr><tr><td colspan='2'><h3>Opciones de extracci\u00f3n</h3></td></tr>" +
    "<tr><td width='150' nowrap><b>Solfeo</b></td><td>Usa nombres Do, Re, Mi en vez de C, D, E.</td></tr>" +
    "<tr><td width='150' nowrap><b>Repetir todo</b></td><td>Escribe todas las repeticiones aunque el texto sea id\u00e9ntico (sin abreviar estribillos).</td></tr>" +
    "<tr><td width='150' nowrap><b>Solo letra</b></td><td>Omite las l\u00edneas de acordes, dejando solo el texto de la letra y las etiquetas de secci\u00f3n.</td></tr>" +
    "<!--SCORES_DIR-->" +
    "<tr><td colspan='2'><hr></td></tr><tr><td colspan='2'><h3>Opciones del PDF</h3></td></tr>" +
    "<tr><td width='150' nowrap><b>Cabecera</b></td><td>Texto alineado a la derecha en la parte superior de cada p\u00e1gina (ej: nombre del grupo).</td></tr>" +
    "<tr><td width='150' nowrap><b>Pie de p\u00e1gina</b></td><td>Texto centrado al pie de cada p\u00e1gina (ej: nombre de la banda).</td></tr>" +
    "<tr><td width='150' nowrap><b>Condensar en 1 p\u00e1gina</b></td><td>Reduce espaciado y tama\u00f1o de fuente para que todo quepa en una p\u00e1gina. Prioriza mantener la fuente legible reduciendo primero los espacios.</td></tr>" +
    "<tr><td width='150' nowrap><b>N\u00fam. l\u00ednea</b></td><td>Muestra n\u00fameros de l\u00ednea a la izquierda de cada verso.</td></tr>" +
    "<tr><td width='150' nowrap><b>Sin diagramas</b></td><td>Omite los diagramas de acordes del encabezado del PDF.</td></tr>" +
    "<tr><td colspan='2'><hr></td></tr><tr><td colspan='2'><h3>Otros botones</h3></td></tr>" +
    "<tr><td width='150' nowrap><b>Corregir</b></td><td>Readapta la entrada de la letra: convierte sinalefas a \u203f (arco de uni\u00f3n), " +
    "y los marcadores de no salto (<code>..</code> <code>,,</code> <code>...</code>) a sus s\u00edmbolos internos.</td></tr>" +
    "<tr><td width='150' nowrap><b>Debug</b></td><td>Exporta los datos internos como JSON para diagn\u00f3stico.</td></tr>" +
    "</table>";

var en =
    "<table cellpadding='4' width='100%'>" +
    "<tr><td colspan='2'><h3>How to use the plugin</h3>" +
    "<ol>" +
    "<li>Open a score with lyrics and chords in MuseScore.</li>" +
    "<li>Click <b>Extract</b> to extract lyrics with aligned chords.</li>" +
    "<li>Review the result in the preview area.</li>" +
    "<li>Click <b>Save txt</b> for plain text, " +
    "or <b>Save pdf</b> to generate a formatted PDF.</li>" +
    "</ol></td></tr>" +
    "<tr><td colspan='2'><hr></td></tr><tr><td colspan='2'><h3>Preparing the score: General</h3></td></tr>" +
    "<tr><td width='150' nowrap><b>Title</b></td><td>The plugin looks for the title in: 1) Project Properties, " +
    "2) VBox text (top frame), 3) File name. " +
    "The <b>Fix</b> button syncs VBox fields (title, subtitle, composer, lyricist) to project properties.</td></tr>" +
    "<tr><td width='150' nowrap><b>System text</b></td><td><code>Ctrl+Shift+T</code>. Mark sections (Intro, Verse, Chorus, Music). " +
    "They appear as <code>- LABEL -</code> in the output. Use <code>#</code> for auto-numbering: <code>Chorus #</code> produces Chorus 1, Chorus 2, etc. " +
    "Use <code>:</code> or <code>-</code> for explicit sequences: <code>Solo manolo:juan</code> produces Solo Manolo, Solo Juan, then Solo.</td></tr>" +
    "<tr><td width='150' nowrap><b>Rehearsal mark</b></td><td><code>Ctrl+M</code>. Treated the same as system text (they generate section labels). " +
    "Exception: a mark whose text is the number of its own measure is one of the rehearsal references MuseScore numbers by itself, not a title, and is ignored. " +
    "A hand numbered mark that does not match its measure (<code>1</code>, <code>2</code>, <code>3</code> as sections) does generate a label.</td></tr>" +
    "<tr><td width='150' nowrap><b>Repeats</b></td><td>Repeat barlines, volta brackets, Da Capo, Da Segno and jumps are respected. " +
    "The plugin expands repeats in performance order.</td></tr>" +
    "<tr><td width='150' nowrap><b>Separate stanzas</b></td><td>These elements create a paragraph break (blank line) in the output: " +
    "system texts, rehearsal marks (except those numbered by measure), final barlines, double barlines and heavy barlines.</td></tr>" +
    "<tr><td colspan='2'><hr></td></tr><tr><td colspan='2'><h3>Preparing the Guitar part</h3></td></tr>" +
    "<tr><td width='150' nowrap><b>Chords</b></td><td><code>Ctrl+K</code>. Add chord symbols on the exact note where the harmony changes. " +
    "Use solfeo or anglo-saxon style according to your preferences. " +
    "They are automatically extracted from the accompaniment staff.</td></tr>" +
    "<tr><td width='150' nowrap><b>Chord collection</b></td><td>Insert a chord diagram legend by selecting the first element " +
    "of the full score or any guitar part: <i>Add > Frames > Chord diagram legend</i>. " +
    "They are drawn in the PDF header. Diagrams placed on notes are also extracted as chords.</td></tr>" +
    "<tr><td width='150' nowrap><b>Score text</b></td><td><code>Ctrl+T</code>. Texts on the accompaniment staff appear on the chord line " +
    "as if they were a chord (e.g. <code>Bass</code>, <code>A cappella</code>).</td></tr>" +
    "<tr><td width='150' nowrap><b>Expression</b></td><td><code>Ctrl+E</code>. Expression texts on the accompaniment staff also appear on the chord line.</td></tr>" +
    "<tr><td colspan='2'><hr></td></tr><tr><td colspan='2'><h3>Preparing the Vocal part</h3></td></tr>" +
    "<tr><td width='150' nowrap><b>Text entry</b></td><td><code>Ctrl+L</code>. Enter text in the score syllable by syllable " +
    "and use certain characters described below for separations.</td></tr>" +
    "<tr><td width='150' nowrap><b>Syllables (hyphen)</b></td><td>Use hyphen to separate syllables of the same word (<code>beau-ti-ful</code>).</td></tr>" +
    "<tr><td width='150' nowrap><b>Words (space)</b></td><td>Use space to jump to the next note and start a new word.</td></tr>" +
    "<tr><td width='150' nowrap><b>Extension (underscore)</b></td><td>Use underscore for notes that continue the previous syllable (melisma). " +
    "Shown as a continuous line in the output.</td></tr>" +
    "<tr><td width='150' nowrap><b>Synalepha</b></td><td>Use a dot or other punctuation character between two letters to mark synalepha: " +
    "<code>da.es</code> or <code>da\u00aces</code> will output <code>da es</code> separated in the extraction. " +
    "Any symbol between two letters (except hyphen and underscore) is interpreted as synalepha.</td></tr>" +
    "<tr><td width='150' nowrap><b>Automatic splitting</b></td><td>The plugin splits lines automatically by punctuation, musical rests, " +
    "double barlines, and line length. For best results: use <code>;</code> to force breaks, " +
    "add <b>double barlines</b> between sections, and add <b>System Text</b> with section names. " +
    "Without these markers, the plugin relies on heuristics which may produce suboptimal results on long phrases without pauses.</td></tr>" +
    "<tr><td width='150' nowrap><b>Force line break</b></td><td>Use <code>;</code> (semicolon) in the syllable to force a line break. " +
    "The <b>Fix</b> button converts it to a visible special comma in the score, and it renders as <code>,</code> in the output.</td></tr>" +
    "<tr><td width='150' nowrap><b>Prevent line break</b></td><td>Sometimes punctuation or a rest splits a phrase into two lines. " +
    "To prevent it, double the character in the syllable: " +
    "<code>..</code> shows a period, <code>,,</code> shows a comma, <code>...</code> shows an ellipsis. " +
    "All of them prevent the plugin from breaking the line there.</td></tr>" +
    "<tr><td width='150' nowrap><b>Multiple verses</b></td><td>MuseScore supports multiple lyrics for the same passage (verse 1, 2, 3...). " +
    "The plugin extracts them in score order.</td></tr>" +
    "<tr><td colspan='2'><hr></td></tr><tr><td colspan='2'><h3>Extraction options</h3></td></tr>" +
    "<tr><td width='150' nowrap><b>Solfeo</b></td><td>Use names Do, Re, Mi instead of C, D, E.</td></tr>" +
    "<tr><td width='150' nowrap><b>Full repeat</b></td><td>Write all repetitions even if the text is identical (no abbreviated choruses).</td></tr>" +
    "<tr><td width='150' nowrap><b>Lyrics only</b></td><td>Omit chord lines, keeping only lyrics text and section labels.</td></tr>" +
    "<!--SCORES_DIR-->" +
    "<tr><td colspan='2'><hr></td></tr><tr><td colspan='2'><h3>PDF options</h3></td></tr>" +
    "<tr><td width='150' nowrap><b>Header</b></td><td>Right-aligned text at the top of every page (e.g. group name).</td></tr>" +
    "<tr><td width='150' nowrap><b>Footer</b></td><td>Centered text at the bottom of every page (e.g. band name).</td></tr>" +
    "<tr><td width='150' nowrap><b>Fit in 1 page</b></td><td>Reduce spacing and font size to fit on one page. Prioritizes keeping the font readable by reducing gaps first.</td></tr>" +
    "<tr><td width='150' nowrap><b>Line num.</b></td><td>Show line numbers to the left of each verse line.</td></tr>" +
    "<tr><td width='150' nowrap><b>No chord diagrams</b></td><td>Omit chord diagrams from the PDF header.</td></tr>" +
    "<tr><td colspan='2'><hr></td></tr><tr><td colspan='2'><h3>Other buttons</h3></td></tr>" +
    "<tr><td width='150' nowrap><b>Fix</b></td><td>Re-adapts lyric input by converting synalepha to \u203f (undertie), " +
    "and no-break markers (<code>..</code> <code>,,</code> <code>...</code>) to their internal symbols.</td></tr>" +
    "<tr><td width='150' nowrap><b>Debug</b></td><td>Export internal data as JSON for diagnostics.</td></tr>" +
    "</table>";

var scoresDirEs = "<tr><td width='150' nowrap><b>Directorio de partituras</b></td><td>En versiones anteriores a 4.7 el plugin necesita leer el archivo .mscz del disco para extraer los diagramas de acordes. " +
    "Configura aqu\u00ed la carpeta ra\u00edz donde guardas tus partituras (ej: HOME/Music).</td></tr>";
var scoresDirEn = "<tr><td width='150' nowrap><b>Scores directory</b></td><td>On versions prior to 4.7 the plugin needs to read the .mscz file from disk to extract chord diagrams. " +
    "Set the root folder where you store your scores (e.g. HOME/Music).</td></tr>";

