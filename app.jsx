import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";

const generateId = () => Math.random().toString(36).substr(2, 9);
const now = () => new Date().toISOString();

// ── Spanish syllable counter (sinalefa · diptongo/hiato · h muda · y vocálica · aguda/llana/esdrújula) ──
const countSyllables = (line) => {
  if (!line.trim()) return 0;
  const clean = line.toLowerCase().replace(/[^a-záéíóúüñy\s]/gi, "").trim();
  if (!clean) return 0;

  const strongV  = new Set("aeoáéó");
  const acWeak   = new Set("íú");
  const allV     = new Set("aeiouáéíóúüy");

  // Count syllables in a single word
  const countWord = (w) => {
    // y final actúa como vocal
    const wd = w.endsWith("y") ? w.slice(0, -1) + "i" : w;
    let n = 0, prev = "", prevIsV = false;
    for (let i = 0; i < wd.length; i++) {
      const ch = wd[i];
      if (ch === "h") continue; // h siempre muda
      if (allV.has(ch)) {
        if (!prevIsV) {
          n++;
        } else {
          // Hiato: vocal fuerte + vocal fuerte, o vocal débil acentuada
          const isHiatus = (strongV.has(ch) && strongV.has(prev)) || acWeak.has(ch) || acWeak.has(prev);
          if (isHiatus) n++;
          // Si no: diptongo → no incrementa
        }
        prev = ch; prevIsV = true;
      } else { prev = ch; prevIsV = false; }
    }
    return Math.max(n, 1);
  };

  // Ajuste por posición del acento (aguda +1, llana 0, esdrújula -1, sobresdrújula -2)
  const stressAdj = (w) => {
    const sylls = countWord(w);
    if (sylls <= 1) return 0;
    const hasAccent = /[áéíóú]/.test(w);
    const last = w[w.length - 1];
    const endsVNS = allV.has(last) || last === "n" || last === "s";
    if (!hasAccent) return endsVNS ? 0 : 1; // llana o aguda por defecto

    // Localizar la sílaba acentuada
    const wd = w.endsWith("y") ? w.slice(0, -1) + "i" : w;
    let sn = 0, accentSyll = -1, prev = "", prevIsV = false;
    for (let i = 0; i < wd.length; i++) {
      const ch = wd[i];
      if (ch === "h") continue;
      if (allV.has(ch)) {
        if (!prevIsV) sn++;
        else if ((strongV.has(ch) && strongV.has(prev)) || acWeak.has(ch) || acWeak.has(prev)) sn++;
        if ("áéíóú".includes(ch)) accentSyll = sn;
        prev = ch; prevIsV = true;
      } else { prev = ch; prevIsV = false; }
    }
    if (accentSyll === -1) return endsVNS ? 0 : 1;
    const fromEnd = sylls - accentSyll; // 0=aguda, 1=llana, 2=esdrújula
    if (fromEnd === 0) return 1;
    if (fromEnd === 1) return 0;
    return -(fromEnd - 1);
  };

  const words = clean.split(/\s+/).filter(w => w);
  if (!words.length) return 0;

  let total = 0;
  let prevEndedV = false;
  for (let i = 0; i < words.length; i++) {
    const wc = countWord(words[i]);
    // Sinalefa: palabra anterior termina en vocal, esta empieza por vocal (h transparente)
    if (prevEndedV && i > 0) {
      const fw = words[i].replace(/^h/, "")[0];
      if (fw && allV.has(fw)) total--;
    }
    total += wc;
    const lastCh = words[i][words[i].length - 1];
    prevEndedV = allV.has(lastCh) || lastCh === "y";
  }
  total += stressAdj(words[words.length - 1]);
  return Math.max(total, 1);
};

const getRhymeEnding = (line) => {
  const words = line.trim().split(/\s+/);
  if (!words.length) return "";
  const last = words[words.length - 1].toLowerCase().replace(/[^a-záéíóúüñ]/gi, "");
  const vowels = "aeiouáéíóúü";
  let idx = -1;
  for (let i = last.length - 1; i >= 0; i--) { if (vowels.includes(last[i])) { idx = i; break; } }
  return idx === -1 ? last.slice(-3) : last.slice(Math.max(0, idx - 1));
};

// ── Emotion analysis with song tag awareness ──
const SONG_TAGS = ["Intro", "Verso", "Pre-estribillo", "Estribillo", "Puente", "Outro"];
const TAG_RE = /^\[(Intro|Verso|Pre-estribillo|Estribillo|Puente|Outro)\]\s*$/i;

// ── Exclusive app micro-icons (SVG) for repetition types ──
const RepIcon = ({ type, color, size = 10 }) => {
  const s = { width: size, height: size, verticalAlign: "middle", marginRight: 3, flexShrink: 0 };
  if (type === "block") return <svg style={s} viewBox="0 0 12 12"><rect x="1" y="1" width="4" height="4" rx="0.5" fill={color} opacity="0.7"/><rect x="7" y="1" width="4" height="4" rx="0.5" fill={color} opacity="0.7"/><rect x="1" y="7" width="4" height="4" rx="0.5" fill={color}/><rect x="7" y="7" width="4" height="4" rx="0.5" fill={color}/></svg>;
  if (type === "near") return <svg style={s} viewBox="0 0 12 12"><circle cx="4.5" cy="6" r="3.5" fill="none" stroke={color} strokeWidth="1.2"/><circle cx="7.5" cy="6" r="3.5" fill="none" stroke={color} strokeWidth="1.2"/></svg>;
  if (type === "anaphora") return <svg style={s} viewBox="0 0 12 12"><path d="M9 3H4.5a2.5 2.5 0 0 0 0 5H7" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round"/><polyline points="5.5 6.5 7 8 5.5 9.5" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (type === "phrase") return <svg style={s} viewBox="0 0 12 12"><path d="M3.5 2v8M8.5 2v8M3.5 2h-1M3.5 10h-1M8.5 2h1M8.5 10h1" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round"/></svg>;
  // line
  return <svg style={s} viewBox="0 0 12 12"><line x1="2" y1="6" x2="10" y2="6" stroke={color} strokeWidth="1.5" strokeLinecap="round"/></svg>;
};
const CheckIcon = ({ color = "#4ECDC4", size = 10 }) => <svg style={{ width: size, height: size, verticalAlign: "middle", marginRight: 3 }} viewBox="0 0 12 12"><polyline points="2.5 6.5 5 9 9.5 3.5" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const WarnIcon = ({ color = "#FFA500", size = 10 }) => <svg style={{ width: size, height: size, verticalAlign: "middle", marginRight: 3 }} viewBox="0 0 12 12"><path d="M6 1.5L11 10.5H1L6 1.5z" fill="none" stroke={color} strokeWidth="1.1" strokeLinejoin="round"/><line x1="6" y1="5" x2="6" y2="7.5" stroke={color} strokeWidth="1.2" strokeLinecap="round"/><circle cx="6" cy="9" r="0.6" fill={color}/></svg>;

const splitSongBlocks = (text) => {
  const lines = text.split("\n");
  const blocks = [];
  let cur = { tag: null, lines: [] };
  lines.forEach(l => {
    const m = l.trim().match(TAG_RE);
    if (m) {
      if (cur.lines.length) blocks.push({ tag: cur.tag, text: cur.lines.join("\n") });
      cur = { tag: m[1], lines: [] };
    } else {
      cur.lines.push(l);
    }
  });
  if (cur.lines.length) blocks.push({ tag: cur.tag, text: cur.lines.join("\n") });
  return blocks.filter(b => b.text.trim());
};

// ── Emotion detection v2: precision-trained on real Spanish poetry corpus ──
// weight 3 = unequivocal emotion anchor · weight 2 = core emotion word
// weight 1 = contextual / atmospheric / polysemic
// Stems calibrated against 6 thematic sections: desamor, amor, oscuridad,
// luz en la tormenta, superación & ambición, crítica social.
// v2 changes: +95 stems from corpus analysis, emotive-negation handling,
// logarithmic intensity scaling, secondary dominant detection, arc labels.
// POETRY mode only — for song mode see SONG_EMOTION_DEFS below.
const EMOTION_DEFS = {
  joy: {
    core: [
      ["alegr",3],["felicidad",3],["feliz",3],["gozo",3],["dicha",3],["dichoso",3],
      ["eufori",3],["júbilo",3],["jubiloso",2],["regocij",2],["contento",2],
      ["risa",2],["reír",2],["sonrisa",2],["sonríe",2],["sonreír",2],
      ["prosperidad",2],["triunfo",2],["triunfe",2],["triunfar",2],
      ["victori",2],["ganado",2],["éxito",2],
      ["olimpo",2],["paraíso",2],["glorioso",2],["radiante",2],
      ["respetado",2],["autoestima",2]
    ],
    ctx: [
      ["celebr",1],["fiesta",1],["baile",1],["brillo",2],["brillar",1],["brill",1],
      ["respland",1],["destello",2],["deslumbr",2],["iluminar",2],["luminoso",1],["vivaz",1],
      ["disfru",1],["jovial",1],["plácido",1],["libre",1],["libertad",1],
      ["vuelo",1],["volar",1],["esplendor",1],["cima",2],["cumbre",1],
      ["legado",2],["lograr",1],["alcanzar",1],["construir",1],["animado",1],
      ["vibrante",1],["faro",1],["ascender",1],
      ["imperio",2],["poderoso",1],["élite",1],["lujos",1],["oro",1],
      ["estrella",1],["divino",1],["don",1],["vocación",1],
      ["divierto",1],["aprovecho",1],["provecho",1]
    ]
  },
  sadness: {
    core: [
      ["trist",3],["melancol",3],["llanto",3],["lágrim",3],["llor",2],
      ["dolor",3],["sufrim",3],["sufrir",2],["sufre",2],["sufriendo",2],
      ["pena",2],["soledad",2],["vacío",2],["vacía",2],
      ["agoniz",3],["desespero",3],["desespera",3],["desesperación",3],
      ["angustia",2],["angustiad",2],
      ["lament",2],["pérdida",2],["muert",2],["morí",2],["morir",2],
      ["desolad",2],["destruido",2],["destruye",2],
      ["destrozado",2],["destrozos",2],["destrozando",2],
      ["herida",2],["heridas",2],
      ["aferrado",2],["prisionero",2],["prisioneros",2],
      ["desangrando",2],["desangr",2],
      ["impotenci",2],["hundirse",2],["colaps",2],["roto",2],["rotos",2],
      ["fracaso",2],["fraccionado",2],
      ["desamor",3],["perdición",2],
      ["carcome",2],["corrompido",2],["arruinando",2],
      ["moribunda",2],["sollozos",2],["solloz",2]
    ],
    ctx: [
      ["oscuridad",1],["sombra",1],["tiniebla",1],["noche",1],["gris",2],
      ["frío",1],["helado",1],["ceniza",2],["cenizas",2],["ruina",2],["ruinas",2],["escombros",2],
      ["olvid",1],["nostalgi",1],["ausenci",1],["abandon",1],["bruma",1],
      ["niebla",1],["silencio",1],["inerte",1],["yace",1],["deshagan",1],
      ["difunto",2],["sepulcro",1],["llaga",1],["sangre",1],["sangraban",2],
      ["paraliz",1],["paralizado",2],
      ["añoran",1],["perdido",1],["solitari",1],["caído",1],["derrumb",2],["derrumba",2],
      ["pesadilla",2],["pesadillas",2],
      ["apagad",1],["apagó",1],["cansancio",1],["cansado",1],
      ["culpa",1],["arrepient",1],
      ["echarcado",1],["hoguera",1],["queman",1],["quemaba",1],
      ["recuerdos",1],["memorias",1],
      ["conmigo",1],["errática",1],["infortunio",1],["desdichas",2],
      ["desgarr",2],["agrietando",1],
      ["existo",1],["revés",1],["frustrados",1],
      ["incumbe",1],["duro",1]
    ]
  },
  anger: {
    core: [
      ["rabia",3],["odio",3],["furia",3],["furioso",3],["rabioso",2],
      ["rencor",3],["venganza",3],["cólera",2],["iracund",2],["indignación",3],
      ["desprecio",3],["maldición",2],["injusticia",3],["frustración",2],
      ["opresión",2],["hipocresía",3],["estrangular",2],["amargado",2],["amargada",2],
      ["insignificante",2],["irrelevante",2]
    ],
    ctx: [
      ["grit",1],["gritos",1],["chilla",1],["explosi",1],["destruye",1],["destruir",1],
      ["devasta",1],["golpe",1],["violenci",1],["traición",2],["traiciona",2],
      ["engaño",2],["engañaste",2],["mentira",2],["miento",1],
      ["rebell",1],["revolt",1],["maldice",1],
      ["maldigo",2],["insulto",2],["insultos",2],["ataque",1],["agresión",1],
      ["envidi",2],["envidia",2],["celos",2],
      ["preso",1],["control",1],["controlados",2],
      ["sistem",2],["sistema",2],["atrapado",1],["rebelde",1],
      ["estrangul",1],["burla",1],["veneno",2],["envenenada",2],["maldad",2],["blasfem",1],
      ["cobarde",2],["rumores",1],["falsos",1],
      ["ofensivos",1],["apestan",1],
      ["mediocre",1],["clones",1],["uniformes",1],
      ["sometimiento",2],["adoctrinar",2],["adoctrinaste",2],
      ["marionetista",2],["espiral",1],["conflictos",1],
      ["rutina",1],["vicio",1],
      ["codiciosos",1],["ricos",1],["poderosos",1],
      ["fotogénicos",1],["fantasma",1],
      ["saciad",1],["consumas",1]
    ]
  },
  fear: {
    core: [
      ["miedo",3],["terror",3],["pánico",3],["horror",3],["espanto",3],
      ["pavor",2],["temor",2],["alucinac",2],["fobia",2],
      ["vértigo",2],["abismo",3],
      ["rendirse",2],["rendir",2]
    ],
    ctx: [
      ["tembl",1],["temblorosas",2],["temblando",2],
      ["escalofr",1],["amenaza",1],["peligro",1],["siniestro",1],
      ["paraliz",1],["atrapado",1],["acorrala",1],["acecha",1],["vigilado",1],
      ["acoso",1],["huye",1],["escapa",1],["indefenso",1],["vulnerabl",2],
      ["delirio",1],["locura",1],["enloquec",1],["zozobra",1],["sobresalt",1],
      ["precipic",1],["ahogar",2],["ahogó",2],
      ["tortura",2],["torturando",2],["agonía",2],
      ["tóxico",1],["clemencia",1],
      ["sofoco",1],["agobio",1],
      ["parásito",2],["insomnio",1],
      ["puas",1],["barranco",1],["barrancos",1],
      ["desastre",1],["destruidos",1],
      ["incertidumbre",1],["inquieta",1],
      ["caer",1],["caída",1]
    ]
  },
  love: {
    core: [
      ["amor",3],["ternura",2],["cariño",3],["enamorad",3],["adorar",2],
      ["pasión",2],["devoción",2],
      ["quería",2],["querías",2],["quiero",2],["querer",2],["querido",2],
      ["corazón",2],["dedicar",1],["gustar",1],["gustabas",2],
      ["idolatr",2],["comprometerse",2]
    ],
    ctx: [
      ["beso",2],["besos",2],["besabas",2],
      ["abrazo",2],["abrazos",2],["brazos",1],
      ["dulzura",1],["íntimo",1],["susurro",1],
      ["suspiro",1],["latido",1],["labio",1],["labios",1],
      ["mirada",1],["piel",1],
      ["juntos",1],["contigo",2],["conmigo",1],
      ["deseo",1],["anhelo",1],["fascinac",1],
      ["seducción",1],["tierno",1],["tierna",1],
      ["alma",1],["compañ",1],["bonito",1],["hermoso",1],["universo",1],
      ["compromiso",1],["milagrosa",2],["salvación",1],
      ["pareja",1],["relación",1],["nuestro",1],["nuestra",1],
      ["cama",1],["olor",1],["pensarte",2],["llamarte",1],
      ["sentimientos",1],["amar",2],
      ["pilar",1],["guía",1],["eternamente",1],
      ["confianza",1],["lado",1],["rodeándome",1],
      ["mía",1],["tuyo",1],["tuya",1],
      ["curiosidad",1],["inexplorado",1],["investigar",1],
      ["innato",1],["nítido",1],
      ["pensarte",2],["llamarte",1],["echarte de menos",2]
    ]
  },
  hope: {
    core: [
      ["esperanza",3],["ilusión",3],["ilusionad",2],["renacer",3],["resurgi",2],
      ["amanecer",3],["horizonte",2],["redención",2],["liberación",2],
      ["superación",3],["sanar",3],["surgir",2],["levantarse",2],["mejorar",2],
      ["aguanta",2],["resucitar",2]
    ],
    ctx: [
      ["sueño",1],["soñar",1],["alba",1],["aurora",1],["futuro",2],
      ["porvenir",1],["florecer",1],["semilla",1],["sembrar",1],["crecer",1],
      ["avanzar",1],["transformar",1],["renovar",1],["construir",1],["persever",1],
      ["valentía",2],["coraje",2],["fortaleza",2],["calma",2],["sereno",1],
      ["paz",2],["tranquil",1],["claridad",2],["salir",1],["resistir",1],
      ["tormenta",1],["después",1],["lograr",1],["alcanzar",1],
      ["camino",1],["faro",1],["destell",1],["mañana",1],["cosecha",1],
      ["esforzado",1],["cambiar",1],["cambié",1],
      ["descubrirás",1],["descansar",1],["cielo se abrirá",2],
      ["reconstruido",2],["recuperar",1],["recuperando",1],
      ["arriesgar",1],["arriesgaron",1],
      ["huella",1],["ensueño",1],
      ["propósito",1],["sentido",1],
      ["inquebrantable",1],["bondad",1],
      ["oportunidad",1],["despertar",1],["despertado",1],
      ["lograrlo",1],["habilidades",1]
    ]
  }
};

// ── Emotion detection v3: precision-trained on real Spanish SONG corpus ──
// Calibrated against 6 thematic categories from the actual song corpus:
// amor (Me da Curiosidad), desamor (El Tambor, Tu Teléfono, Cara Envenenada,
// La Mentira que he Vivido, Una Hoguera, El Mundo es Gris, Extraño, Qué quieres ver),
// oscuridad / superación (Tu Paz, Hasta la Luna, Puente de Madera, Negro y Blanco,
// Colina de Infarto), reflexión personal (Todo con tan Poco, Mirando a las Estrellas),
// crítica social (Todos Clones, Consejo de un Genio, Imperio Roto).
// Song-specific traits: repetición de estribillo, lenguaje coloquial, imágenes
// cotidianas (cama, teléfono, fotos, hoguera), crítica sistémica directa.
const SONG_EMOTION_DEFS = {
  joy: {
    core: [
      ["alegr",3],["feliz",3],["felicidad",3],["gozo",3],["dicha",3],
      ["eufori",3],["júbilo",3],["regocij",2],["contento",2],
      ["risa",2],["sonrisa",2],["sonríe",2],
      ["triunfo",2],["triunfar",2],["victori",2],["éxito",2],
      ["prosperidad",2],["respetado",2]
    ],
    ctx: [
      ["celebr",1],["fiesta",1],["baile",1],["brillo",2],["brillar",1],
      ["iluminar",2],["luminoso",1],["disfru",1],["libre",1],["libertad",1],
      ["vuelo",1],["volar",1],["cima",2],["cumbre",1],["legado",2],
      ["lograr",1],["alcanzar",1],["construir",1],["animado",1],
      ["don",1],["vocación",1],["divierto",1],["provecho",1],
      ["provecho",1],["esplendor",1],["radiante",1],
      ["hasta la luna",2],["colina",1],["fama",1],
      ["inmortali",2],["cometido",2],["huella",2],
      ["explotar",1],["elevarme",1],["dejar rastro",2],
      ["celebrar",1],["motivos para celebrar",2]
    ]
  },
  sadness: {
    core: [
      ["trist",3],["melancol",3],["llanto",3],["lágrim",3],["llor",2],
      ["dolor",3],["sufrim",3],["sufrir",2],["sufre",2],["sufriendo",2],
      ["pena",2],["soledad",2],["vacío",2],["vacía",2],
      ["agoniz",3],["desespero",3],["desespera",3],["desesperación",3],
      ["angustia",2],["angustiad",2],
      ["lament",2],["pérdida",2],["muert",2],["morí",2],["morir",2],
      ["desolad",2],["destruido",2],["destruye",2],
      ["destrozado",2],["destrozar",2],["destrozando",2],
      ["herida",2],["heridas",2],
      ["aferrado",2],["prisionero",2],
      ["desangrando",2],["desangr",2],
      ["hundirse",2],["colaps",2],["roto",2],
      ["fracaso",2],["desamor",3],["perdición",2],
      ["corrompido",2],["arruinando",2],
      ["sollozos",2],["solloz",2],
      ["moribunda",2],["carcome",2],
      ["llorarte",3],["olvidarte",2],["olvidar",2],
      ["me dejaste",3],["te fuiste",3],["me abandonaste",3],
      ["corazón en la palma",3],["nudillos empapados",3],
      ["pecho oprimido",2],["en la cama sin poder",3],
      ["del revés",2],["mundo del revés",2],
      ["odiarme",2],["sabotearme",1],
      ["impotenci",2],["no soy bueno",2],
      ["ya no vivo",3],["solo existo",3],["ganas de vivir",2],
      ["agonizan",2]
    ],
    ctx: [
      ["oscuridad",1],["sombra",1],["noche",1],["gris",2],
      ["frío",1],["ceniza",2],["cenizas",2],["ruina",2],["escombros",2],
      ["olvid",1],["nostalgi",1],["ausenci",1],["abandon",1],
      ["silencio",1],["yace",1],
      ["sangre",1],["paraliz",1],
      ["perdido",1],["solitari",1],["caído",1],["derrumb",2],
      ["pesadilla",2],["pesadillas",2],
      ["apagad",1],["apagó",1],["cansancio",1],["cansado",1],
      ["culpa",1],["arrepient",1],
      ["hoguera",1],["queman",1],["fotos en una hoguera",2],
      ["recuerdos",1],["memorias",1],
      ["errática",1],["frustrados",1],
      ["desgarr",2],["existo",1],
      ["alcohol",1],["ahogar",2],
      ["no sé si podré seguir",3],["no puedo concentrarme",2],
      ["miro mucho a la nada",3],["a ver si no despierto",3],
      ["mi corazón poco a poco se va desangrando",3],
      ["mi luz se ha apagado",3],["mundo solo es gris",3],
      ["contando ovejas",2],["pensamientos en rejas",2],
      ["perder la cordura",2],["retomar el ritmo",2],
      ["mi alma ya está al borde",3],
      ["nudillos",1],["cama solitaria",2]
    ]
  },
  anger: {
    core: [
      ["rabia",3],["odio",3],["furia",3],["furioso",3],["rabioso",2],
      ["rencor",3],["venganza",3],["cólera",2],["indignación",3],
      ["desprecio",3],["maldición",2],["injusticia",3],["frustración",2],
      ["opresión",2],["hipocresía",3],["amargado",2],
      ["insignificante",2],["irrelevante",2],
      ["maldigo",2],["maldad",2],["pecado",2],
      ["engañaste",3],["cara envenenada",3],["envenenada",2],["veneno",2],
      ["me negado",2],["siempre me has negado",3],
      ["no sentías nada",3],["nunca nada por mi has sentido",3],
      ["te mereces a alguien que te haga sufrir",3],
      ["te destroce el corazón",3],
      ["saciado tu sed",2],["que le consumas",2],
      ["nunca me vas a dejar en paz",3],
      ["estrangular",2],["reventarlas",2]
    ],
    ctx: [
      ["grit",1],["gritos",1],["destruye",1],["destruir",1],
      ["traición",2],["traiciona",2],
      ["engaño",2],["mentira",2],["mentiras",2],
      ["maldice",1],["insulto",2],["insultos",2],
      ["envidi",2],["envidia",2],["celos",2],
      ["preso",1],["control",1],["controlados",2],
      ["sistem",2],["sistema",2],["atrapado",1],
      ["estrangul",1],["cobarde",1],["rumores",1],
      ["mediocre",1],["clones",1],["uniforme",1],
      ["sometimiento",2],["adoctrinaste",2],
      ["marionetista",2],["espiral",1],["conflictos",1],
      ["rutina",1],["vicio",1],
      ["codiciosos",1],["ricos",1],["poderosos",1],
      ["fantasma",1],["saciad",1],["consumas",1],
      ["indecentes",2],["asiente sin saber",2],
      ["todo mascado",2],["todos clones",2],
      ["objetivo mediocre",2],["detrás de la pantalla",1],
      ["enemigos",1],["se odian",2],["odian en secreto",2],
      ["libertad a cambio de dinero",2],["más sometimiento",2],
      ["disculpas sin verdad",2],["gracias sin gracia",2],
      ["no sentías nada",2],["pintaste",1],
      ["no fue justo",2],["arruinaste",2]
    ]
  },
  fear: {
    core: [
      ["miedo",3],["terror",3],["pánico",3],["horror",3],["espanto",3],
      ["pavor",2],["temor",2],["fobia",2],
      ["vértigo",2],["abismo",3],
      ["rendirse",2],["rendir",2],
      ["miedo a fracasar",3],["miedo al éxito",2],
      ["miedo de no saber amar",3],["miedo de que saliera mal",3],
      ["miedo escénico",2]
    ],
    ctx: [
      ["tembl",1],["tembloroso",2],["temblando",2],
      ["amenaza",1],["peligro",1],
      ["paraliz",1],["atrapado",1],["acecha",1],
      ["acoso",1],["indefenso",1],
      ["delirio",1],["locura",1],["zozobra",1],
      ["ahogar",2],["ahogó",2],
      ["tortura",2],["torturando",2],["agonía",2],
      ["tóxico",1],["sofoco",1],["agobio",1],
      ["insomnio",1],["desastre",1],
      ["incertidumbre",1],["inquieta",1],
      ["caer",1],["caída",1],
      ["pánico",2],["parásito",2],
      ["sin propósito",2],["te crees parásito",3],
      ["final trágico",2],["destino peor",2],
      ["dudo de mi estado",2],["si esto vale de algo",2],
      ["siempre tendré algo de miedo",2],
      ["no sé qué hacer",2],["no sé si podré",2]
    ]
  },
  love: {
    core: [
      ["amor",3],["ternura",2],["cariño",3],["enamorad",3],["adorar",2],
      ["pasión",2],["devoción",2],
      ["quería",2],["querías",2],["quiero",2],["querer",2],["querido",2],
      ["corazón",2],["gustar",1],["gustabas",2],
      ["idolatr",2],["te amaba",3],["si te quería",3],
      ["fueras mía",3],["quería que fueras mía",3],
      ["era amor verdadero",3],["amor verdadero",3],
      ["pensarte",2],["llamarte",2],
      ["guardo tu teléfono",2],["teléfono",1],
      ["toda mi vida",1],["todos los días",1],
      ["sin excepción",1]
    ],
    ctx: [
      ["beso",2],["besos",2],["besabas",2],
      ["abrazo",2],["abrazos",2],["brazos",1],
      ["dulzura",1],["íntimo",1],["susurro",1],
      ["suspiro",1],["latido",1],["labios",1],
      ["mirada",1],["piel",1],
      ["juntos",1],["contigo",2],["conmigo",1],
      ["deseo",1],["anhelo",1],
      ["tierno",1],["tierna",1],
      ["alma",1],["compañ",1],["bonito",1],
      ["compromiso",1],["salvación",1],
      ["pareja",1],["relación",1],["nuestro",1],["nuestra",1],
      ["cama",1],["olor",1],
      ["sentimientos",1],["amar",2],
      ["pilar",1],["guía",1],
      ["confianza",1],["lado",1],["rodeándome",1],
      ["curiosidad",1],["inexplorado",1],["investigar",1],
      ["nítido",1],["innato",1],
      ["hablábamos",1],["momentos que pasamos",2],
      ["todo era infinito",2],["todo era nítido",2],
      ["te vi pasar",2],["desde que te vi",2],
      ["motivos para hacer una canción",2],
      ["solo de ti",2],["de nosotros",1],
      ["futuro idílico",2],["paisaje bonito",1],
      ["siempre unidos",2],["por siempre jamás",2]
    ]
  },
  hope: {
    core: [
      ["esperanza",3],["ilusión",3],["ilusionad",2],["renacer",3],["resurgi",2],
      ["amanecer",3],["horizonte",2],["redención",2],["liberación",2],
      ["superación",3],["sanar",3],["surgir",2],["levantarse",2],["mejorar",2],
      ["aguanta",3],["resucitar",2],
      ["todo está por llegar",3],["todo llegará",2],
      ["no me rindo",3],["no me rindo jamás",3],
      ["un rayo de luz",3],["brillo natural",2],
      ["reconstruido",2],["reconstruido mi prosperidad",3],
      ["destino al fin",2],["después de todo",2],
      ["elevarme",2],["hasta la luna",2],
      ["nacido para",2],["cometido en esta vida",2],
      ["dejar huella",2]
    ],
    ctx: [
      ["sueño",1],["soñar",1],["alba",1],["futuro",2],
      ["florecer",1],["semilla",1],["crecer",1],
      ["avanzar",1],["transformar",1],["renovar",1],["construir",1],
      ["valentía",2],["coraje",2],["fortaleza",2],["calma",2],["sereno",1],
      ["paz",2],["tranquil",1],["claridad",2],["salir",1],["resistir",1],
      ["tormenta",1],["después",1],["lograr",1],["alcanzar",1],
      ["camino",1],["faro",1],["mañana",1],
      ["esforzado",1],["cambiar",1],
      ["recuperar",1],["recuperando",1],
      ["arriesgar",1],["arriesgaron",1],
      ["huella",1],["ensueño",1],
      ["propósito",1],["sentido",1],
      ["oportunidad",1],["despertar",1],
      ["solo aguanta",2],["queda poco para descansar",2],
      ["buena gente de verdad",2],
      ["lo negro se verá con claridad",2],
      ["primero es la tormenta",2],["luego el cielo se abrirá",3],
      ["no tienes porqué llorar",2],["solo queda un paso más",2],
      ["trabajas en tu mismo",1],["siendo cada vez mejor",2],
      ["mi brillo está a punto",2],["iluminar el mundo",2],
      ["miedo al éxito ya no me asusta",3],
      ["llegaré sin ningún tipo de duda",3],
      ["un milagro más",2],["aprovechar",1],
      ["no quiero ver mi vida pasar",2],
      ["no te vayas todavía",2],["aún no termina la partida",2]
    ]
  }
};


// ── Emotion detection: trained on real Spanish POETRY corpus ──
// Calibrated against 6 thematic sections: Desamor, Amor, Oscuridad,
// Luz en la Tormenta, Superación y Ambición, Crítica Social.
// Poetry-specific traits: literary vocabulary, verse-libre rhythm,
// metaphorical imagery (ruinas, faro, olimpo, abismo), suicidal
// tonality (resignación terminal ≠ esperanza), social critique.
const POETRY_EMOTION_DEFS = {
  joy: {
    core: [
      ["alegr",3],["feliz",3],["felicidad",3],["gozo",3],["dicha",3],
      ["eufori",3],["júbilo",3],["regocij",2],["contento",2],
      ["risa",2],["sonrisa",2],["sonríe",2],
      ["triunfo",2],["triunfar",2],["victori",2],["éxito",2],
      ["prosperidad",2],["respetado",2],["ganado",2],
      ["olimpo",3],["paraíso",2],["celebrar",2]
    ],
    ctx: [
      ["celebr",1],["fiesta",1],["brillo",2],["brillar",1],
      ["iluminar",2],["luminoso",1],["disfru",1],["libre",1],["libertad",1],
      ["cima",2],["cumbre",1],["legado",2],["lograr",1],["alcanzar",1],
      ["don",1],["vocación",1],["divierto",1],["provecho",1],
      ["esplendor",1],["radiante",1],["fama",1],["inmortali",2],
      ["cometido",2],["huella",2],["explotar",1],["elevarme",1],
      ["estrella",1],["destello",2],["faro",1],
      ["respetado",2],["permiso",1],["bajan la cabeza",2],
      ["ya he ganado",3],["ahora estoy en el olimpo",3],
      ["opinión no se pasa por alto",2]
    ]
  },
  sadness: {
    core: [
      ["trist",3],["melancol",3],["llanto",3],["lágrim",3],["llor",2],
      ["dolor",3],["sufrim",3],["sufrir",2],["sufre",2],["sufriendo",2],
      ["pena",2],["soledad",2],["vacío",2],["vacía",2],
      ["agoniz",3],["desespero",3],["desesperación",3],
      ["angustia",2],["lament",2],["pérdida",2],
      ["muert",2],["morí",2],["morir",2],
      ["desolad",2],["destruido",2],["destruye",2],
      ["destrozado",2],["destrozar",2],
      ["herida",2],["heridas",2],
      ["aferrado",2],["prisionero",2],
      ["desangrando",2],["desangr",2],
      ["hundirse",2],["colaps",2],["roto",2],
      ["fracaso",2],["desamor",3],["perdición",2],
      ["corrompido",2],["arruinando",2],
      ["sollozos",2],["moribunda",2],["carcome",2],
      ["yace",2],["inerte",2],["impotenci",2],["carente",2],
      ["ruinas",2],["escombros",2],["destruidos",2],
      ["difunto",2],["agoniza",2],
      ["llanto",2],["lloros",1],["llorarte",2],
      ["olvidarte",2],["me dejaste",3],["te fuiste",2],
      ["me abandonaste",2],["del revés",2],
      ["odiarme",2],["ya no vivo",3],["solo existo",2],
      ["ya no voy a sonreír",2],["no paro de pensarte",2]
    ],
    ctx: [
      ["oscuridad",1],["sombra",1],["noche",1],["gris",2],
      ["frío",1],["ceniza",2],["cenizas",2],["ruina",2],
      ["olvid",1],["nostalgi",1],["ausenci",1],["abandon",1],
      ["silencio",1],["sangre",1],["paraliz",1],
      ["perdido",1],["solitari",1],["caído",1],["derrumb",2],
      ["pesadilla",2],["pesadillas",2],
      ["apagad",1],["cansancio",1],["cansado",1],
      ["culpa",1],["arrepient",1],
      ["recuerdos",1],["memorias",1],
      ["frustrados",1],["desgarr",2],
      ["alcohol",1],["ahogar",2],
      ["mi luz se ha apagado",3],["mundo solo es gris",2],
      ["nudillos",1],["cama solitaria",2],
      ["encharcado",1],["moribunda",1],
      ["impotencia",2],["mente colapsada",2],
      ["carente de claridad",2],["corazón vacío",2],
      ["no sé si podré seguir con la mía",3],
      ["no sé qué habré hecho mal",2],
      ["lo único que me quita el dolor",2],
      ["pensamientos me están torturando",2],
      ["recuerdos ahora son pesadillas",2]
    ]
  },
  // ── Subcategoría: tonalidad suicida (resignación terminal) ──
  // Vocabulario específico de poemas como Un Día Más, Post Mortem, Abismo, Tu Paz.
  // Se mapea a tristeza con peso muy alto para que no se confunda con esperanza.
  anger: {
    core: [
      ["rabia",3],["odio",3],["furia",3],["furioso",3],["rabioso",2],
      ["rencor",3],["venganza",3],["cólera",2],["indignación",3],
      ["desprecio",3],["maldición",2],["injusticia",3],["frustración",2],
      ["opresión",2],["hipocresía",3],["amargado",2],["amargada",2],
      ["insignificante",2],["irrelevante",2],
      ["maldigo",2],["maldad",2],["pecado",2],
      ["engañaste",3],["cara envenenada",2],["veneno",2],
      ["me negado",2],["no sentías nada",2],
      ["te mereces a alguien que te haga sufrir",3],
      ["estrangular",2],["reverendo destino",3],
      ["por qué fui el elegido",3],["siempre acabas conmigo",3],
      ["porqué siempre acabas conmigo",3],
      ["me derrumbas",2],["indecentes",2],
      ["marionetista",2],["poderosos",2],["codiciosos",2]
    ],
    ctx: [
      ["grit",1],["gritos",1],["destruye",1],["destruir",1],
      ["traición",2],["traiciona",2],
      ["engaño",2],["mentira",2],["mentiras",2],
      ["maldice",1],["insulto",2],["cobarde",1],
      ["envidi",2],["envidia",2],["celos",2],
      ["preso",1],["control",1],["controlados",2],
      ["sistem",2],["atrapado",1],
      ["mediocre",1],["clones",1],["uniforme",1],
      ["sometimiento",2],["adoctrinar",2],
      ["espiral",1],["conflictos",1],
      ["rutina",1],["vicio",1],["ricos",1],
      ["fantasma",1],["saciad",1],
      ["asiente sin saber",2],["todos clones",2],
      ["objetivo mediocre",2],["enemigos",1],
      ["libertad a cambio de dinero",2],
      ["disculpas sin verdad",2],
      ["no fue justo",2],["arruinaste",2],
      ["infortunio",2],["falsos ilusiones",2],
      ["senda de desastres",2],["de dolor y torturas",2],
      ["que quieres ver",2],["para que quieres volver",2],
      ["no has saciado tu sed",2],["ve a por otro",2],
      ["ruinas de mucho antes",2],["para tirarlas más alto",2],
      ["obra de arte en un alma arruinando",2]
    ]
  },
  fear: {
    core: [
      ["miedo",3],["terror",3],["pánico",3],["horror",3],["espanto",3],
      ["pavor",2],["temor",2],["fobia",2],
      ["vértigo",2],["abismo",3],
      ["rendirse",2],["rendir",2],
      ["miedo a fracasar",3],["miedo al éxito",2],
      ["miedo de no saber amar",3],
      ["pesadilla",2],["pesadillas",2]
    ],
    ctx: [
      ["tembl",1],["tembloroso",2],["temblando",2],
      ["amenaza",1],["peligro",1],
      ["paraliz",1],["atrapado",1],["acecha",1],
      ["indefenso",1],["vulnerabl",2],
      ["delirio",1],["locura",1],["enloquec",1],["zozobra",1],
      ["ahogar",2],["ahogó",2],
      ["tortura",2],["torturando",2],["agonía",2],
      ["sofoco",1],["agobio",1],["insomnio",1],
      ["desastre",1],["incertidumbre",1],
      ["caer",1],["caída",1],["precipic",1],
      ["parásito",2],["sin propósito",2],
      ["final trágico",2],["no sé si podré",2],
      ["no confío en mí mismo",3],["ser feliz nunca fue mi estilo",3],
      ["gozoso nunca será mi destino",3],
      ["no tengo a nadie para que me salve",3],
      ["ni siquiera yo estoy conmigo",3],
      ["todo se derrumba",2],["derrumba poco a poco",2],
      ["escaleras de puas",2],["nudillos ahora son piedras",2],
      ["piernas que ya no aguantan",2],
      ["cucharas ahora pesan",2],["risas imposibles",2]
    ]
  },
  love: {
    core: [
      ["amor",3],["ternura",2],["cariño",3],["enamorad",3],["adorar",2],
      ["pasión",2],["devoción",2],
      ["quería",2],["querías",2],["quiero",2],["querer",2],["querido",2],
      ["corazón",2],["gustar",1],["gustabas",2],
      ["idolatr",2],["te amaba",3],
      ["fueras mía",2],["amor verdadero",2],
      ["pensarte",2],["llamarte",2],
      ["toda mi vida",1],["todos los días",1]
    ],
    ctx: [
      ["beso",2],["besos",2],["besabas",2],
      ["abrazo",2],["abrazos",2],["brazos",1],
      ["dulzura",1],["íntimo",1],["susurro",1],
      ["suspiro",1],["latido",1],["labios",1],
      ["mirada",1],["piel",1],
      ["juntos",1],["contigo",2],["conmigo",1],
      ["deseo",1],["anhelo",1],
      ["tierno",1],["tierna",1],
      ["alma",1],["compañ",1],["bonito",1],
      ["compromiso",1],["pareja",1],["relación",1],
      ["nuestro",1],["nuestra",1],
      ["sentimientos",1],["amar",2],
      ["pilar",1],["confianza",1],["lado",1],
      ["innato",1],["inexplorado",1],
      ["desde que te vi pasar",2],["te vi pasar",2],
      ["nunca lo he experimentado",2],
      ["rodeándome",1],["afrontar mi oscuridad",2],
      ["no soy bueno",1],["lo que lograremos",1],
      ["hablábamos siempre",1],["todo era infinito",2],
      ["todo era nítido",2],["olor ya lo dejaste",2],
      ["en mi cama y en todas partes",2],
      ["guardo tu teléfono",2],
      ["rosa moribunda",1],["regalo",1],["flores",1],
      ["quería que fueras mi salvación",2],
      ["futuro idílico",2],["solo tú y yo",2]
    ]
  },
  hope: {
    core: [
      ["esperanza",3],["ilusión",3],["ilusionad",2],["renacer",3],["resurgi",2],
      ["amanecer",3],["horizonte",2],["redención",2],["liberación",2],
      ["superación",3],["sanar",3],["surgir",2],["levantarse",2],["mejorar",2],
      ["aguanta",3],
      ["no me rindo",3],["no me rindo jamás",3],
      ["un rayo de luz",3],["brillo natural",2],
      ["reconstruido",2],["destino al fin",2],
      ["elevarme",2],["hasta la luna",2],
      ["nacido para",2],["cometido en esta vida",2],
      ["dejar huella",2],["todo está por llegar",2]
    ],
    ctx: [
      ["sueño",1],["soñar",1],["alba",1],["futuro",2],
      ["florecer",1],["crecer",1],
      ["avanzar",1],["transformar",1],["renovar",1],["construir",1],
      ["valentía",2],["coraje",2],["fortaleza",2],["calma",1],["sereno",1],
      ["tranquil",1],["claridad",2],["salir",1],["resistir",1],
      ["después",1],["lograr",1],["alcanzar",1],
      ["camino",1],["faro",1],["mañana",1],
      ["esforzado",1],["cambiar",1],["cambié",1],
      ["recuperar",1],["arriesgar",1],
      ["huella",1],["propósito",1],["sentido",1],
      ["oportunidad",1],["despertar",1],
      ["solo aguanta",2],["lo negro se verá con claridad",2],
      ["primero es la tormenta",2],["luego el cielo se abrirá",3],
      ["no tienes porqué llorar",2],["solo queda un paso más",2],
      ["aún no termina la partida",2],["no te vayas todavía",2],
      ["mi brillo está a punto",2],["iluminar el mundo",2],
      ["miedo al éxito ya no me asusta",2],
      ["llegaré sin ningún tipo de duda",2],
      ["un milagro más",2],["aprovechar",1],
      ["te esforzado en cambiar",2],["cambié para mejor",2],
      ["inquebrantable",1],["bondad",1],
      ["lograrlo",1],["habilidades",1],
      ["reconstruido mi prosperidad",3],
      ["mi destino en la vida",2],["construir un imperio",2],
      ["sentenciado a una vida de lujos",2]
    ]
  }
};

// ── Suicidal tonality override ──
// Words/phrases that signal terminal resignation. When detected at high density,
// they boost sadness score to prevent misclassification as "hope" or "calm".
const SUICIDAL_MARKERS = [
  "ya no quiero seguir vivo","no quiere seguir vivo",
  "no me arrepiento de lo que he hecho",
  "me arrepiento de lo que el hecho ha causado",
  "esperanza de que cese el sufrimiento","cese el sufrimiento",
  "no tengo miedo","tiene esperanza de que cese",
  "al fin ha conseguido la calma","la libertad que quería",
  "la tranquilidad que deseaba","ya ha acabado el día",
  "cuelga la nota","mirando con deseo el abismo",
  "ver el cielo nunca me había dado tanta paz",
  "sabía que el sufrimiento iba a parar",
  "sin embargo no volvería a ver a los que amo",
  "ojalá los míos sepan que por fin voy a descansar en paz",
  "menciona a familiares y amigos","diciendo que está sufriendo",
  "nota en la ventana","deseo el abismo que le esperaba",
  "las cucharas ahora pesan","risas imposibles inservibles",
  "mira hacia arriba para ver la luz","paraíso imposible de llegar",
  "empieza a escribir con lágrimas","agarra un boli",
  "volví donde todo empezó y acabó","donde mi alma por fin sanó",
  "no paraba de llorar","sostenía una foto mía",
  "tenía los nudillos rotos","las paredes sangraban",
  "con la nota que le había dejado","no tenía razón para estarlo",
  "ya me ha cansado de esperarte","te esperaré hasta que me vuelva loco"
];
// ── Emotion label translations ──
const EMOTION_LABELS = {
  joy: "Alegría", sadness: "Tristeza", anger: "Ira",
  fear: "Miedo", love: "Amor", hope: "Esperanza"
};
const EMOTION_COLORS = {
  joy: "#FFD700", sadness: "#6B8FFF", anger: "#FF4444",
  fear: "#9B59B6", love: "#FF6B8A", hope: "#4ECDC4"
};

// Custom word-boundary: char before/after must not be a-z or accented vowel
const ALPHA = "a-záéíóúüñ";
const wbRe = (stem) => {
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Multi-word stems get simple includes-style matching
  if (stem.includes(" ")) return new RegExp(escaped, "gi");
  // Short stems (≤4 chars) get strict boundaries; longer stems match as prefixes
  if (stem.length <= 4) return new RegExp(`(?<![${ALPHA}])${escaped}(?![${ALPHA}])`, "gi");
  return new RegExp(`(?<![${ALPHA}])${escaped}`, "gi");
};

// ── Negation v2: emotive-negation awareness ──
// "No quiero llorar" / "no quiero sonreír" = still emotive (desamor pattern)
// "No tienes porqué llorar" = empathetic (consolation pattern)
// "No tiene miedo" = true negation
// Strategy: detect "emotive negation" patterns and PRESERVE their emotion
const EMOTIVE_NEG_PATTERNS = [
  /\bno\s+quiero\s+/gi,
  /\bno\s+puedo\s+/gi,
  /\bno\s+quieres?\s+/gi,
  /\bno\s+tienes?\s+porqu[eé]\s+/gi,
  /\bno\s+debes?\s+/gi,
  /\bno\s+paro\s+de\s+/gi,
  /\bno\s+dej[aeo]\s+de\s+/gi,
  /\bno\s+sab[eé]\s+/gi,
  /\bno\s+s[eé]\s+(?:si|cómo|que|por)\s+/gi,
  /\bcansad[oa]\s+de\s+/gi,
  /\bmiedo\s+de\s+/gi,
];
const NEG_RE = /\b(no|sin|nunca|jamás|jamas|ni|tampoco|nada de)\s+(?:\w+\s+){0,2}/gi;

const buildNegZones = (text) => {
  const zones = [];
  // First: mark emotive negation zones (these PROTECT the emotion)
  const protectedZones = [];
  EMOTIVE_NEG_PATTERNS.forEach(pattern => {
    let em;
    const re = new RegExp(pattern.source, "gi");
    while ((em = re.exec(text)) !== null) {
      protectedZones.push([em.index, em.index + em[0].length + 40]);
    }
  });
  // Then: build standard negation zones, excluding protected ones
  let m;
  const re = new RegExp(NEG_RE.source, "gi");
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length - 1;
    const end = m.index + m[0].length + 30;
    const isProtected = protectedZones.some(([ps, pe]) => m.index >= ps && m.index <= pe);
    if (!isProtected) zones.push([start, end]);
  }
  return zones;
};
const isNegated = (pos, zones) => zones.some(([s, e]) => pos >= s && pos <= e);

const analyzeBlockEmotion = (text, emotionDefs = EMOTION_DEFS) => {
  const lower = text.toLowerCase();
  const negZones = buildNegZones(lower);
  const scores = {};
  let total = 0;
  let matchCount = 0;

  Object.entries(emotionDefs).forEach(([emotion, { core, ctx }]) => {
    let s = 0;
    [...core, ...ctx].forEach(([stem, weight]) => {
      const re = wbRe(stem);
      let m;
      while ((m = re.exec(lower)) !== null) {
        const neg = isNegated(m.index, negZones);
        s += neg ? -(weight * 0.4) : weight;
        matchCount++;
      }
    });
    scores[emotion] = Math.max(s, 0);
    total += scores[emotion];
  });

  // Logarithmic intensity: avoids saturation on long texts, sensitive on short ones
  // Base threshold scales with word count for fairer comparison across text lengths
  const wordCount = text.trim().split(/\s+/).filter(w => w).length;
  const baseThreshold = Math.max(6, Math.sqrt(wordCount) * 2.2);
  const intensity = Math.min(total / baseThreshold, 1);

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][0];
  const secondary = sorted[1] && sorted[1][1] > 0 ? sorted[1][0] : null;
  const dominantRatio = total > 0 ? sorted[0][1] / total : 0;

  const tensionRaw = (scores.anger || 0) + (scores.fear || 0) + (scores.sadness || 0);
  const affectiveRaw = (scores.love || 0) + (scores.joy || 0) + (scores.hope || 0);
  const tension   = Math.min(tensionRaw / Math.max(wordCount * 0.35, 1), 1);
  const affective = Math.min(affectiveRaw / Math.max(wordCount * 0.35, 1), 1);

  return {
    intensity: Math.max(intensity, 0.03),
    dominant, secondary, dominantRatio,
    scores, tension, affective, matchCount,
    wordCount
  };
};

const groupLinesByN = (text, n = 4) => {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length === 0) return [];
  const groups = [];
  for (let i = 0; i < lines.length; i += n) groups.push({ tag: null, text: lines.slice(i, i + n).join("\n") });
  return groups;
};

const analyzeEmotion = (text, isSong = false, isPoetryMode = false) => {
  if (!text.trim()) return [];
  let blocks;
  if (isSong) {
    const sb = splitSongBlocks(text);
    blocks = sb.length ? sb : text.split(/\n\s*\n/).filter(b => b.trim()).map(t => ({ tag: null, text: t }));
  } else {
    blocks = text.split(/\n\s*\n/).filter(b => b.trim()).map(t => ({ tag: null, text: t }));
  }
  // If only 1 block, try grouping by every 4 lines for better curve
  if (blocks.length <= 1) {
    const lineGroups = groupLinesByN(text, 4);
    if (lineGroups.length > 1) blocks = lineGroups;
  }
  // Final fallback: if still 1 block, split by every 2 lines
  if (blocks.length <= 1) {
    const lineGroups = groupLinesByN(text, 2);
    if (lineGroups.length > 1) blocks = lineGroups;
  }
  // Ultimate fallback: single-line text gets 1 block
  if (blocks.length === 0 && text.trim()) {
    blocks = [{ tag: null, text: text.trim() }];
  }
  const emotionDefs = isSong ? SONG_EMOTION_DEFS : (isPoetryMode ? POETRY_EMOTION_DEFS : EMOTION_DEFS);
  const data = blocks.map((b, i) => {
    const blockData = analyzeBlockEmotion(b.text, emotionDefs);
    // ── Suicidal tonality override ──
    // If the block contains suicidal markers, boost sadness score significantly
    // so terminal resignation is never misread as hope or calm.
    if (isPoetryMode || isSong) {
      const lower = b.text.toLowerCase();
      const suicidalHits = SUICIDAL_MARKERS.filter(m => lower.includes(m)).length;
      if (suicidalHits >= 2) {
        blockData.scores.sadness = (blockData.scores.sadness || 0) + suicidalHits * 4;
        blockData.scores.hope = Math.max(0, (blockData.scores.hope || 0) - suicidalHits * 3);
        // Recalculate dominant
        const entries = Object.entries(blockData.scores).sort((a,b) => b[1]-a[1]);
        blockData.dominant = entries[0][0];
        blockData.secondary = entries[1]?.[1] > 0 ? entries[1][0] : null;
      }
    }
    return { block: i, tag: b.tag, ...blockData, preview: b.text.trim().substring(0, 40) };
  });
  if (!data.length) return [];
  const avg = data.reduce((s, d) => s + d.intensity, 0) / data.length;
  const variance = data.reduce((s, d) => s + Math.pow(d.intensity - avg, 2), 0) / data.length;
  const stability = Math.max(0, 1 - Math.sqrt(variance) * 3);
  const diffs = data.slice(1).map((d, i) => Math.abs(d.intensity - data[i].intensity));
  const rhythm = diffs.length ? diffs.reduce((s, d) => s + d, 0) / diffs.length : 0;
  const maxTension = Math.max(...data.map(d => d.tension));
  const maxTensionIdx = data.findIndex(d => d.tension === maxTension);

  // ── Global emotion balance (across all blocks) ──
  const globalScores = {};
  Object.keys(EMOTION_DEFS).forEach(e => { globalScores[e] = data.reduce((s, d) => s + (d.scores[e] || 0), 0); });
  const globalTotal = Object.values(globalScores).reduce((s, v) => s + v, 0);
  const globalSorted = Object.entries(globalScores).sort((a, b) => b[1] - a[1]);
  const globalDominant = globalSorted[0]?.[0] || "neutral";
  const globalSecondary = globalSorted[1]?.[1] > 0 ? globalSorted[1][0] : null;
  const globalPcts = {};
  Object.entries(globalScores).forEach(([e, v]) => { globalPcts[e] = globalTotal > 0 ? v / globalTotal : 0; });

  // ── Emotional arc shape detection ──
  let arcLabel = "Neutro";
  if (data.length >= 3) {
    const first = data.slice(0, Math.ceil(data.length / 3));
    const mid = data.slice(Math.ceil(data.length / 3), Math.ceil(data.length * 2 / 3));
    const last = data.slice(Math.ceil(data.length * 2 / 3));
    const avgFirst = first.reduce((s, d) => s + d.intensity, 0) / first.length;
    const avgMid = mid.reduce((s, d) => s + d.intensity, 0) / mid.length;
    const avgLast = last.reduce((s, d) => s + d.intensity, 0) / last.length;

    if (avgMid > avgFirst * 1.15 && avgMid > avgLast * 1.15) arcLabel = "Arco clásico ◠";
    else if (avgLast > avgFirst * 1.2 && avgLast > avgMid * 1.1) arcLabel = "Crescendo ↗";
    else if (avgFirst > avgLast * 1.2 && avgFirst > avgMid * 1.1) arcLabel = "Decrescendo ↘";
    else if (avgFirst > avgMid * 1.15 && avgLast > avgMid * 1.15) arcLabel = "Valle ◡";
    else if (stability > 0.75) arcLabel = "Meseta ═";
    else if (rhythm > 0.15) arcLabel = "Ondulante ~";
    else arcLabel = "Transición →";
  } else if (data.length === 2) {
    arcLabel = data[1].intensity > data[0].intensity ? "Crescendo ↗" : data[0].intensity > data[1].intensity ? "Decrescendo ↘" : "Meseta ═";
  }

  // ── Emotional shift detection (where dominant emotion changes) ──
  const shifts = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i].dominant !== data[i-1].dominant) {
      shifts.push({ block: i, from: data[i-1].dominant, to: data[i].dominant });
    }
  }

  return data.map((d, i) => ({
    ...d, avgIntensity: avg, variance, stability, rhythm,
    isMaxTension: i === maxTensionIdx,
    globalDominant, globalSecondary, globalPcts, arcLabel, shifts,
    totalBlocks: data.length
  }));
};

const CLICHES = ["luz al final","mariposas en el estómago","como el viento","mar de lágrimas","corazón roto","alma gemela","contra viento y marea","noche oscura del alma","más allá","sin ti no soy nada","en lo más profundo","a flor de piel","perdido en tus ojos","camino sin retorno"];

// ── Clichés específicos de poesía (corpus real de 30 poemas) ──
// Expresiones que aparecen sobreutilizadas en el corpus poético:
// desamor, oscuridad, superación, crítica social, amor, apoyo.
const POETRY_CLICHES = [
  // Desamor / dolor
  "corazón roto","sin ti no soy nada","me dejaste con el corazón",
  "nunca volveré a amar","me rompiste el corazón",
  "el tiempo lo cura todo","pasar página","volver a empezar",
  "no puedo seguir con la mía","nunca fue mi intención",
  "a ti no te parece importar","te quería demasiado",
  "mis sentimientos hacia ti no eran de verdad",
  "nunca me has incomodado","me has hecho ver quién soy",
  // Oscuridad / sufrimiento
  "ruinas que una vez fueron","el corazón en la palma",
  "ya no confío en mí mismo","ser feliz nunca fue mi estilo",
  "mi alegría tiende a perderse","todo se derrumba poco a poco",
  "luz al final","un mundo mejor","la oscuridad",
  "un alma inquebrantable","al fin y al cabo",
  // Superación / ambición
  "no me rindo jamás","dejar huella al pisar",
  "nacido para triunfar","subir a la cima","llegar donde quiero",
  "la gente amargada","la vida sin el riesgo",
  "sentenciado a una vida de lujos","nunca se despistan",
  // Crítica social
  "libertad a cambio de dinero","todos somos iguales",
  "el sistema ya ganó","detrás de la pantalla",
  "objetivo mediocre","todos clones",
  // Amor
  "desde que te vi pasar","un deseo casi innato",
  "amor verdadero","mi salvación","mi pilar",
  "el universo entero","alma gemela"
];
// ── Clichés específicos de letras de canciones (corpus real) ──
// Detectados en: desamor urbano, amor adolescente, crítica social pop, superación.
const SONG_CLICHES = [
  "te guardo en el corazón","sin ti no soy nada","te necesito","eres mi todo",
  "me rompiste el corazón","corazón roto","no puedo vivir sin ti","volver a empezar",
  "el tiempo lo cura todo","pasar página","dar el cien por cien","luchar por mis sueños",
  "hasta el final","tú y yo contra el mundo","amor verdadero","eres mi luz",
  "eres mi salvación","mi mundo sin ti","nunca te olvidaré","amor de mi vida",
  "al final del día","seguir adelante","todo pasa por algo","lo que no te mata",
  "cada vez que respiro","hasta la luna","nuestro amor es especial",
  "siempre en mi mente","grabado en mi piel","te llevo en el alma",
  "el sistema nos tiene","no somos libres","todos somos iguales",
  "el dinero no lo es todo","vivir el momento","ser uno mismo",
  "quiero ser feliz","encontrarme a mí mismo","la vida sigue"
];
const detectCliches = (t, mode = "poetry") => {
  const l = t.toLowerCase();
  const list = mode === "song" ? SONG_CLICHES : mode === "poetry" ? POETRY_CLICHES : CLICHES;
  return list.filter(c => l.includes(c));
};

const detectRepetitions = (text, isSong = false) => {
  const allLines = text.split("\n").map(l => l.trim());
  const rawLines = allLines.filter(l => l.length > 0);
  const contentLines = rawLines.filter(l => !TAG_RE.test(l));

  // Build a set of lines that belong to chorus-tagged sections ([Estribillo], [Outro],
  // [Pre-estribillo]) so they are never flagged as accidental repetitions anywhere.
  const CHORUS_TAG_RE = /^(estribillo|outro|pre-estribillo)$/i;
  const chorusLineSet = new Set();
  let _inChorus = false;
  rawLines.forEach(l => {
    const _m = l.match(TAG_RE);
    if (_m) { _inChorus = CHORUS_TAG_RE.test(_m[1]); return; }
    if (_inChorus) chorusLineSet.add(l.toLowerCase().trim());
  });

  const normLines = contentLines
    .filter(l => !chorusLineSet.has(l.toLowerCase().trim()))
    .map(l => l.toLowerCase()).filter(l => l.length > 3);

  // ── Base: exact line repetitions ──
  const lineCounts = {};
  normLines.forEach(l => { lineCounts[l] = (lineCounts[l] || 0) + 1; });
  const lineReps = Object.entries(lineCounts).filter(([, c]) => c > 1).map(([line, count]) => ({ line, count, type: "line" }));
  // Poetry mode: run full block + anaphora analysis (no chorus logic)
  if (!isSong) {
    // For poetry, just return line-level reps + anaphora (no block/fuzzy/chorus)
    const norm_p = s => s.toLowerCase().replace(/[^a-záéíóúüñ\s]/gi, "").replace(/\s+/g, " ").trim();
    const anaMap_p = {};
    normLines.forEach(l => {
      const w = l.split(/\s+/);
      for (let len = Math.min(4, w.length); len >= 2; len--) {
        const ph = w.slice(0, len).join(" ");
        if (ph.length >= 6) { anaMap_p[ph] = (anaMap_p[ph] || 0) + 1; break; }
      }
    });
    let anaphoras_p = Object.entries(anaMap_p)
      .filter(([, c]) => c >= 3)
      .map(([line, count]) => ({ line, count, type: "anaphora" }));
    anaphoras_p = anaphoras_p.filter((a, i) =>
      !anaphoras_p.some((b, j) => j !== i && b.line.length > a.line.length && b.line.includes(a.line) && b.count >= a.count)
    );
    // Paragraph-level blocks in poetry (separated by blank lines)
    const poetryParas = [];
    let ppCur = [];
    normLines.forEach(l => {
      if (l.trim() === "") { if (ppCur.length) { poetryParas.push([...ppCur]); ppCur = []; } }
      else ppCur.push(l);
    });
    if (ppCur.length) poetryParas.push(ppCur);
    const paraFPs = {};
    poetryParas.forEach(p => {
      const fp = p.map(l => norm_p(l)).join("|");
      if (!paraFPs[fp]) paraFPs[fp] = { count: 0, lines: p };
      paraFPs[fp].count++;
    });
    const blockReps_p = Object.values(paraFPs)
      .filter(b => b.count >= 2)
      .map(b => ({ line: `"${b.lines[0]?.substring(0, 38)}…" (${b.lines.length} ln)`, count: b.count, type: "block", isChorus: false, lines: b.lines, exact: true }));
    const result_p = [...blockReps_p, ...lineReps, ...anaphoras_p.slice(0, 3)];
    result_p.chorusWordCount = 0;
    return result_p;
  }

  // ── Helpers ──
  const norm = s => s.toLowerCase().replace(/[^a-záéíóúüñ\s]/gi, "").replace(/\s+/g, " ").trim();
  const bigrams = s => { const b = []; for (let i = 0; i < s.length - 1; i++) b.push(s.slice(i, i + 2)); return b; };
  const dice = (a, b) => {
    if (a === b) return 1; if (!a || !b) return 0;
    const ba = bigrams(a), bb = bigrams(b);
    if (!ba.length || !bb.length) return 0;
    const freq = {};
    bb.forEach(x => { freq[x] = (freq[x] || 0) + 1; });
    let inter = 0;
    ba.forEach(x => { if (freq[x] > 0) { inter++; freq[x]--; } });
    return (2 * inter) / (ba.length + bb.length);
  };
  const sectFP = lines => lines.map(l => norm(l)).filter(l => l).join("|");
  const sectFlat = lines => lines.map(l => norm(l)).filter(l => l).join(" ");

  const hasTags = rawLines.some(l => TAG_RE.test(l));
  const blockReps = [];
  const allSections = [];

  // ═══ 1) Parse sections ═══
  if (hasTags) {
    let cur = { tag: null, lines: [] };
    rawLines.forEach(l => {
      const m = l.match(TAG_RE);
      if (m) {
        if (cur.lines.length) allSections.push({ tag: cur.tag, lines: [...cur.lines] });
        cur = { tag: m[1], lines: [] };
      } else cur.lines.push(l);
    });
    if (cur.lines.length) allSections.push({ tag: cur.tag, lines: [...cur.lines] });
  }

  // 1b) By blank lines (paragraphs) — always parse these
  const paragraphs = [];
  let pCur = [];
  allLines.forEach(l => {
    const trimmed = l.trim();
    if (TAG_RE.test(trimmed)) { if (pCur.length) { paragraphs.push([...pCur]); pCur = []; } return; }
    if (trimmed === "") { if (pCur.length) { paragraphs.push([...pCur]); pCur = []; } }
    else pCur.push(trimmed);
  });
  if (pCur.length) paragraphs.push([...pCur]);

  // 1c) Add sub-paragraphs from tagged sections that contain internal blank lines
  if (hasTags) {
    allSections.forEach(s => {
      // Split this section's lines by blank lines in the original text
      const subs = [];
      let subCur = [];
      // Find the original position of this section's first line
      s.lines.forEach((l, i) => {
        subCur.push(l);
        // Check if there's a blank line gap between this line and the next in the original text
        if (i < s.lines.length - 1) {
          const posThis = allLines.indexOf(l, allLines.indexOf(s.lines[0]));
          const posNext = allLines.indexOf(s.lines[i + 1], posThis + 1);
          if (posNext - posThis > 1) { // There's a gap (blank lines)
            subs.push([...subCur]);
            subCur = [];
          }
        }
      });
      if (subCur.length) subs.push(subCur);
      // Only add sub-paragraphs if the section was actually split
      if (subs.length >= 2) {
        subs.forEach(sub => allSections.push({ tag: s.tag, lines: sub, isSub: true }));
      }
    });
    // Also add standalone paragraphs that aren't already covered
    paragraphs.forEach(p => {
      const pFP = sectFP(p);
      if (!allSections.some(s => sectFP(s.lines) === pFP)) {
        allSections.push({ tag: null, lines: p });
      }
    });
  }

  if (!hasTags && paragraphs.length >= 2) {
    paragraphs.forEach(p => allSections.push({ tag: null, lines: p }));
  }

  // ═══ 2) Block matching: exact + fuzzy ═══
  const sKeys = allSections.map((s, i) => ({
    fp: sectFP(s.lines), flat: sectFlat(s.lines),
    tag: s.tag, lines: s.lines, idx: i, isSub: !!s.isSub
  })).filter(s => s.fp);

  const exactGroups = {};
  sKeys.forEach(s => { if (!exactGroups[s.fp]) exactGroups[s.fp] = []; exactGroups[s.fp].push(s); });
  const exactFPs = new Set();

  // Pre-pass: find the maximum repeat count to identify the most-repeated block (likely chorus)
  const maxExactCount = Math.max(0, ...Object.values(exactGroups).filter(g => g.length >= 2).map(g => g.length));

  Object.entries(exactGroups).forEach(([fp, group]) => {
    if (group.length < 2) return;
    exactFPs.add(fp);
    const tags = group.map(g => g.tag).filter(Boolean);
    const tag = tags[0] || null;
    // isChorus: tag explicitly says estribillo/outro/pre-estribillo,
    // OR block repeats ≥3 times (structural chorus behaviour)
    const isChorus = /estribillo|outro|pre-estribillo/i.test(tag || "")
      || group.length >= 3;
    const isSub = group.every(g => g.isSub);
    const label = tag ? `[${tag}]` : `"${group[0].lines[0]?.substring(0, 38)}…"`;
    blockReps.push({
      line: `${label} (${group[0].lines.length} ln)`,
      count: group.length, type: "block", tag, isChorus,
      lines: group[0].lines, exact: true, isSub
    });
  });

  // 2b) Fuzzy block pairs (≥88% similar, min 3 lines each, not both already in same exact group)
  const fuzzyDone = new Set();
  const fuzzyResults = [];
  for (let i = 0; i < sKeys.length; i++) {
    for (let j = i + 1; j < sKeys.length; j++) {
      if (sKeys[i].fp === sKeys[j].fp) continue;
      // Require at least 3 lines in each block to avoid short-verse false positives
      if (sKeys[i].lines.length < 3 || sKeys[j].lines.length < 3) continue;
      // Skip if line counts differ too much (>2× ratio = not a real variant)
      const lenRatio = Math.max(sKeys[i].lines.length, sKeys[j].lines.length) / Math.max(1, Math.min(sKeys[i].lines.length, sKeys[j].lines.length));
      if (lenRatio > 2) continue;
      const pk = [sKeys[i].fp, sKeys[j].fp].sort().join("|||");
      if (fuzzyDone.has(pk)) continue;
      const sim = dice(sKeys[i].flat, sKeys[j].flat);
      if (sim >= 0.88) {
        fuzzyDone.add(pk);
        const tagA = sKeys[i].tag, tagB = sKeys[j].tag;
        // isChorus for fuzzy: explicit tag match, OR one side is a known exact chorus block
        const tagIsChorus = /estribillo|outro|pre-estribillo/i.test(tagA || "") || /estribillo|outro|pre-estribillo/i.test(tagB || "");
        const aIsKnownChorus = blockReps.some(b => b.exact && b.isChorus && b.lines && sectFP(b.lines) === sKeys[i].fp);
        const bIsKnownChorus = blockReps.some(b => b.exact && b.isChorus && b.lines && sectFP(b.lines) === sKeys[j].fp);
        const lA = tagA ? `[${tagA}]` : `"${sKeys[i].lines[0]?.substring(0, 22)}…"`;
        const lB = tagB ? `[${tagB}]` : `"${sKeys[j].lines[0]?.substring(0, 22)}…"`;
        fuzzyResults.push({
          line: `${lA} ≈ ${lB} (${Math.round(sim * 100)}%)`,
          count: 2, type: "block", tag: tagA || tagB,
          isChorus: tagIsChorus || aIsKnownChorus || bIsKnownChorus, sim, lines: sKeys[i].lines
        });
      }
    }
  }
  // Keep only top 3 fuzzy matches by similarity
  fuzzyResults.sort((a, b) => b.sim - a.sim);
  fuzzyResults.slice(0, 3).forEach(f => blockReps.push(f));

  // ═══ 3) Consecutive run detection (fallback if no paragraphs/tags split) ═══
  if (allSections.length <= 1 && normLines.length > 4) {
    const normC = contentLines
      .filter(l => !chorusLineSet.has(l.toLowerCase().trim()))
      .map(l => norm(l));
    const posMap = {};
    normC.forEach((l, i) => { if (l.length > 2) { if (!posMap[l]) posMap[l] = []; posMap[l].push(i); } });
    const runBlocks = {};
    Object.values(posMap).filter(p => p.length >= 2).forEach(positions => {
      for (let a = 0; a < positions.length; a++) {
        for (let b = a + 1; b < positions.length; b++) {
          const sA = positions[a], sB = positions[b];
          if (sB - sA < 2) continue;
          let len = 1;
          while (sA + len < normC.length && sB + len < normC.length && sA + len < sB && normC[sA + len] === normC[sB + len]) len++;
          if (len >= 2) {
            const key = normC.slice(sA, sA + len).join("|");
            if (!runBlocks[key]) runBlocks[key] = { len, starts: new Set(), lines: contentLines.slice(sA, sA + len) };
            runBlocks[key].starts.add(sA);
            runBlocks[key].starts.add(sB);
          }
        }
      }
    });
    const runArr = Object.values(runBlocks).sort((a, b) => b.len - a.len);
    const covered = new Set();
    runArr.forEach(rb => {
      if (rb.starts.size < 2) return;
      const starts = [...rb.starts];
      if (starts.every(s => covered.has(s))) return;
      starts.forEach(s => { for (let k = 0; k < rb.len; k++) covered.add(s + k); });
      blockReps.push({
        line: `"${rb.lines[0]?.substring(0, 35)}…" (${rb.len} ln)`,
        count: rb.starts.size, type: "block", tag: null,
        isChorus: rb.starts.size >= 3, lines: rb.lines, exact: true
      });
    });
  }

  // ═══ 4) Leitmotiv: recurring opening pair across ≥3 sections, long lines only ══
  if (allSections.length >= 4) {
    const openings = {};
    allSections.forEach((s, i) => {
      if (s.lines.length < 2) return;
      const l0 = norm(s.lines[0]), l1 = norm(s.lines[1]);
      // Only count openings where both lines are substantial (not short filler)
      if (l0.length < 10 || l1.length < 10) return;
      const key = l0 + "|" + l1;
      if (!openings[key]) openings[key] = [];
      openings[key].push(i);
    });
    Object.values(openings).forEach(indices => {
      if (indices.length < 3) return;
      const s = allSections[indices[0]];
      const fp = sectFP(s.lines);
      if (exactFPs.has(fp)) return;
      blockReps.push({
        line: `"${s.lines[0].substring(0, 30)}…" leitmotiv`,
        count: indices.length, type: "block", tag: null,
        isChorus: false, lines: s.lines.slice(0, 2)
      });
    });
  }

  // ═══ 5) Chorus word count (only from exact repeated blocks, excluding sub-blocks) ═══
  let chorusWordCount = 0;
  blockReps.forEach(b => {
    if (b.lines && b.count > 1 && b.exact && !b.sim && !b.isSub) {
      const bw = b.lines.join(" ").trim().split(/\s+/).filter(w => w).length;
      chorusWordCount += bw * (b.count - 1);
    }
  });

  // ═══ 6) Line-level: near-dups, anaphora, phrases ═══
  const blockCovered = new Set();
  blockReps.forEach(b => { if (b.lines) b.lines.forEach(l => blockCovered.add(norm(l))); });

  const nearDups = [];
  const uLines = [...new Set(normLines)].filter(l => !blockCovered.has(norm(l)));
  for (let i = 0; i < uLines.length && i < 40; i++) {
    for (let j = i + 1; j < uLines.length && j < 40; j++) {
      const sim = dice(uLines[i], uLines[j]);
      if (sim >= 0.88 && sim < 1) nearDups.push({ line: `${uLines[i].substring(0, 28)} / ${uLines[j].substring(0, 28)}`, count: Math.round(sim * 100), type: "near", sim });
    }
  }
  nearDups.sort((a, b) => b.sim - a.sim);

  const anaMap = {};
  normLines.forEach(l => {
    const w = l.split(/\s+/);
    for (let len = Math.min(4, w.length); len >= 2; len--) {
      const ph = w.slice(0, len).join(" ");
      if (ph.length >= 6) { anaMap[ph] = (anaMap[ph] || 0) + 1; break; }
    }
  });
  let anaphoras = Object.entries(anaMap).filter(([, c]) => c >= 3).map(([line, count]) => ({ line, count, type: "anaphora" }));
  anaphoras = anaphoras.filter((a, i) => !anaphoras.some((b, j) => j !== i && b.line.length > a.line.length && b.line.includes(a.line) && b.count >= a.count));

  const phMap = {};
  normLines.forEach((l, li) => {
    const w = l.split(/\s+/);
    for (let len = Math.min(6, w.length); len >= 4; len--) {
      for (let s = 0; s <= w.length - len; s++) {
        const ph = w.slice(s, s + len).join(" ");
        if (!phMap[ph]) phMap[ph] = new Set();
        phMap[ph].add(li);
      }
    }
  });
  const phrases = Object.entries(phMap).filter(([ph, ls]) => ls.size >= 2 && ph.length >= 12)
    .map(([line, ls]) => ({ line, count: ls.size, type: "phrase", len: line.length })).sort((a, b) => b.len - a.len);
  const keptPh = [];
  phrases.forEach(p => {
    const pWords = new Set(p.line.split(/\s+/));
    const overlaps = keptPh.some(k => {
      if (k.line.includes(p.line) || p.line.includes(k.line)) return true;
      const kWords = new Set(k.line.split(/\s+/));
      const shared = [...pWords].filter(w => kWords.has(w)).length;
      return shared / Math.min(pWords.size, kWords.size) >= 0.6;
    });
    if (!overlaps) keptPh.push(p);
  });

  // ═══ 7) Combine & deduplicate ═══
  // Filter sub-blocks whose lines are entirely covered by a non-sub parent block
  const parentBlockFPs = new Set();
  blockReps.filter(b => !b.isSub && b.exact).forEach(b => {
    if (b.lines) b.lines.forEach(l => parentBlockFPs.add(norm(l)));
  });
  const filteredBlockReps = blockReps.filter(b => {
    if (!b.isSub) return true;
    // Keep sub-block if its lines aren't ALL covered by parent blocks
    return !b.lines || !b.lines.every(l => parentBlockFPs.has(norm(l)));
  });

  const blockLineKeys = new Set();
  filteredBlockReps.forEach(b => { if (b.lines) b.lines.forEach(l => blockLineKeys.add(l.toLowerCase().trim())); });
  const filteredLines = lineReps.filter(r => !blockLineKeys.has(r.line)).slice(0, 5);
  const filteredAna = anaphoras.filter(a => !blockCovered.has(norm(a.line)) || a.count >= 4).slice(0, 3);

  const result = [...filteredBlockReps, ...filteredLines, ...filteredAna, ...keptPh.slice(0, 3), ...nearDups.slice(0, 3)];
  result.chorusWordCount = chorusWordCount;
  return result;
};


const POETRY_SCHEMAS = {
  "Verso libre":  { lines: null, syllables: null,            rhyme: null,              desc: "Sin métrica ni rima fija. Libertad total." },
  "Haiku":        { lines: 3,    syllables: [5, 7, 5],       rhyme: null,              desc: "3 versos · 5-7-5 sílabas · sin rima" },
  "Terceto":      { lines: 3,    syllables: 11,              rhyme: "ABA",             desc: "3 versos endecasílabos · rima ABA" },
  "Redondilla":   { lines: 4,    syllables: 8,               rhyme: "abba",            desc: "4 versos octosílabos · rima abba" },
  "Copla":        { lines: 4,    syllables: 8,               rhyme: "-a-a",            desc: "4 versos octosílabos · riman los pares (asonante)" },
  "Cuarteto":     { lines: 4,    syllables: 11,              rhyme: "ABBA",            desc: "4 versos endecasílabos · rima ABBA" },
  "Serventesio":  { lines: 4,    syllables: 11,              rhyme: "ABAB",            desc: "4 versos endecasílabos · rima ABAB" },
  "Quintilla":    { lines: 5,    syllables: 8,               rhyme: "aabba",           desc: "5 versos octosílabos · rima aabba" },
  "Lira":         { lines: 5,    syllables: [7,11,7,7,11],   rhyme: "aBabB",           desc: "5 versos 7-11-7-7-11 · rima aBabB" },
  "Sextilla":     { lines: 6,    syllables: 8,               rhyme: "ababcc",          desc: "6 versos octosílabos · rima ababcc" },
  "Romance":      { lines: 8,    syllables: 8,               rhyme: "-a-a-a-a",        desc: "Octosílabos · riman los pares (asonante)" },
  "Décima":       { lines: 10,   syllables: 8,               rhyme: "abbaaccddc",      desc: "10 versos octosílabos · Espinela · abbaaccddc" },
  "Soneto":       { lines: 14,   syllables: 11,              rhyme: "ABBAABBACDCDCD",  desc: "14 versos endecasílabos · 2 cuartetos + 2 tercetos" },
};

const gold = "#D4AF37", goldBright = "#FFD700";

// ── Emotion Curve SVG (smooth bezier, clear labels, Y axis) ──
const EmotionCurve = ({ data, width = 340, height = 170, showMarkers = true, id = "a", isDark = true }) => {
  if (!data || !data.length) return <div style={{ color: isDark ? "#666" : "#999", fontSize: 12, padding: 16 }}>Escribe para ver el análisis emocional...</div>;
  const gridLine  = isDark ? "#222" : "#DDD";
  const axisText  = isDark ? "#555" : "#999";
  const axisLabel = isDark ? "#555" : "#AAA";
  const xLabel    = isDark ? "#777" : "#888";
  const metricLbl = isDark ? "#666" : "#888";
  const textC     = isDark ? "#AAA" : "#555";

  const padL = 36, padR = 14, padT = 24, padB = 32;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const maxI = Math.max(...data.map(d => d.intensity), 0.15);
  const minI = Math.min(...data.map(d => d.intensity));
  const climaxIdx = data.reduce((best, d, i) => d.intensity > data[best].intensity ? i : best, 0);
  const weakIdx = data.length > 1 ? data.reduce((best, d, i) => d.intensity < data[best].intensity ? i : best, 0) : -1;
  const tensionIdx = data.findIndex(d => d.isMaxTension);

  const getX = (i) => data.length === 1 ? padL + chartW / 2 : padL + (i / (data.length - 1)) * chartW;
  const getY = (val) => padT + chartH - (val / maxI) * chartH;

  const pts = data.map((d, i) => ({ x: getX(i), y: getY(d.intensity) }));

  // Smooth bezier path
  const bezierPath = pts.length === 1
    ? ""
    : pts.reduce((path, p, i) => {
        if (i === 0) return `M ${p.x},${p.y}`;
        const prev = pts[i - 1];
        const cpx = (prev.x + p.x) / 2;
        return `${path} C ${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`;
      }, "");

  // Area fill path
  const areaPath = pts.length > 1
    ? `${bezierPath} L ${pts[pts.length - 1].x},${padT + chartH} L ${pts[0].x},${padT + chartH} Z`
    : "";

  const avg = data[0]?.avgIntensity || 0;
  const variance = data[0]?.variance || 0;
  const stability = data[0]?.stability || 0;
  const rhythm = data[0]?.rhythm || 0;

  // Y axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].filter(v => v <= maxI + 0.1);

  return (
    <div>
      <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={`cg${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={goldBright} stopOpacity="0.25" />
            <stop offset="100%" stopColor={goldBright} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((v, i) => {
          const y = getY(v);
          return <g key={i}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke={gridLine} strokeWidth="0.5" strokeDasharray="3,3" />
            <text x={padL - 4} y={y + 3} fill={axisText} fontSize="8" textAnchor="end" fontFamily="Montserrat">{v.toFixed(1)}</text>
          </g>;
        })}

        {/* Area fill */}
        {areaPath && <path d={areaPath} fill={`url(#cg${id})`} />}

        {/* Main curve */}
        {bezierPath && <path d={bezierPath} fill="none" stroke={goldBright} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Average line */}
        {data.length > 1 && <line x1={padL} y1={getY(avg)} x2={width - padR} y2={getY(avg)} stroke={gold} strokeWidth="0.8" strokeDasharray="5,4" opacity="0.5" />}
        {data.length > 1 && <text x={width - padR + 2} y={getY(avg) + 3} fill={gold} fontSize="7" opacity="0.6" fontFamily="Montserrat">avg</text>}

        {/* Points and markers */}
        {pts.map((p, i) => {
          const isClimax = i === climaxIdx;
          const isWeak = i === weakIdx;
          const isTens = i === tensionIdx && showMarkers && tensionIdx !== climaxIdx;
          const isSpecial = showMarkers && (isClimax || isWeak || isTens);
          const r = isSpecial ? 5.5 : 3.5;
          const emotionCol = EMOTION_COLORS[data[i]?.dominant] || goldBright;
          const col = isClimax ? "#FF6B6B" : isWeak ? "#4ECDC4" : isTens ? "#FF9F43" : emotionCol;

          return (
            <g key={i}>
              {isSpecial && <circle cx={p.x} cy={p.y} r={r + 3} fill={col} opacity="0.15" />}
              <circle cx={p.x} cy={p.y} r={r} fill={col} stroke="#000" strokeWidth="1" />
              {showMarkers && isClimax && (
                <g>
                  <rect x={p.x - 20} y={p.y - 22} width="40" height="14" rx="3" fill="#FF6B6B" opacity="0.9" />
                  <text x={p.x} y={p.y - 12} fill="#000" fontSize="8" textAnchor="middle" fontWeight="700" fontFamily="Montserrat">CLÍMAX</text>
                </g>
              )}
              {showMarkers && isWeak && data.length > 1 && (
                <g>
                  <rect x={p.x - 16} y={p.y - 22} width="32" height="14" rx="3" fill="#4ECDC4" opacity="0.9" />
                  <text x={p.x} y={p.y - 12} fill="#000" fontSize="8" textAnchor="middle" fontWeight="700" fontFamily="Montserrat">DÉBIL</text>
                </g>
              )}
              {showMarkers && isTens && (
                <g>
                  <rect x={p.x - 22} y={p.y + 8} width="44" height="14" rx="3" fill="#FF9F43" opacity="0.9" />
                  <text x={p.x} y={p.y + 18} fill="#000" fontSize="7" textAnchor="middle" fontWeight="700" fontFamily="Montserrat">TENSIÓN</text>
                </g>
              )}
            </g>
          );
        })}

        {/* X axis labels */}
        <line x1={padL} y1={padT + chartH + 2} x2={width - padR} y2={padT + chartH + 2} stroke={gridLine} strokeWidth="0.5" />
        {data.map((d, i) => (
          <text key={i} x={getX(i)} y={height - 6} fill={showMarkers ? (EMOTION_COLORS[d.dominant] || xLabel) : xLabel} fontSize="8" textAnchor="middle" fontFamily="Montserrat" fontWeight="500">
            {d.tag ? d.tag.slice(0, 4) : `B${i + 1}`}
          </text>
        ))}

        {/* Y axis label */}
        <text x="4" y={padT - 6} fill={axisLabel} fontSize="7" fontFamily="Montserrat">Intensidad</text>
      </svg>

      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 10px", marginTop: 10 }}>
        {[
          { label: "Intensidad media", value: avg.toFixed(2), color: goldBright },
          { label: "Pico máximo", value: maxI.toFixed(2), color: "#FF6B6B" },
          { label: "Punto débil", value: minI.toFixed(2), color: "#4ECDC4" },
          { label: "Estabilidad", value: `${(stability * 100).toFixed(0)}%`, color: gold },
          { label: "Ritmo", value: rhythm.toFixed(3), color: gold },
          { label: "Bloques", value: data.length, color: gold },
        ].map(m => (
          <div key={m.label} style={{ textAlign: "center" }}>
            <div style={{ color: m.color, fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{m.value}</div>
            <div style={{ color: metricLbl, fontSize: 8, marginTop: 2 }}>{m.label}</div>
          </div>
        ))}
      </div>
      {/* Arc label and global emotion */}
      {data[0]?.arcLabel && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: gold, background: `${gold}18`, padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{data[0].arcLabel}</span>
          {data[0]?.globalDominant && <span style={{ fontSize: 10, color: EMOTION_COLORS[data[0].globalDominant] || gold, background: `${EMOTION_COLORS[data[0].globalDominant] || gold}18`, padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{EMOTION_LABELS[data[0].globalDominant] || data[0].globalDominant}</span>}
          {data[0]?.globalSecondary && <span style={{ fontSize: 10, color: EMOTION_COLORS[data[0].globalSecondary] || textC, background: `${EMOTION_COLORS[data[0].globalSecondary] || textC}15`, padding: "2px 8px", borderRadius: 6 }}>{EMOTION_LABELS[data[0].globalSecondary] || data[0].globalSecondary}</span>}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════
export default function Infiniversal() {
  const [screen, setScreen] = useState("home");
  const [notes, setNotes] = useState([]);
  const [currentNote, setCurrentNote] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState("Todas");
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [showTechPanel, setShowTechPanel] = useState(false);
  const [showEmotionPanel, setShowEmotionPanel] = useState(false);
  const [flowMode, setFlowMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [focusPermanent, setFocusPermanent] = useState(false);
  const [flowTimer, setFlowTimer] = useState(0);
  const [flowTimerRunning, setFlowTimerRunning] = useState(false);
  const [editingTimer, setEditingTimer] = useState(false);
  const [timerInput, setTimerInput] = useState("");
  const [showTutorial, setShowTutorial] = useState(true);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialDismissed, setTutorialDismissed] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState(new Set());
  const [compareNotes, setCompareNotes] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState(null);
  const [guideTab, setGuideTab] = useState("general");
  const [activeForm, setActiveForm] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showFlowPicker, setShowFlowPicker] = useState(false);
  const [flowContentSnapshot, setFlowContentSnapshot] = useState("");
  const [titleEditable, setTitleEditable] = useState(false);
  const titlePressRef = useRef(null);
  const doubleTapRef = useRef(null);
  const flowRef = useRef(null);
  const scrollRefA = useRef(null);
  const scrollRefB = useRef(null);
  const syncingScroll = useRef(false);
  const textareaRef = useRef(null);

  const bg        = darkMode ? "#000"     : "#F5F5F0";
  const bgCard    = darkMode ? "#111"     : "#FFF";
  const bgDeep    = darkMode ? "#000"     : "#EEEEE9";   // top bars
  const bgCard2   = darkMode ? "#1a1a1a" : "#F0EFE9";   // inner cards / row bg
  const bgPanel   = darkMode ? "#111"     : "#FAFAF7";   // panels & modals
  const bgDropdown= darkMode ? "#1a1a1a" : "#FFFFFF";   // dropdown menus
  const textColor = darkMode ? "#E8E8E8" : "#1A1A1A";
  const textSub   = darkMode ? "#CCC"    : "#444";       // subtitle / description text
  const textMuted = darkMode ? "#888"    : "#666";
  const textFaint = darkMode ? "#555"    : "#AAA";       // very muted / disabled
  const borderColor= darkMode ? "#333"  : "#DDD";
  const borderSoft = darkMode ? "#222"  : "#E8E8E3";     // very soft separators
  const borderMid  = darkMode ? "#444"  : "#CCC";        // stronger borders

  useEffect(() => {
    if (flowTimerRunning) flowRef.current = setInterval(() => setFlowTimer(t => t + 1), 1000);
    else clearInterval(flowRef.current);
    return () => clearInterval(flowRef.current);
  }, [flowTimerRunning]);

  // Mobile back button: push a history entry whenever the screen changes,
  // and map popstate back to the correct previous screen.
  useEffect(() => {
    history.pushState({ screen, activeForm: activeForm?.name ?? null }, "");
  }, [screen, activeForm]);

  useEffect(() => {
    const onPop = (e) => {
      const s = e.state?.screen ?? "home";
      // Map each screen back to its logical parent
      if (s === "editor" || s === "compare") { setScreen("home"); setCompareNotes(null); setFlowMode(false); setFlowTimerRunning(false); }
      else if (s === "guide") setScreen("settings");
      else if (s === "poetrylearn") {
        if (activeForm) { setActiveForm(null); history.pushState({ screen: "poetrylearn", activeForm: null }, ""); }
        else setScreen("settings");
      }
      else if (s === "settings") setScreen("home");
      else setScreen("home");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [activeForm]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }
  }, [toast]);

  const fmt = (s) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const enterFlowMode = (note) => {
    setCurrentNote(note);
    setScreen("editor");
    setFlowMode(true);
    setFlowContentSnapshot(note.content || "");
    setFlowTimer(0);
    setFlowTimerRunning(true);
    setFocusMode(false);
    setShowTechPanel(false);
    setShowEmotionPanel(false);
    setUndoStack([]);
    setRedoStack([]);
    setShowMenu(false);
    setShowFlowPicker(false);
  };

  const createNote = (type, startFlow = false) => {
    const note = { id: generateId(), type, title: type === "poetry" ? "Nuevo poema" : "Nueva canción", content: "", folder: type === "poetry" ? "Poesía" : "Canción", created: now(), modified: now(), poetrySchema: null };
    setNotes(p => [note, ...p]); setCurrentNote(note); setShowNewNoteModal(false); setScreen("editor");
    if (startFlow) {
      setFlowMode(true); setFlowContentSnapshot(""); setFlowTimer(0); setFlowTimerRunning(true);
    } else {
      setFlowMode(false);
    }
    setFocusMode(focusPermanent); setShowTechPanel(false); setShowEmotionPanel(false); setUndoStack([]); setRedoStack([]);
  };

  const updateNote = useCallback((field, value) => {
    setCurrentNote(prev => { if (!prev) return prev; const u = { ...prev, [field]: value, modified: now() }; setNotes(ns => ns.map(n => n.id === u.id ? u : n)); return u; });
  }, []);

  const updateContent = useCallback((value) => {
    // In flow mode, prevent deleting - only allow appending
    if (flowMode) {
      const current = currentNote?.content || "";
      // Only allow if new value starts with current content OR is longer
      // This prevents backspace, select-delete, cut, etc.
      if (value.length < current.length) return;
      // Also prevent replacing existing content (e.g. select + type)
      if (!value.startsWith(current) && value.length <= current.length) return;
    }
    setUndoStack(prev => [...prev.slice(-30), currentNote?.content || ""]); setRedoStack([]); updateNote("content", value);
  }, [currentNote, updateNote, flowMode]);

  const undo = () => { if (!undoStack.length) return; setRedoStack(r => [...r, currentNote?.content || ""]); updateNote("content", undoStack[undoStack.length - 1]); setUndoStack(u => u.slice(0, -1)); };
  const redo = () => { if (!redoStack.length) return; setUndoStack(u => [...u, currentNote?.content || ""]); updateNote("content", redoStack[redoStack.length - 1]); setRedoStack(r => r.slice(0, -1)); };

  const deleteNotes = (ids) => { setNotes(p => p.filter(n => !ids.has(n.id))); setSelectedNotes(new Set()); setSelectionMode(false); setConfirmDelete(false); };

  const createVersion = (noteId) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return null;
    const base = note.title.replace(/ v\d+$/, "");
    const cnt = notes.filter(n => n.title.replace(/ v\d+$/, "") === base).length;
    const v = { ...note, id: generateId(), title: `${base} v${cnt + 1}`, created: now(), modified: now() };
    setNotes(p => [v, ...p]); return v;
  };

  const shareNotes = (ids) => {
    const arr = notes.filter(n => ids.has(n.id));
    const text = arr.map(n => `── ${n.title} ──\n${n.content}`).join("\n\n");
    if (navigator.share) navigator.share({ title: arr.length === 1 ? arr[0].title : "Mis versos", text });
    else navigator.clipboard?.writeText(text);
  };

  const filteredNotes = useMemo(() => {
    let r = notes;
    if (activeFolder === "Poesía") r = r.filter(n => n.folder === "Poesía");
    else if (activeFolder === "Canción") r = r.filter(n => n.folder === "Canción");
    else if (activeFolder === "Borradores") r = r.filter(n => !n.content.trim() || n.content.trim().split(/\s+/).length < 15);
    if (searchQuery) { const q = searchQuery.toLowerCase(); r = r.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)); }
    return r;
  }, [notes, activeFolder, searchQuery]);

  const emotionData = useMemo(() => currentNote ? analyzeEmotion(currentNote.content, currentNote.type === "song", currentNote.type === "poetry") : [], [currentNote?.content, currentNote?.type]);
  const repetitions = useMemo(() => currentNote ? detectRepetitions(currentNote.content, currentNote.type === "song") : [], [currentNote?.content, currentNote?.type]);
  const cliches = useMemo(() => currentNote ? detectCliches(currentNote.content, currentNote.type === "song" ? "song" : currentNote.type === "poetry" ? "poetry" : "generic") : [], [currentNote?.content, currentNote?.type]);
  const textStats = useMemo(() => {
    if (!currentNote) return {};
    const c = currentNote.content, w = c.trim().split(/\s+/).filter(w => w), l = c.split("\n").filter(l => l.trim()), u = new Set(w.map(x => x.toLowerCase()));
    const rawDensity = w.length ? (u.size / w.length * 100).toFixed(1) : 0;
    // For songs: exclude repeated chorus words from density calculation
    const chorusWords = repetitions.chorusWordCount || 0;
    const isSong = currentNote.type === "song";
    const effectiveWords = isSong && chorusWords > 0 ? Math.max(w.length - chorusWords, u.size) : w.length;
    const adjustedDensity = effectiveWords > 0 ? (u.size / effectiveWords * 100).toFixed(1) : rawDensity;
    return { words: w.length, chars: c.length, lines: l.length, uniqueWords: u.size, density: isSong ? adjustedDensity : rawDensity, rawDensity, chorusWords: isSong ? chorusWords : 0 };
  }, [currentNote?.content, currentNote?.type, repetitions]);

  const poetryAnalysis = useMemo(() => {
    if (!currentNote || currentNote.type !== "poetry" || !currentNote.poetrySchema) return null;
    const schema = POETRY_SCHEMAS[currentNote.poetrySchema];
    if (!schema) return null;
    let verseInStanza = 0, stanzaIndex = 0;
    return currentNote.content.split("\n").map((line) => {
      if (!line.trim()) {
        if (verseInStanza > 0) { stanzaIndex++; verseInStanza = 0; }
        return { isBreak: true };
      }
      const sc = countSyllables(line);
      const tgt = schema.syllables
        ? (Array.isArray(schema.syllables) ? schema.syllables[verseInStanza % schema.syllables.length] : schema.syllables)
        : null;
      const overflow = schema.lines !== null && verseInStanza >= schema.lines;
      const entry = { line, syllables: sc, target: tgt, rhymeEnd: getRhymeEnding(line), ok: !tgt || Math.abs(sc - tgt) <= 1, verseInStanza, stanzaIndex, overflow };
      verseInStanza++;
      return entry;
    });
  }, [currentNote?.content, currentNote?.poetrySchema]);

  const handleScrollA = () => { if (syncingScroll.current) return; syncingScroll.current = true; if (scrollRefA.current && scrollRefB.current) scrollRefB.current.scrollTop = scrollRefA.current.scrollTop; setTimeout(() => { syncingScroll.current = false; }, 20); };
  const handleScrollB = () => { if (syncingScroll.current) return; syncingScroll.current = true; if (scrollRefA.current && scrollRefB.current) scrollRefA.current.scrollTop = scrollRefB.current.scrollTop; setTimeout(() => { syncingScroll.current = false; }, 20); };

  const bs = { background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", justifyContent: "center" };

  // ── TUTORIAL ──
  const TutorialOverlay = () => {
    if (tutorialDismissed || !showTutorial) return null;
    const steps = [
      { t: "Bienvenido a Infiniversal", d: "Tu espacio profesional para crear poesía y letras de canciones." },
      { t: "Crear una nota", d: "Pulsa el botón + dorado para crear un poema o letra de canción." },
      { t: "Panel técnico", d: "La flecha dorada abre métricas: sílabas, rima, repeticiones y clichés." },
      { t: "Análisis emocional", d: "La bola dorada flotante muestra la curva narrativa con tensión, intensidad y carga afectiva." },
      { t: "Modos de escritura", d: "Modo flujo: desde el menú ☰, solo escritura sin borrar. Modo enfoque: mantén pulsado el título 2s." },
      { t: "Comparador", d: "Mantén pulsada una nota, selecciona 2 y pulsa Comparar." },
      { t: "¡Listo!", d: "Vuelve a ver esta guía en Ajustes." }
    ];
    const s = steps[tutorialStep];
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: bgPanel, border: `1px solid ${gold}`, borderRadius: 16, padding: 28, maxWidth: 310, textAlign: "center" }}>
          <div style={{ width: 42, height: 42, margin: "0 auto 12px", background: `linear-gradient(135deg, ${gold}, ${goldBright})`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#000", fontWeight: 700 }}>{tutorialStep + 1}</div>
          <h3 style={{ color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 16, margin: "0 0 8px" }}>{s.t}</h3>
          <p style={{ color: textSub, fontFamily: "Montserrat,sans-serif", fontSize: 13, lineHeight: 1.6, margin: "0 0 18px" }}>{s.d}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            {tutorialStep < steps.length - 1 ? (<>
              <button onClick={() => { setTutorialDismissed(true); setShowTutorial(false); }} style={{ padding: "6px 16px", background: "transparent", border: `1px solid ${borderMid}`, color: textMuted, borderRadius: 8, fontFamily: "Montserrat,sans-serif", fontSize: 12, cursor: "pointer" }}>Saltar</button>
              <button onClick={() => setTutorialStep(i => i + 1)} style={{ padding: "6px 16px", background: gold, border: "none", color: "#000", borderRadius: 8, fontFamily: "Montserrat,sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Siguiente</button>
            </>) : (
              <button onClick={() => { setTutorialDismissed(true); setShowTutorial(false); }} style={{ padding: "6px 20px", background: gold, border: "none", color: "#000", borderRadius: 8, fontFamily: "Montserrat,sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>¡Empezar!</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 12 }}>
            {steps.map((_, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i === tutorialStep ? gold : borderMid }} />)}
          </div>
        </div>
      </div>
    );
  };

  // ── HOME ──
  const HomeScreen = () => (
    <div style={{ minHeight: "100vh", background: bg, fontFamily: "Montserrat,sans-serif" }}>
      <div style={{ background: bgDeep, padding: "14px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="32" height="32" viewBox="0 0 36 36"><defs><linearGradient id="ig" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={gold}/><stop offset="100%" stopColor={goldBright}/></linearGradient><filter id="gl"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M18 18c-3-3-6-6-9-6s-6 3-6 6 3 6 6 6 6-3 9-6c3 3 6 6 9 6s6-3 6-6-3-6-6-6-6 3-9 6z" fill="none" stroke="url(#ig)" strokeWidth="2.5" filter="url(#gl)"/></svg>
            <h1 style={{ color: gold, fontSize: 20, fontWeight: 700, margin: 0 }}>Mis versos</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => setShowMenu(m => !m)} style={bs}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <button onClick={() => setScreen("settings")} style={bs}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
          </div>
        </div>

        {showMenu && (<>
          <div onClick={() => setShowMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 250 }} />
          <div style={{ position: "absolute", right: 16, top: 52, background: bgDropdown, border: `1px solid ${borderColor}`, borderRadius: 12, padding: 6, zIndex: 300, minWidth: 180, boxShadow: darkMode ? "0 8px 30px rgba(0,0,0,0.6)" : "0 4px 20px rgba(0,0,0,0.12)" }}>
            <button onClick={() => { setShowMenu(false); setShowFlowPicker(true); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", borderRadius: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={goldBright} strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              <span style={{ color: textColor, fontFamily: "Montserrat,sans-serif", fontSize: 13, fontWeight: 500 }}>Modo flujo</span>
            </button>
          </div>
        </>)}

        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 10 }}>
          {["Todas", "Poesía", "Canción", "Borradores"].map(t => (
            <button key={t} onClick={() => setActiveFolder(t)} style={{ height: 36, padding: "0 16px", borderRadius: 18, border: "none", cursor: "pointer", background: activeFolder === t ? gold : (darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"), color: activeFolder === t ? "#000" : textColor, fontFamily: "Montserrat,sans-serif", fontSize: 13, fontWeight: activeFolder === t ? 600 : 400, whiteSpace: "nowrap", flexShrink: 0 }}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{ padding: "10px 5%" }}>
        <div style={{ position: "relative" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar notas..." style={{ width: "100%", padding: "9px 12px 9px 38px", border: `1px solid ${borderColor}`, borderRadius: 10, background: bgCard, color: textColor, fontFamily: "Montserrat,sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        </div>
      </div>

      {selectionMode && (
        <div style={{ display: "flex", gap: 6, padding: "6px 5%", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: gold, fontSize: 12, fontWeight: 600 }}>{selectedNotes.size} sel.</span>
          <button onClick={() => { setSelectionMode(false); setSelectedNotes(new Set()); }} style={{ background: "none", border: `1px solid ${borderMid}`, color: textMuted, borderRadius: 6, padding: "3px 10px", fontFamily: "Montserrat,sans-serif", fontSize: 11, cursor: "pointer" }}>Cancelar</button>
          <button onClick={() => shareNotes(selectedNotes)} style={{ background: gold, border: "none", color: "#000", borderRadius: 6, padding: "3px 10px", fontFamily: "Montserrat,sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Compartir</button>
          {selectedNotes.size >= 1 && (
            <button onClick={() => { const id = [...selectedNotes][0]; const v = createVersion(id); if (v) { setToast("Versión creada: " + v.title); setSelectionMode(false); setSelectedNotes(new Set()); } }} style={{ background: "none", border: `1px solid ${gold}`, color: gold, borderRadius: 6, padding: "3px 10px", fontFamily: "Montserrat,sans-serif", fontSize: 11, cursor: "pointer" }}>Crear versión</button>
          )}
          {selectedNotes.size === 2 && (
            <button onClick={() => { const ids = [...selectedNotes]; const a = notes.find(n => n.id === ids[0]); const b = notes.find(n => n.id === ids[1]); if (a && b) { setCompareNotes({ a, b }); setScreen("compare"); setSelectionMode(false); setSelectedNotes(new Set()); } }} style={{ background: gold, border: "none", color: "#000", borderRadius: 6, padding: "3px 10px", fontFamily: "Montserrat,sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Comparar</button>
          )}
          <button onClick={() => setConfirmDelete(true)} style={{ background: "#C0392B", border: "none", color: "#FFF", borderRadius: 6, padding: "3px 10px", fontFamily: "Montserrat,sans-serif", fontSize: 11, cursor: "pointer" }}>Eliminar</button>
        </div>
      )}

      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: bgPanel, border: `1px solid ${borderMid}`, borderRadius: 14, padding: 24, maxWidth: 280, textAlign: "center" }}>
            <p style={{ color: textColor, fontFamily: "Montserrat,sans-serif", fontSize: 14, marginBottom: 16 }}>¿Eliminar {selectedNotes.size} nota(s)?</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: "6px 16px", background: "transparent", border: `1px solid ${borderMid}`, color: textMuted, borderRadius: 8, fontSize: 12, cursor: "pointer" }}>No</button>
              <button onClick={() => deleteNotes(selectedNotes)} style={{ padding: "6px 16px", background: "#C0392B", border: "none", color: "#FFF", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "2px 5% 100px" }}>
        {filteredNotes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px" }}>
            <svg width="50" height="50" viewBox="0 0 36 36" style={{ opacity: 0.2, marginBottom: 10 }}><path d="M18 18c-3-3-6-6-9-6s-6 3-6 6 3 6 6 6 6-3 9-6c3 3 6 6 9 6s6-3 6-6-3-6-6-6-6 3-9 6z" fill="none" stroke={gold} strokeWidth="2"/></svg>
            <p style={{ color: textMuted, fontSize: 14 }}>No hay notas aún</p>
            <p style={{ color: textMuted, fontSize: 12, marginTop: 3 }}>Pulsa + para crear tu primer verso</p>
          </div>
        ) : filteredNotes.map(note => (
          <div key={note.id}
            onClick={() => { if (selectionMode) { setSelectedNotes(p => { const n = new Set(p); n.has(note.id) ? n.delete(note.id) : n.add(note.id); return n; }); } else { setCurrentNote(note); setScreen("editor"); setFlowMode(false); setFocusMode(focusPermanent); setShowTechPanel(false); setShowEmotionPanel(false); setUndoStack([]); setRedoStack([]); } }}
            onContextMenu={e => { e.preventDefault(); setSelectionMode(true); setSelectedNotes(new Set([note.id])); }}
            onTouchStart={e => { const t = setTimeout(() => { setSelectionMode(true); setSelectedNotes(new Set([note.id])); }, 600); e.currentTarget._lt = t; }}
            onTouchEnd={e => clearTimeout(e.currentTarget._lt)}
            style={{ background: selectedNotes.has(note.id) ? (darkMode ? "#1a1a0a" : "#FFF8E1") : bgCard, border: `1px solid ${selectedNotes.has(note.id) ? gold : borderColor}`, borderRadius: 12, padding: 14, marginBottom: 8, cursor: "pointer", position: "relative" }}>
            {selectionMode && <div style={{ position: "absolute", top: 12, right: 12, width: 20, height: 20, borderRadius: "50%", border: `2px solid ${gold}`, background: selectedNotes.has(note.id) ? gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{selectedNotes.has(note.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 8, background: `${gold}22`, color: gold, fontWeight: 600 }}>{note.type === "poetry" ? "Poesía" : "Canción"}</span>
              {note.poetrySchema && <span style={{ fontSize: 9, color: textMuted }}>{note.poetrySchema}</span>}
            </div>
            <h3 style={{ color: textColor, fontSize: 14, fontWeight: 600, margin: "0 0 2px" }}>{note.title}</h3>
            <p style={{ color: textMuted, fontSize: 11, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.content.substring(0, 80) || "Sin contenido"}</p>
            <p style={{ color: textMuted, fontSize: 9, marginTop: 5, opacity: 0.5 }}>{new Date(note.modified).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        ))}
      </div>

      <button onClick={() => setShowNewNoteModal(true)} style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", width: 60, height: 60, borderRadius: "50%", border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${gold}, ${goldBright})`, boxShadow: "2px 2px 10px rgba(0,0,0,0.5), 0 0 20px rgba(212,175,55,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>

      {showNewNoteModal && (
        <div onClick={() => setShowNewNoteModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bgPanel, borderRadius: "20px 20px 0 0", padding: "22px 24px 30px", width: "100%", maxWidth: 400 }}>
            <h3 style={{ color: gold, textAlign: "center", fontSize: 16, fontWeight: 600, marginBottom: 16 }}>¿Qué quieres crear?</h3>
            <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
              {[{ type: "poetry", label: "Poesía", svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> }, { type: "song", label: "Letra de canción", svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> }].map(o => (
                <button key={o.type} onClick={() => createNote(o.type)} style={{ width: 120, padding: "16px 12px", background: "transparent", border: `1.5px solid ${gold}`, borderRadius: 14, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  {o.svg}
                  <span style={{ color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 13, fontWeight: 600 }}>{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showFlowPicker && (
        <div onClick={() => setShowFlowPicker(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bgPanel, borderRadius: "20px 20px 0 0", padding: "22px 20px 30px", width: "100%", maxWidth: 400, maxHeight: "70vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={goldBright} strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              <h3 style={{ color: gold, fontSize: 16, fontWeight: 600, margin: 0 }}>Modo flujo</h3>
            </div>
            <p style={{ color: textMuted, fontSize: 11, marginBottom: 14, lineHeight: 1.5 }}>Escribe sin distracciones. Solo puedes añadir texto, no borrar. Temporizador activo.</p>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button onClick={() => { createNote("poetry", true); }} style={{ flex: 1, padding: "10px", background: `${gold}15`, border: `1px solid ${gold}44`, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span style={{ color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 11, fontWeight: 600 }}>Nuevo poema</span>
              </button>
              <button onClick={() => { createNote("song", true); }} style={{ flex: 1, padding: "10px", background: `${gold}15`, border: `1px solid ${gold}44`, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span style={{ color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 11, fontWeight: 600 }}>Nueva canción</span>
              </button>
            </div>

            {notes.length > 0 && (
              <>
                <p style={{ color: textFaint, fontSize: 10, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>O continúa una nota:</p>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {notes.map(note => (
                    <button key={note.id} onClick={() => enterFlowMode(note)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", borderBottom: `1px solid ${borderSoft}`, textAlign: "left" }}>
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 6, background: `${gold}22`, color: gold, fontWeight: 600, flexShrink: 0 }}>{note.type === "poetry" ? "P" : "C"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: textColor, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "Montserrat,sans-serif" }}>{note.title}</div>
                        <div style={{ color: textMuted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.content.substring(0, 50) || "Sin contenido"}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textFaint} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ── EDITOR ──
  const EditorScreen = () => {
    if (!currentNote) return null;
    const isSong = currentNote.type === "song";
    const isPoetry = currentNote.type === "poetry";
    const ef = focusMode || focusPermanent;
    const sp = !flowMode && !ef;

    // Auto-shrink font so every verse fits on one line (no wrap) — only when a schema is active
    const dynamicFontSize = (() => {
      if (!isPoetry || !poetryAnalysis || !currentNote.poetrySchema) return fontSize;
      const lines = (currentNote.content || "").split("\n");
      const maxLen = Math.max(...lines.map(l => l.length), 1);
      const hasLeftMargin  = true;
      const hasRightMargin = !!POETRY_SCHEMAS[currentNote.poetrySchema]?.rhyme;
      const leftW  = hasLeftMargin  ? 48 : 0;
      const rightW = hasRightMargin ? 24 : 0;
      const padding = 20;
      const available = 390 - leftW - rightW - padding;
      const charPx = 0.50;
      const fitted = available / (maxLen * charPx);
      return Math.max(8, Math.min(fontSize, fitted));
    })();

    return (
      <div style={{ minHeight: "100vh", background: bg, fontFamily: "Montserrat,sans-serif", position: "relative" }}>
        {/* Top bar */}
        <div style={{ background: bgDeep, padding: "7px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
            <button onClick={() => { setScreen("home"); setFlowMode(false); setFlowTimerRunning(false); }} style={bs}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
            {!flowMode ? (
              titleEditable
                ? <input autoFocus value={currentNote.title} onChange={e => updateNote("title", e.target.value)}
                    onBlur={() => setTitleEditable(false)}
                    style={{ background: "none", border: "none", borderBottom: `1px solid ${gold}66`, color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 15, fontWeight: 700, outline: "none", flex: 1, minWidth: 0 }} />
                : <span
                    onDoubleClick={() => setTitleEditable(true)}
                    onTouchStart={() => {
                      // Double-tap detection
                      if (doubleTapRef.current) {
                        clearTimeout(doubleTapRef.current);
                        doubleTapRef.current = null;
                        setTitleEditable(true);
                        return;
                      }
                      doubleTapRef.current = setTimeout(() => { doubleTapRef.current = null; }, 300);
                      // Long-press for focus mode
                      titlePressRef.current = setTimeout(() => setFocusMode(f => !f), 2000);
                    }}
                    onTouchEnd={() => clearTimeout(titlePressRef.current)}
                    style={{ background: "none", color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 15, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "text", userSelect: "none" }}
                  >{currentNote.title}</span>
            ) : (
              <span style={{ color: gold, fontSize: 14, fontWeight: 700, flex: 1 }}>Modo flujo</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
            {/* Flow mode: prominent timer */}
            {flowMode && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, background: `${gold}18`, borderRadius: 8, padding: "3px 10px", marginRight: 4 }}>
                <button onClick={() => setFlowTimerRunning(r => !r)} style={{ ...bs, padding: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={goldBright} strokeWidth="2.5">
                    {flowTimerRunning ? <><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></> : <polygon points="5,3 19,12 5,21"/>}
                  </svg>
                </button>
                {editingTimer ? (
                  <input value={timerInput} onChange={e => setTimerInput(e.target.value.replace(/[^0-9:]/g, ""))}
                    onBlur={() => { const p = timerInput.split(":").map(Number); if (p.length === 2 && !isNaN(p[0]) && !isNaN(p[1])) setFlowTimer(p[0] * 60 + p[1]); setEditingTimer(false); }}
                    onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} autoFocus
                    style={{ width: 48, padding: "1px 3px", background: "transparent", border: `1px solid ${gold}`, borderRadius: 3, color: goldBright, fontSize: 14, fontFamily: "monospace", fontWeight: 700, textAlign: "center", outline: "none" }} />
                ) : (
                  <span onClick={() => { setTimerInput(fmt(flowTimer)); setEditingTimer(true); }} style={{ color: goldBright, fontSize: 14, fontFamily: "monospace", fontWeight: 700, cursor: "pointer", minWidth: 48, textAlign: "center" }}>{fmt(flowTimer)}</span>
                )}
                {/* Exit flow */}
                <button onClick={() => { setFlowMode(false); setFlowTimerRunning(false); setToast("Modo flujo terminado: " + fmt(flowTimer)); }} style={{ ...bs, marginLeft: 2 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}
            {!flowMode && <>
              <button onClick={undo} style={{ ...bs, opacity: undoStack.length ? 1 : 0.3 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={textColor} strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
              <button onClick={redo} style={{ ...bs, opacity: redoStack.length ? 1 : 0.3 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={textColor} strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg></button>
              <button onClick={() => shareNotes(new Set([currentNote.id]))} style={bs}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></button>
              <button style={bs} title="Guardar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></button>
              <button onClick={() => { const v = createVersion(currentNote.id); if (v) setToast("Versión creada: " + v.title); }} style={bs}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>
              {sp && <button onClick={() => setShowTechPanel(t => !t)} style={{ width: 30, height: 30, background: showTechPanel ? gold : "transparent", border: `1.5px solid ${gold}`, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "1px 1px 3px #000" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={showTechPanel ? "#000" : gold} strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>}
            </>}
          </div>
        </div>

        {/* Song tags */}
        {isSong && !flowMode && (
          <div style={{ display: "flex", gap: 4, padding: "4px 8px", overflowX: "auto", background: darkMode ? "#0a0a0a" : "#EEEDE8" }}>
            {SONG_TAGS.map(tag => (
              <button key={tag} onClick={() => { const ta = textareaRef.current; const content = currentNote?.content || ""; const pos = ta ? ta.selectionStart : content.length; const insert = `\n[${tag}]\n`; const newContent = content.slice(0, pos) + insert + content.slice(pos); updateContent(newContent); setTimeout(() => { if (ta) { const newPos = pos + insert.length; ta.focus(); ta.setSelectionRange(newPos, newPos); } }, 0); }} style={{ padding: "4px 9px", borderRadius: 5, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${gold}, ${goldBright})`, color: "#000", fontFamily: "Montserrat,sans-serif", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>[{tag}]</button>
            ))}
          </div>
        )}

        {/* Poetry: inline type selector (compact, same interface) */}
        {isPoetry && !flowMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", overflowX: "auto", background: darkMode ? "#0a0a0a" : "#EEEDE8" }}>
            {Object.keys(POETRY_SCHEMAS).map(type => (
              <button key={type} onClick={() => updateNote("poetrySchema", type === currentNote.poetrySchema ? null : type)} style={{
                padding: "3px 10px", borderRadius: 14, border: `1px solid ${currentNote.poetrySchema === type ? gold : borderColor}`,
                background: currentNote.poetrySchema === type ? `${gold}25` : "transparent",
                color: currentNote.poetrySchema === type ? gold : textMuted,
                fontFamily: "Montserrat,sans-serif", fontSize: 10, fontWeight: currentNote.poetrySchema === type ? 700 : 400,
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.15s"
              }}>{type}</button>
            ))}
          </div>
        )}
        {isPoetry && currentNote.poetrySchema && !flowMode && POETRY_SCHEMAS[currentNote.poetrySchema] && (
          <div style={{ padding: "3px 10px 4px", background: darkMode ? "#0a0a0a" : "#EEEDE8", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: gold, fontSize: 9, fontWeight: 600 }}>{POETRY_SCHEMAS[currentNote.poetrySchema].desc}</span>
            {POETRY_SCHEMAS[currentNote.poetrySchema]?.rhyme && (
              <span style={{ color: textMuted, fontSize: 9 }}>· Rima: <span style={{ color: goldBright, fontWeight: 600, fontFamily: "monospace" }}>{POETRY_SCHEMAS[currentNote.poetrySchema].rhyme}</span></span>
            )}
          </div>
        )}

        <div style={{ display: "flex" }}>
          {isPoetry && poetryAnalysis && !flowMode && (
            <div style={{ width: 48, padding: "8px 2px", textAlign: "right", flexShrink: 0, borderRight: `1px solid ${borderColor}`, background: darkMode ? "#080808" : "#F8F8F4" }}>
              {(() => { let vn = 0; return poetryAnalysis.map((la, i) => {
                if (la.isBreak) return <div key={i} style={{ height: `${dynamicFontSize * 1.8}px` }} />;
                vn++;
                return (
                  <div key={i} style={{ height: `${dynamicFontSize * 1.8}px`, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1, paddingRight: 2 }}>
                    <span style={{ fontSize: 8, color: la.overflow ? "#FF0000" : textMuted }}>{vn}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: la.overflow ? "#FF0000" : (la.ok ? (darkMode ? "#CCC" : "#000") : "#FF0000"), minWidth: 12, textAlign: "center" }}>{la.syllables}</span>
                    {la.target && !la.overflow && <span style={{ fontSize: 7, color: textMuted }}>/{la.target}</span>}
                  </div>
                );
              }); })()}
            </div>
          )}
          <textarea ref={textareaRef} value={currentNote.content} onChange={e => updateContent(e.target.value)}
            onKeyDown={flowMode ? (e) => {
              if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); return; }
              // Block Ctrl+X (cut), Ctrl+Z (undo)
              if ((e.ctrlKey || e.metaKey) && (e.key === "x" || e.key === "z")) { e.preventDefault(); return; }
            } : undefined}
            onCut={flowMode ? (e) => e.preventDefault() : undefined}
            placeholder={isSong ? "Empieza a escribir tu letra..." : "Empieza a escribir tu poema..."}
            style={{ flex: 1, minHeight: "calc(100dvh - 130px)", padding: 10, border: "none", outline: "none", resize: "none", background: "transparent", color: textColor, fontFamily: "Montserrat,sans-serif", fontSize: dynamicFontSize, lineHeight: 1.8, caretColor: flowMode ? goldBright : gold, ...(isPoetry && currentNote.poetrySchema ? { whiteSpace: "pre", overflowX: "hidden", overflowWrap: "normal", wordBreak: "normal" } : {}) }} />
          {isPoetry && poetryAnalysis && !flowMode && POETRY_SCHEMAS[currentNote.poetrySchema]?.rhyme && (
            <div style={{ width: 24, padding: "8px 1px", flexShrink: 0, borderLeft: `1px solid ${borderColor}` }}>
              {poetryAnalysis.map((la, i) => {
                if (la.isBreak) return <div key={i} style={{ height: `${dynamicFontSize * 1.8}px` }} />;
                if (la.overflow) return <div key={i} style={{ height: `${dynamicFontSize * 1.8}px`, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 9, color: "#FF0000", fontWeight: 700 }}>+</span></div>;
                const rp = POETRY_SCHEMAS[currentNote.poetrySchema].rhyme.replace(/\s/g, "");
                const ml = rp[la.verseInStanza % rp.length] || "-";
                const ms = poetryAnalysis.filter((m, j) => j !== i && !m.isBreak && m.stanzaIndex === la.stanzaIndex && (rp[m.verseInStanza % rp.length] || "-") === ml);
                const hr = ml === "-" || ms.some(m => la.rhymeEnd.length > 1 && m.rhymeEnd.length > 1 && la.rhymeEnd.slice(-2) === m.rhymeEnd.slice(-2));
                const c = ml === "-" ? textMuted : (hr ? "#00FF00" : (la.rhymeEnd ? "#FFA500" : "#FF0000"));
                return <div key={i} style={{ height: `${dynamicFontSize * 1.8}px`, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 9, color: c, fontWeight: 700 }}>{ml !== "-" ? ml : "·"}</span></div>;
              })}
            </div>
          )}
        </div>

        {isSong && repetitions.length > 0 && !flowMode && (() => {
          const nonChorus = repetitions.filter(r => !r.isChorus);
          const chorus = repetitions.filter(r => r.isChorus);
          const showing = [...nonChorus.slice(0, 3), ...chorus.slice(0, 1)];
          if (!showing.length) return null;
          return (
            <div style={{ padding: "6px 8px", background: `${goldBright}08`, borderTop: `1px solid ${borderColor}` }}>
              <p style={{ color: gold, fontSize: 9, fontWeight: 700, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.8 }}>Repeticiones</p>
              {showing.map((r, i) => {
                const isChorus = r.isChorus;
                const col = isChorus ? "#4ECDC4" : r.type === "near" ? "#FF9F43" : r.type === "anaphora" ? "#9B59B6" : goldBright;
                const what = isChorus
                  ? `Estribillo repetido ${r.count}×`
                  : r.type === "near"
                  ? `Versos muy similares (${r.count}% parecido)`
                  : r.type === "anaphora"
                  ? `Inicio repetido en varios versos`
                  : `Verso idéntico ×${r.count}`;
                const preview = r.lines ? `"${r.lines[0]?.substring(0, 30)}${r.lines[0]?.length > 30 ? "…" : ""}"` : `"${r.line?.substring(0, 30)}${r.line?.length > 30 ? "…" : ""}"`;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 5, marginBottom: 2, padding: "2px 5px", background: `${col}10`, borderRadius: 3, borderLeft: `2px solid ${col}` }}>
                    <RepIcon type={r.type} color={col} size={9} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: col, fontSize: 9, fontWeight: 700 }}>{what}</span>
                      <span style={{ color: textFaint, fontSize: 9, marginLeft: 4 }}>{preview}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {showTechPanel && sp && (
          <div style={{ position: "fixed", top: 46, right: 0, width: "80%", maxWidth: 320, height: "calc(100vh - 46px)", background: bgPanel, borderLeft: `1px solid ${gold}33`, zIndex: 40, overflowY: "auto", padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ color: gold, fontSize: 13, fontWeight: 700, margin: 0 }}>Panel técnico</h3>
              <button onClick={() => setShowTechPanel(false)} style={{ ...bs, color: gold, fontSize: 18 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 12 }}>
              {[{ l: "Palabras", v: textStats.words }, { l: "Caracteres", v: textStats.chars }, { l: "Líneas", v: textStats.lines }, { l: "Únicas", v: textStats.uniqueWords }, { l: "Densidad", v: `${textStats.density}%` }].map(s => (
                <div key={s.l} style={{ background: bgCard2, borderRadius: 6, padding: 7 }}><div style={{ color: textMuted, fontSize: 9 }}>{s.l}</div><div style={{ color: gold, fontSize: 15, fontWeight: 700 }}>{s.v || 0}</div>{s.l === "Densidad" && textStats.chorusWords > 0 && <div style={{ color: "#4ECDC4", fontSize: 7, marginTop: 1 }}>excl. palabras rep. del estribillo</div>}</div>
              ))}
            </div>
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 6 }}>Repeticiones</h4>
              {!repetitions.length ? (
                <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 8px", background: bgCard2, borderRadius: 6 }}>
                  <CheckIcon color="#4ECDC4" size={11} />
                  <span style={{ color: "#4ECDC4", fontSize: 10 }}>Sin repeticiones detectadas</span>
                </div>
              ) : (() => {
                const groups = {
                  chorus:   repetitions.filter(r => r.isChorus && r.type === "block"),
                  block:    repetitions.filter(r => !r.isChorus && r.type === "block"),
                  near:     repetitions.filter(r => r.type === "near"),
                  anaphora: repetitions.filter(r => r.type === "anaphora"),
                  line:     repetitions.filter(r => r.type === "line"),
                };
                const sections = [
                  {
                    key: "chorus", color: "#4ECDC4", label: "✓ Estribillos",
                    desc: "Secciones que se repiten de forma estructural (normal en una canción).",
                    renderItem: r => {
                      const firstLine = r.lines?.[0] || r.line;
                      return `${r.line?.match(/^\[/) ? r.line : `"${firstLine?.substring(0,32)}…"`}  ×${r.count}`;
                    }
                  },
                  {
                    key: "block", color: goldBright, label: "⚠ Bloques duplicados",
                    desc: "Grupos de varios versos que se repiten casi igual. Puede ser intencional (variación de estribillo) o un descuido.",
                    renderItem: r => {
                      const firstLine = r.lines?.[0] || "";
                      const sim = r.sim ? ` (~${Math.round(r.sim*100)}% igual)` : ` ×${r.count}`;
                      return `"${firstLine.substring(0,30)}${firstLine.length>30?"…":""}"${sim}`;
                    }
                  },
                  {
                    key: "near", color: "#FF9F43", label: "≈ Versos muy similares",
                    desc: "Dos versos con palabras casi idénticas pero no exactamente iguales. Revisa si la variación es intencionada.",
                    renderItem: r => {
                      const parts = r.line?.split(" / ");
                      const a = parts?.[0]?.substring(0,22) || "";
                      const b = parts?.[1]?.substring(0,22) || "";
                      return `"${a}…" ≈ "${b}…"  (${r.count}% parecido)`;
                    }
                  },
                  {
                    key: "anaphora", color: "#9B59B6", label: "↩ Anáforas",
                    desc: "El mismo inicio de verso se repite en varias líneas. Recurso expresivo muy válido en canciones.",
                    renderItem: r => {
                      const clean = r.line?.replace(" leitmotiv","").replace(/^"/,"").replace(/"$/,"");
                      return `Inicio "${clean?.substring(0,32)}"  ×${r.count}`;
                    }
                  },
                  {
                    key: "line", color: "#6B8FFF", label: "= Versos idénticos sueltos",
                    desc: "Versos exactamente iguales que no forman parte de un estribillo reconocido.",
                    renderItem: r => `"${r.line?.substring(0,36)}${r.line?.length>36?"…":""}"  ×${r.count}`
                  },
                ];
                return sections.map(s => {
                  const items = groups[s.key];
                  if (!items.length) return null;
                  return (
                    <div key={s.key} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                        <RepIcon type={s.key === "chorus" ? "block" : s.key === "line" ? "line" : s.key} color={s.color} size={10} />
                        <span style={{ color: s.color, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{s.label}</span>
                      </div>
                      <p style={{ color: textFaint, fontSize: 9, lineHeight: 1.5, margin: "0 0 4px 0", paddingLeft: 15 }}>{s.desc}</p>
                      {items.map((r, i) => (
                        <div key={i} style={{ fontSize: 9, marginBottom: 2, padding: "3px 7px 3px 10px", background: `${s.color}10`, borderRadius: 4, borderLeft: `2px solid ${s.color}`, color: s.color, lineHeight: 1.4 }}>
                          {s.renderItem(r)}
                        </div>
                      ))}
                    </div>
                  );
                });
              })()}
            </div>
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 4 }}>Clichés</h4>
              {!cliches.length ? <p style={{ color: "#4ECDC4", fontSize: 10, display: "flex", alignItems: "center" }}><CheckIcon /> Sin clichés</p> : cliches.map((c, i) => <div key={i} style={{ color: "#FFA500", fontSize: 10, marginBottom: 2, padding: "2px 5px", background: "#FFA50010", borderRadius: 3, display: "flex", alignItems: "center" }}><WarnIcon /> "{c}"</div>)}
            </div>
            {/* Syllable counter - all note types */}
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 4 }}>Contador de sílabas</h4>
              {(() => {
                const lines = (currentNote?.content || "").split("\n").filter(l => l.trim() && !TAG_RE.test(l.trim()));
                if (!lines.length) return <p style={{ color: textMuted, fontSize: 10 }}>Sin versos</p>;
                const syllCounts = lines.map(l => countSyllables(l));
                const totalSylls = syllCounts.reduce((s, n) => s + n, 0);
                const avgSylls = totalSylls / lines.length;
                // Free-verse variance analysis (only for poetry with no schema or verso libre)
                const isFreeVerse = isPoetry && (!currentNote.poetrySchema || currentNote.poetrySchema === "Verso libre");
                let variance_sv = 0, stdDev_sv = 0, minSylls = 0, maxSylls = 0, rhythmLabel = "";
                if (isFreeVerse && lines.length >= 3) {
                  variance_sv = syllCounts.reduce((s, n) => s + Math.pow(n - avgSylls, 2), 0) / syllCounts.length;
                  stdDev_sv = Math.sqrt(variance_sv);
                  minSylls = Math.min(...syllCounts);
                  maxSylls = Math.max(...syllCounts);
                  if (stdDev_sv <= 1.5) rhythmLabel = "Muy regular";
                  else if (stdDev_sv <= 3) rhythmLabel = "Regular";
                  else if (stdDev_sv <= 5) rhythmLabel = "Libre moderado";
                  else rhythmLabel = "Muy libre";
                }
                return (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, padding: "4px 6px", background: bgCard2, borderRadius: 5 }}>
                      <span style={{ color: textMuted, fontSize: 10 }}>Total sílabas</span>
                      <span style={{ color: gold, fontSize: 12, fontWeight: 700 }}>{totalSylls}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, padding: "4px 6px", background: bgCard2, borderRadius: 5 }}>
                      <span style={{ color: textMuted, fontSize: 10 }}>Media por verso</span>
                      <span style={{ color: gold, fontSize: 12, fontWeight: 700 }}>{avgSylls.toFixed(1)}</span>
                    </div>
                    {isFreeVerse && lines.length >= 3 && (<>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, padding: "4px 6px", background: bgCard2, borderRadius: 5 }}>
                        <span style={{ color: textMuted, fontSize: 10 }}>Rango (mín – máx)</span>
                        <span style={{ color: gold, fontSize: 11, fontWeight: 700 }}>{minSylls} – {maxSylls}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, padding: "4px 6px", background: `${gold}15`, borderRadius: 5, border: `1px solid ${gold}30` }}>
                        <span style={{ color: textMuted, fontSize: 10 }}>Ritmo del verso libre</span>
                        <span style={{ color: gold, fontSize: 10, fontWeight: 700 }}>{rhythmLabel}</span>
                      </div>
                      <p style={{ color: textFaint, fontSize: 9, lineHeight: 1.5, marginBottom: 6 }}>
                        {stdDev_sv <= 1.5 && "Los versos tienen longitud muy similar. El poema suena uniforme y contenido."}
                        {stdDev_sv > 1.5 && stdDev_sv <= 3 && "Hay cierta variación controlada. Buen equilibrio entre libertad y cohesión."}
                        {stdDev_sv > 3 && stdDev_sv <= 5 && "Variación notable. El ritmo oscila deliberadamente: revisa que los contrastes sean intencionales."}
                        {stdDev_sv > 5 && "Variación muy alta. Los versos varían mucho en extensión: puede ser una elección expresiva o dispersión no intencional."}
                      </p>
                    </>)}
                    <div style={{ maxHeight: 140, overflowY: "auto" }}>
                      {lines.map((l, i) => {
                        const sc = syllCounts[i];
                        const isOutlier = isFreeVerse && lines.length >= 3 && Math.abs(sc - avgSylls) > stdDev_sv * 1.8;
                        return (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, padding: "3px 4px", borderBottom: `1px solid ${borderSoft}` }}>
                            <span style={{ color: textMuted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>
                              <span style={{ color: textFaint, marginRight: 4 }}>{i + 1}.</span>{l.trim()}
                            </span>
                            <span style={{ color: isOutlier ? "#FF9F43" : gold, fontWeight: 700, fontSize: 11, minWidth: 24, textAlign: "right" }} title={isOutlier ? "Verso con longitud inusual respecto al conjunto" : ""}>{sc}</span>
                          </div>
                        );
                      })}
                    </div>
                    {isFreeVerse && lines.length >= 3 && <p style={{ color: textFaint, fontSize: 8, marginTop: 4 }}>Números en naranja: versos con longitud inusual respecto al conjunto.</p>}
                  </div>
                );
              })()}
            </div>
            {isPoetry && poetryAnalysis && (
              <div>
                <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 4 }}>Métrica</h4>
                {(() => { let vn = 0; return poetryAnalysis.map((la, i) => {
                  if (la.isBreak) return <div key={i} style={{ height: 6, borderBottom: `1px dashed ${borderSoft}`, marginBottom: 2 }} />;
                  vn++;
                  return <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "2px 0", borderBottom: `1px solid ${borderSoft}` }}><span style={{ color: textMuted }}>V{vn}: {la.line.substring(0, 20)}…</span><span style={{ color: la.ok ? "#4ECDC4" : "#FF4444", fontWeight: 600 }}>{la.syllables}s</span></div>;
                }); })()}
              </div>
            )}
          </div>
        )}

        {sp && <button onClick={() => setShowEmotionPanel(e => !e)} style={{ position: "fixed", bottom: 16, left: 12, width: 50, height: 50, borderRadius: "50%", background: `radial-gradient(circle at 30% 30%, ${goldBright}, ${gold})`, border: "none", cursor: "pointer", boxShadow: `0 0 12px ${gold}44, 0 0 25px ${gold}22`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>}

        {showEmotionPanel && sp && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: bgPanel, borderTop: `2px solid ${gold}`, zIndex: 45, padding: 12, maxHeight: "60vh", overflowY: "auto", borderRadius: "14px 14px 0 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ color: gold, fontSize: 12, fontWeight: 700, margin: 0 }}>Panel emocional</h3>
              <button onClick={() => setShowEmotionPanel(false)} style={{ ...bs, color: gold, fontSize: 18 }}>×</button>
            </div>
            <EmotionCurve data={emotionData} width={350} height={180} id="ed" isDark={darkMode} />
            {emotionData.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {/* Global emotion distribution */}
                {emotionData[0]?.globalPcts && (
                  <div style={{ marginBottom: 10 }}>
                    <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 5 }}>Distribución emocional</h4>
                    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
                      {Object.entries(emotionData[0].globalPcts).filter(([,v]) => v > 0.02).sort((a,b) => b[1]-a[1]).map(([e, pct]) => (
                        <div key={e} style={{ width: `${pct * 100}%`, background: EMOTION_COLORS[e] || gold, minWidth: pct > 0.03 ? 4 : 0 }} title={`${EMOTION_LABELS[e]}: ${(pct*100).toFixed(0)}%`} />
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {Object.entries(emotionData[0].globalPcts).filter(([,v]) => v > 0.02).sort((a,b) => b[1]-a[1]).map(([e, pct]) => (
                        <span key={e} style={{ fontSize: 9, color: EMOTION_COLORS[e] || textMuted }}>● {EMOTION_LABELS[e]} {(pct*100).toFixed(0)}%</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Emotional shifts */}
                {emotionData[0]?.shifts?.length > 0 && (
                  <div style={{ marginBottom: 10, padding: "6px 8px", background: `${gold}0A`, borderRadius: 6, border: `1px solid ${gold}22` }}>
                    <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 4 }}>Giros emocionales</h4>
                    {emotionData[0].shifts.map((sh, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, marginBottom: 2 }}>
                        <span style={{ color: textMuted }}>B{sh.block}:</span>
                        <span style={{ color: EMOTION_COLORS[sh.from] || textMuted }}>{EMOTION_LABELS[sh.from]}</span>
                        <span style={{ color: textMuted }}>→</span>
                        <span style={{ color: EMOTION_COLORS[sh.to] || textMuted }}>{EMOTION_LABELS[sh.to]}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Block detail */}
                <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 4 }}>Detalle por bloque</h4>
                {emotionData.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3, fontSize: 10 }}>
                    <span style={{ color: textMuted, minWidth: 28, fontSize: 9 }}>{d.tag || `B${i + 1}`}</span>
                    <div style={{ flex: 1, height: 6, background: borderSoft, borderRadius: 3, overflow: "hidden", position: "relative" }}>
                      <div style={{ width: `${d.intensity * 100}%`, height: "100%", background: `linear-gradient(90deg, ${EMOTION_COLORS[d.dominant] || gold}CC, ${EMOTION_COLORS[d.dominant] || goldBright})`, borderRadius: 3 }} />
                    </div>
                    <span style={{ color: EMOTION_COLORS[d.dominant] || gold, minWidth: 48, textAlign: "right", fontSize: 9, fontWeight: 600 }}>{EMOTION_LABELS[d.dominant] || d.dominant}</span>
                    {d.secondary && d.dominantRatio < 0.7 && <span style={{ color: EMOTION_COLORS[d.secondary] || textMuted, fontSize: 8, minWidth: 20 }}>+{(EMOTION_LABELS[d.secondary] || d.secondary).slice(0,3)}</span>}
                    <span style={{ color: "#FF9F43", minWidth: 28, textAlign: "right", fontSize: 9 }}>T:{d.tension.toFixed(2)}</span>
                    <span style={{ color: "#4ECDC4", minWidth: 28, textAlign: "right", fontSize: 9 }}>A:{d.affective.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Flow mode footer */}
        {flowMode && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "6px 16px", background: bgDeep, borderTop: `1px solid ${gold}22`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, zIndex: 40 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            <span style={{ color: textMuted, fontFamily: "Montserrat,sans-serif", fontSize: 10 }}>Solo escritura — no se puede borrar</span>
          </div>
        )}
      </div>
    );
  };
  const CompareScreen = () => {
    if (!compareNotes) return null;
    const { a, b } = compareNotes;
    const lA = a.content.split("\n"), lB = b.content.split("\n");
    const maxL = Math.max(lA.length, lB.length);
    const eA = analyzeEmotion(a.content, a.type === "song", a.type === "poetry"), eB = analyzeEmotion(b.content, b.type === "song", b.type === "poetry");
    const wA = a.content.trim().split(/\s+/).filter(w => w), wB = b.content.trim().split(/\s+/).filter(w => w);
    const uA = new Set(wA.map(w => w.toLowerCase())), uB = new Set(wB.map(w => w.toLowerCase()));
    const repsA = detectRepetitions(a.content, a.type === "song"), repsB = detectRepetitions(b.content, b.type === "song");
    const cwA = repsA.chorusWordCount || 0, cwB = repsB.chorusWordCount || 0;
    const effA = a.type === "song" && cwA > 0 ? Math.max(wA.length - cwA, uA.size) : wA.length;
    const effB = b.type === "song" && cwB > 0 ? Math.max(wB.length - cwB, uB.size) : wB.length;
    const sA = { w: wA.length, c: a.content.length, l: lA.filter(l => l.trim()).length, d: effA > 0 ? (uA.size / effA * 100).toFixed(1) : 0, r: repsA.length };
    const sB = { w: wB.length, c: b.content.length, l: lB.filter(l => l.trim()).length, d: effB > 0 ? (uB.size / effB * 100).toFixed(1) : 0, r: repsB.length };

    const changes = [];
    for (let i = 0; i < maxL; i++) { const la = lA[i] || "", lb = lB[i] || ""; if (la !== lb) changes.push({ line: i, type: !la ? "added" : !lb ? "removed" : "changed" }); }

    const lc = (la, lb, side) => {
      // Theme-aware diff colors: enough opacity to be visible in both light and dark
      const removedBg  = darkMode ? "rgba(220,60,60,0.22)"  : "rgba(200,40,40,0.13)";
      const addedBg    = darkMode ? "rgba(50,200,100,0.20)" : "rgba(30,140,70,0.13)";
      const removedFg  = darkMode ? "rgba(220,60,60,0.10)"  : "rgba(200,40,40,0.07)";
      const addedFg    = darkMode ? "rgba(50,200,100,0.10)" : "rgba(30,140,70,0.07)";
      const changedBg  = darkMode ? "rgba(220,180,40,0.18)" : "rgba(160,120,0,0.10)";
      if (side === "a") { if (la && !lb) return removedBg; if (!la && lb) return addedFg; }
      else { if (lb && !la) return addedBg; if (!lb && la) return removedFg; }
      if (la !== lb) return changedBg;
      return "transparent";
    };

    return (
      <div style={{ minHeight: "100vh", background: bg, fontFamily: "Montserrat,sans-serif" }}>
        <div style={{ background: bgDeep, padding: "7px 8px", display: "flex", alignItems: "center", gap: 6, borderBottom: `1px solid ${borderSoft}`, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => { setScreen("home"); setCompareNotes(null); }} style={bs}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <h2 style={{ color: gold, fontSize: 14, fontWeight: 700, margin: 0, flex: 1 }}>Comparador</h2>
          <button onClick={() => { const v = createVersion(a.id); if (v) { setToast("Versión creada: " + v.title); setCompareNotes({ a: v, b }); } }} style={{ padding: "3px 8px", background: gold, border: "none", color: "#000", borderRadius: 5, fontFamily: "Montserrat,sans-serif", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>+ Versión</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${borderSoft}` }}>
          <div style={{ padding: "5px 6px", borderRight: `1px solid ${borderSoft}`, background: darkMode ? "rgba(78,205,196,0.07)" : "rgba(10,122,112,0.06)" }}>
            <span style={{ color: darkMode ? "#4ECDC4" : "#0A7A70", fontSize: 10, fontWeight: 700 }}>{a.title}</span>
          </div>
          <div style={{ padding: "5px 6px", background: darkMode ? "rgba(255,107,107,0.07)" : "rgba(180,30,30,0.06)" }}>
            <span style={{ color: darkMode ? "#FF6B6B" : "#AA2020", fontSize: 10, fontWeight: 700 }}>{b.title}</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "35vh" }}>
          <div ref={scrollRefA} onScroll={handleScrollA} style={{ borderRight: `1px solid ${borderSoft}`, padding: 5, overflowY: "auto", height: "100%" }}>
            {Array.from({ length: maxL }).map((_, i) => <div key={i} style={{ display: "flex", fontSize: 10, background: lc(lA[i] || "", lB[i] || "", "a"), padding: "1px 3px", borderRadius: 2, marginBottom: 1 }}><span style={{ color: textColor, fontSize: 8, minWidth: 18, opacity: 0.3, marginRight: 2 }}>{i + 1}</span><span style={{ color: textColor }}>{lA[i] || " "}</span></div>)}
          </div>
          <div ref={scrollRefB} onScroll={handleScrollB} style={{ padding: 5, overflowY: "auto", height: "100%" }}>
            {Array.from({ length: maxL }).map((_, i) => <div key={i} style={{ display: "flex", fontSize: 10, background: lc(lA[i] || "", lB[i] || "", "b"), padding: "1px 3px", borderRadius: 2, marginBottom: 1 }}><span style={{ color: textColor, fontSize: 8, minWidth: 18, opacity: 0.3, marginRight: 2 }}>{i + 1}</span><span style={{ color: textColor }}>{lB[i] || " "}</span></div>)}
          </div>
        </div>

        {changes.length > 0 && (
          <div style={{ padding: "6px 8px", borderTop: `1px solid ${borderSoft}`, borderBottom: `1px solid ${borderSoft}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, margin: 0 }}>Navegación ({changes.length} cambios)</h4>
            <div style={{ display: "flex", gap: 8, fontSize: 8 }}>
              <span style={{ color: darkMode ? "#5DE89A" : "#1A7A43" }}>● añadido</span>
              <span style={{ color: darkMode ? "#FF7070" : "#B02020" }}>● eliminado</span>
              <span style={{ color: darkMode ? "#E8C840" : "#7A5A00" }}>● modificado</span>
            </div>
          </div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {changes.map((ch, i) => (
                <button key={i} onClick={() => { if (scrollRefA.current) scrollRefA.current.scrollTop = ch.line * 18; }} style={{ padding: "1px 6px", borderRadius: 3, border: "none", cursor: "pointer", fontSize: 9,
                  background: ch.type === "added" ? (darkMode ? "rgba(50,200,100,0.25)" : "rgba(30,140,70,0.15)") : ch.type === "removed" ? (darkMode ? "rgba(220,60,60,0.25)" : "rgba(200,40,40,0.15)") : (darkMode ? "rgba(210,170,40,0.25)" : "rgba(150,110,0,0.15)"),
                  color: ch.type === "added" ? (darkMode ? "#5DE89A" : "#1A7A43") : ch.type === "removed" ? (darkMode ? "#FF7070" : "#B02020") : (darkMode ? "#E8C840" : "#7A5A00")
                }}>L{ch.line + 1}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: 10, borderBottom: `1px solid ${gold}33` }}>
          <h4 style={{ color: gold, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Estadísticas</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 3, fontSize: 10 }}>
            {[{ l: "Palabras", a: sA.w, b: sB.w }, { l: "Caracteres", a: sA.c, b: sB.c }, { l: "Líneas", a: sA.l, b: sB.l }, { l: "Densidad", a: `${sA.d}%`, b: `${sB.d}%` }, { l: "Repeticiones", a: sA.r, b: sB.r }, { l: "Variación", a: (eA[0]?.variance || 0).toFixed(3), b: (eB[0]?.variance || 0).toFixed(3) }].map(r => (
              <Fragment key={r.l}>
                <div style={{ color: darkMode ? "#4ECDC4" : "#0A7A70", textAlign: "right", padding: "3px 6px 3px 0", fontWeight: 700, background: darkMode ? "rgba(78,205,196,0.08)" : "rgba(10,122,112,0.07)", borderRadius: "4px 0 0 4px" }}>{r.a}</div>
                <div style={{ color: darkMode ? "#AAA" : "#444", textAlign: "center", padding: "3px 8px", fontWeight: 500, background: darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}>{r.l}</div>
                <div style={{ color: darkMode ? "#FF8888" : "#AA2020", padding: "3px 0 3px 6px", fontWeight: 700, background: darkMode ? "rgba(255,107,107,0.08)" : "rgba(180,30,30,0.07)", borderRadius: "0 4px 4px 0" }}>{r.b}</div>
              </Fragment>
            ))}
          </div>
        </div>

        <div style={{ padding: 10 }}>
          <h4 style={{ color: gold, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Curvas emocionales</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            <div><p style={{ color: darkMode ? "#4ECDC4" : "#0A7A70", fontSize: 9, fontWeight: 600, marginBottom: 2 }}>{a.title}</p><EmotionCurve data={eA} width={180} height={120} showMarkers={false} id="ca" isDark={darkMode} /></div>
            <div><p style={{ color: darkMode ? "#FF6B6B" : "#AA2020", fontSize: 9, fontWeight: 600, marginBottom: 2 }}>{b.title}</p><EmotionCurve data={eB} width={180} height={120} showMarkers={false} id="cb" isDark={darkMode} /></div>
          </div>
        </div>
      </div>
    );
  };

  // ── SETTINGS ──
  const SettingsScreen = () => (
    <div style={{ minHeight: "100vh", background: bg, fontFamily: "Montserrat,sans-serif" }}>
      <div style={{ background: bgDeep, padding: "7px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => setScreen("home")} style={bs}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
        <h2 style={{ color: gold, fontSize: 16, fontWeight: 700, margin: 0 }}>Ajustes</h2>
      </div>
      <div style={{ padding: 14 }}>
        {[{ l: "Tema oscuro", v: darkMode, o: () => setDarkMode(d => !d) }, { l: "Modo enfoque permanente", v: focusPermanent, o: () => setFocusPermanent(f => !f) }].map(i => (
          <div key={i.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${borderColor}` }}>
            <span style={{ color: textColor, fontSize: 14 }}>{i.l}</span>
            <button onClick={i.o} style={{ width: 46, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative", background: i.v ? gold : borderColor }}><div style={{ width: 18, height: 18, borderRadius: "50%", background: darkMode ? "#EEE" : "#FFF", position: "absolute", top: 3, left: i.v ? 25 : 3, transition: "left 0.2s" }} /></button>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${borderColor}` }}>
          <span style={{ color: textColor, fontSize: 14 }}>Tamaño texto: {fontSize}pt</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setFontSize(s => Math.max(12, s - 2))} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${gold}`, background: "transparent", color: gold, fontSize: 16, cursor: "pointer" }}>−</button>
            <button onClick={() => setFontSize(s => Math.min(24, s + 2))} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${gold}`, background: "transparent", color: gold, fontSize: 16, cursor: "pointer" }}>+</button>
          </div>
        </div>

        {/* Sección Ayuda */}
        <p style={{ color: textMuted, fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 22, marginBottom: 8 }}>Ayuda</p>
        <button onClick={() => setScreen("guide")} style={{ width: "100%", padding: 11, borderRadius: 10, border: `1px solid ${gold}`, background: "transparent", color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Ver guía completa</button>
        <button onClick={() => { setActiveForm(null); setScreen("poetrylearn"); }} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 10, border: `1px solid ${gold}44`, background: "transparent", color: textMuted, fontFamily: "Montserrat,sans-serif", fontSize: 13, cursor: "pointer" }}>Aprendizaje de poesía</button>
      </div>
    </div>
  );

  // ── GUIDE ──
  const GuideScreen = () => {
    const tabs = [
      { id: "general", label: "General" },
      { id: "emocional", label: "Panel emocional" },
      { id: "tecnico", label: "Panel técnico" },
    ];
    const cardStyle = { marginBottom: 14, padding: 12, background: bgCard2, borderRadius: 8, borderLeft: `3px solid ${gold}` };
    const titleStyle = { margin: "0 0 5px", fontSize: 12, fontWeight: 700, color: gold };
    const textStyle = { margin: 0, color: textSub, fontSize: 11, lineHeight: 1.6 };
    const subStyle = { margin: "8px 0 4px", fontSize: 11, fontWeight: 600, color: goldBright };
    const detailStyle = { margin: "0 0 6px", color: textMuted, fontSize: 10, lineHeight: 1.55 };
    const metricCard = (color, label, desc) => (
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 3, flexShrink: 0 }} />
        <div><span style={{ color: textColor, fontSize: 11, fontWeight: 600 }}>{label}:</span> <span style={{ color: textMuted, fontSize: 10 }}>{desc}</span></div>
      </div>
    );

    return (
      <div style={{ minHeight: "100vh", background: bg, fontFamily: "Montserrat,sans-serif", color: gold }}>
        <div style={{ background: bgDeep, padding: "7px 8px", display: "flex", alignItems: "center", gap: 8, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => setScreen("settings")} style={bs}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <h2 style={{ color: gold, fontSize: 16, fontWeight: 700, margin: 0 }}>Guía completa</h2>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${borderColor}`, background: bgCard }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setGuideTab(tab.id)} style={{
              flex: 1, padding: "10px 8px", border: "none", cursor: "pointer",
              background: guideTab === tab.id ? bgCard2 : "transparent",
              color: guideTab === tab.id ? gold : textMuted,
              fontFamily: "Montserrat,sans-serif", fontSize: 12, fontWeight: guideTab === tab.id ? 700 : 400,
              borderBottom: guideTab === tab.id ? `2px solid ${gold}` : "2px solid transparent",
              transition: "all 0.2s"
            }}>{tab.label}</button>
          ))}
        </div>

        <div style={{ padding: 14, lineHeight: 1.7, fontSize: 12 }}>

          {/* ── GENERAL TAB ── */}
          {guideTab === "general" && (<>
            {[
              { t: "Crear notas", d: "Pulsa el botón + dorado en la parte inferior para crear un nuevo poema o una letra de canción. Un panel modal te deja elegir entre ambos tipos." },
              { t: "Letras de canción", d: "Usa las etiquetas estructurales [Intro], [Verso], [Pre-estribillo], [Estribillo], [Puente] y [Outro]. Se insertan automáticamente y el cursor se coloca debajo. Los bloques repetidos se detectan y resaltan en dorado claro." },
              { t: "Poesía", d: "Selecciona entre 7 tipos: Cuarteto, Lira, Soneto, Romance, Redondilla, Décima o Verso libre. Cada tipo carga su esquema métrico. El contador de sílabas aparece a la izquierda (rojo = exceso) y el control de rima a la derecha (verde = correcta, naranja = advertencia, rojo = incumplida). Puedes ignorar las advertencias." },
              { t: "Panel técnico", d: "Flecha dorada en la esquina superior derecha. Muestra: palabras, caracteres, líneas, palabras únicas, densidad léxica, contador de sílabas por verso (con total y media), resaltado de repeticiones, detector de clichés y análisis métrico completo para poesía." },
              { t: "Modo flujo", d: "Accede desde el menú ☰ en la pantalla principal. Elige una nota existente o crea una nueva. Solo puedes añadir texto, no borrar (backspace y delete están bloqueados). El temporizador cuenta tu tiempo de escritura. Pulsa el número para editar el tiempo. Pulsa la X roja para terminar la sesión." },
              { t: "Modo enfoque", d: "Mantén pulsado el título de la nota 2 segundos. La interfaz se simplifica al máximo. Se puede activar permanentemente en Ajustes." },
              { t: "Comparador de versiones", d: "Selecciona 2 notas (mantén pulsado para activar selección múltiple) y pulsa Comparar. Vista dividida con scroll sincronizado, resaltado de diferencias (verde = añadido, rojo = eliminado, amarillo = cambio parcial), panel de navegación de cambios, estadísticas comparativas y doble curva emocional." },
              { t: "Versiones", d: "Crea versiones desde el icono del reloj en el editor, desde selección múltiple o desde el botón + Versión del comparador. Los nombres son limpios y secuenciales (v1, v2, v3…)." },
              { t: "Compartir", d: "Icono de compartir en el editor para nota individual, o botón Compartir en selección múltiple para enviar varias notas a la vez." },
            ].map((s, i) => (
              <div key={i} style={cardStyle}>
                <h4 style={titleStyle}>{s.t}</h4>
                <p style={textStyle}>{s.d}</p>
              </div>
            ))}
          </>)}

          {/* ── EMOTIONAL ANALYSIS TAB ── */}
          {guideTab === "emocional" && (<>
            {/* Overview */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>¿Qué es el análisis emocional?</h4>
              <p style={textStyle}>
                El análisis emocional examina tu texto automáticamente y genera una visualización del arco emocional de tu obra. Detecta palabras clave asociadas a seis emociones fundamentales y calcula métricas que te ayudan a entender la estructura emocional de lo que escribes. Se accede pulsando la bola dorada flotante en la esquina inferior izquierda del editor.
              </p>
            </div>

            {/* How it splits blocks */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>Detección automática de bloques</h4>
              <p style={textStyle}>
                El sistema divide tu texto en bloques para analizar cada sección por separado:
              </p>
              <p style={subStyle}>En letras de canción</p>
              <p style={detailStyle}>Detecta las etiquetas [Intro], [Verso], [Estribillo], [Pre-estribillo], [Puente] y [Outro]. Cada sección etiquetada se convierte en un bloque independiente con su nombre visible en la curva.</p>
              <p style={subStyle}>En poesía</p>
              <p style={detailStyle}>Separa bloques por párrafos (doble salto de línea). Si no hay párrafos, agrupa cada 4 versos automáticamente. Si el texto es muy corto, agrupa cada 2 versos. Así siempre se genera una curva útil.</p>
            </div>

            {/* The 6 emotions */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>Las 6 emociones detectadas</h4>
              <p style={{ ...detailStyle, marginBottom: 10 }}>Cada bloque se analiza buscando palabras clave asociadas a estas emociones. La emoción con más coincidencias se muestra como la «dominante» del bloque:</p>
              {metricCard("#FFD700", "Alegría (joy)", "Palabras como alegría, feliz, gozo, júbilo, reír, dicha, euforia, celebrar, bailar, placer, radiante, vibrante, luz, sol, brillo, destello, esplendor, canta, libre, vuelo, cielo, infinito, paraíso, gloria, triunfo, victoria.")}
              {metricCard("#E74C3C", "Tristeza (sadness)", "Palabras como triste, melancolía, llorar, llanto, lágrima, dolor, sufrir, pena, aflicción, angustia, soledad, abandono, ausente, vacío, hueco, nada, nadie, jamás, muerto, oscuridad, sombra, frío, ceniza, olvido, nostalgia, añoro, recuerdo.")}
              {metricCard("#FF6B6B", "Ira (anger)", "Palabras como furia, rabia, odio, ira, cólera, indignación, rebelde, grito, explota, rompe, destruye, devasta, golpea, guerra, batalla, lucha, pelea, violencia, venganza, rencor, desprecio, traición, engaño, mentira.")}
              {metricCard("#9B59B6", "Miedo (fear)", "Palabras como miedo, terror, pánico, pavor, temor, temblar, escalofrío, horror, espanto, amenaza, peligro, siniestro, abismo, caída, huye, atrapa, pesadilla, paralizado, indefenso, vulnerable, acorralado, delirio, locura.")}
              {metricCard("#FF69B4", "Amor (love)", "Palabras como amor, quiero, beso, abrazo, cariño, ternura, dulzura, adorar, pasión, íntimo, deseo, anhelo, fascinación, ardor, piel, labio, mirada, susurro, suspiro, latido, corazón, alma, juntos, contigo, siempre.")}
              {metricCard("#4ECDC4", "Esperanza (hope)", "Palabras como esperanza, ilusión, sueño, soñar, horizonte, amanecer, alba, aurora, renacer, resurge, mañana, futuro, cambio, florecer, semilla, camino, avanzar, persevera, fuerza, valentía, construir, transformar, paz, serenidad, calma.")}
            </div>

            {/* The narrative curve */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>La curva narrativa</h4>
              <p style={textStyle}>
                La curva dorada es el elemento central del análisis. El eje horizontal representa los bloques de tu texto (de izquierda a derecha), y el eje vertical muestra la intensidad emocional de cada bloque (de 0.0 a 1.0). La curva suave conecta los puntos con transiciones bezier para que visualices el flujo emocional de tu obra de un vistazo.
              </p>
              <p style={subStyle}>Línea de media (avg)</p>
              <p style={detailStyle}>Una línea punteada horizontal marca el nivel medio de intensidad emocional de toda la obra. Te ayuda a ver qué bloques están por encima o por debajo del promedio.</p>
              <p style={subStyle}>Relleno de área</p>
              <p style={detailStyle}>El degradado dorado bajo la curva te da una sensación visual inmediata de la «masa emocional» del texto — cuánta energía concentra tu obra en cada zona.</p>
            </div>

            {/* The 3 markers */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>Marcadores automáticos</h4>
              <p style={{ ...detailStyle, marginBottom: 10 }}>El sistema identifica y marca automáticamente tres puntos clave en la curva:</p>
              {metricCard("#FF6B6B", "CLÍMAX (rojo)", "El bloque con mayor intensidad emocional. Es el punto álgido de tu texto, donde la carga emocional es máxima. Se muestra con un círculo rojo grande y una etiqueta roja.")}
              {metricCard("#4ECDC4", "DÉBIL (turquesa)", "El bloque con menor intensidad emocional. Puede indicar un momento de calma intencionada o una zona que necesita más fuerza expresiva. Círculo turquesa con etiqueta.")}
              {metricCard("#FF9F43", "TENSIÓN (naranja)", "El bloque con mayor tensión narrativa, calculada a partir de las emociones de ira, miedo y tristeza combinadas. Si coincide con el clímax, no se muestra por separado. Círculo naranja con etiqueta inferior.")}
            </div>

            {/* The 6 metrics */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>Métricas numéricas</h4>
              <p style={{ ...detailStyle, marginBottom: 10 }}>Debajo de la curva se muestran seis métricas calculadas sobre el conjunto de la obra:</p>
              {metricCard(goldBright, "Intensidad media", "El promedio de intensidad emocional de todos los bloques. Un valor alto indica un texto emocionalmente denso; un valor bajo puede indicar un tono más contenido o neutro.")}
              {metricCard("#FF6B6B", "Pico máximo", "El valor de intensidad del bloque más intenso (el clímax). Te dice cuánto llega a subir la carga emocional.")}
              {metricCard("#4ECDC4", "Punto débil", "El valor de intensidad del bloque menos intenso. Si es muy bajo (cercano a 0), puede haber una zona que «se apaga» emocionalmente.")}
              {metricCard(gold, "Estabilidad", "Porcentaje de 0% a 100%. Mide cuánto varían las intensidades entre bloques. 100% = todos los bloques tienen la misma intensidad (texto plano). Valores bajos = emociones muy cambiantes con subidas y bajadas fuertes.")}
              {metricCard(gold, "Ritmo", "La media de los saltos de intensidad entre bloques consecutivos. Un ritmo alto indica cambios emocionales bruscos entre secciones; un ritmo bajo indica transiciones suaves y graduales.")}
              {metricCard(gold, "Bloques", "El número total de bloques analizados. En canciones coincide con las secciones etiquetadas; en poesía depende de los párrafos o agrupaciones automáticas.")}
            </div>

            {/* Detail per block */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>Detalle por bloque</h4>
              <p style={textStyle}>
                Debajo de las métricas, cada bloque se lista individualmente con:
              </p>
              <p style={subStyle}>Barra de intensidad</p>
              <p style={detailStyle}>Una barra dorada proporcional a la intensidad del bloque. Te permite comparar visualmente la carga emocional de cada sección.</p>
              <p style={subStyle}>Emoción dominante</p>
              <p style={detailStyle}>El nombre de la emoción más fuerte en ese bloque (joy, sadness, love, etc.), mostrado en dorado.</p>
              <p style={subStyle}>T: Tensión narrativa</p>
              <p style={detailStyle}>Valor de 0 a 1 mostrado en naranja. Combina las emociones de ira + miedo + tristeza. Un valor alto indica un momento de alta tensión dramática. Útil para identificar momentos de conflicto o drama en tu texto.</p>
              <p style={subStyle}>A: Carga afectiva</p>
              <p style={detailStyle}>Valor de 0 a 1 mostrado en turquesa. Combina amor + alegría + esperanza. Un valor alto indica un momento de alta carga positiva/afectiva. Útil para detectar las zonas más luminosas o tiernas de tu obra.</p>
            </div>

            {/* In comparator */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>En el comparador de versiones</h4>
              <p style={textStyle}>
                Cuando comparas dos notas, el análisis emocional genera una doble curva narrativa: una para cada versión, lado a lado. Esto te permite ver cómo ha cambiado el arco emocional entre versiones. La variación emocional de cada versión también aparece en las estadísticas comparativas, para que veas de un vistazo si una versión tiene más movimiento emocional que otra.
              </p>
            </div>

            {/* Tips */}
            <div style={{ ...cardStyle, borderLeftColor: "#4ECDC4" }}>
              <h4 style={{ ...titleStyle, color: "#4ECDC4" }}>Consejos de uso</h4>
              <p style={detailStyle}>• Si la curva es completamente plana, intenta variar la intensidad emocional entre secciones para crear un arco narrativo más interesante.</p>
              <p style={detailStyle}>• Si el punto DÉBIL coincide con una sección importante (como un estribillo), puede ser señal de que esa sección necesita más fuerza expresiva.</p>
              <p style={detailStyle}>• Una estabilidad muy alta (90-100%) puede indicar monotonía emocional. Un buen arco narrativo suele tener entre 30% y 70% de estabilidad.</p>
              <p style={detailStyle}>• En canciones, compara la tensión (T) del verso con la del estribillo: generalmente el estribillo debería tener más intensidad o más carga afectiva (A).</p>
              <p style={detailStyle}>• El análisis se actualiza en tiempo real mientras escribes, lo que te permite ver inmediatamente cómo cada palabra afecta al arco emocional.</p>
            </div>
          </>)}

          {/* ── TECHNICAL PANEL TAB ── */}
          {guideTab === "tecnico" && (<>
            <div style={cardStyle}>
              <h4 style={titleStyle}>¿Qué es el panel técnico?</h4>
              <p style={textStyle}>
                El panel técnico es una barra lateral deslizable que aparece desde la derecha al pulsar la flecha dorada en la esquina superior derecha del editor. Solo está disponible fuera del modo flujo y del modo enfoque. Reúne todas las herramientas de análisis textual y métrico en un solo lugar, sin interrumpir la escritura.
              </p>
            </div>

            <div style={cardStyle}>
              <h4 style={titleStyle}>Estadísticas generales</h4>
              <p style={textStyle}>La parte superior del panel muestra seis métricas de tu texto, actualizadas en tiempo real mientras escribes:</p>
              <p style={subStyle}>Palabras</p>
              <p style={detailStyle}>El número total de palabras del texto. Cuenta todos los tokens separados por espacios, excluyendo las líneas vacías.</p>
              <p style={subStyle}>Caracteres</p>
              <p style={detailStyle}>El número total de caracteres incluyendo espacios, signos de puntuación y saltos de línea. Útil para saber la extensión bruta del texto.</p>
              <p style={subStyle}>Líneas</p>
              <p style={detailStyle}>El número de versos o líneas con contenido real. Las líneas vacías no se cuentan. En letras de canción, las etiquetas como [Estribillo] tampoco se cuentan como líneas de texto.</p>
              <p style={subStyle}>Palabras únicas</p>
              <p style={detailStyle}>El número de palabras distintas que aparecen en el texto, sin contar repeticiones. Un valor alto indica mayor riqueza léxica.</p>
              <p style={subStyle}>Densidad léxica</p>
              <p style={detailStyle}>Porcentaje que resulta de dividir las palabras únicas entre el total de palabras. Un 100% significa que no hay ninguna repetición; valores bajos indican que ciertas palabras se repiten mucho. En poesía, una densidad entre 60% y 85% suele ser un buen equilibrio entre variedad y cohesión temática.</p>
            </div>

            <div style={cardStyle}>
              <h4 style={titleStyle}>Contador de sílabas</h4>
              <p style={textStyle}>
                Disponible para todos los tipos de nota (poesía y canción). Analiza cada verso individualmente y muestra:
              </p>
              <p style={subStyle}>Total de sílabas</p>
              <p style={detailStyle}>La suma de todas las sílabas del texto completo. Útil para comparar la «densidad fonética» entre distintas secciones o versiones de una misma obra.</p>
              <p style={subStyle}>Media por verso</p>
              <p style={detailStyle}>El promedio de sílabas por línea. Te da una referencia rápida de la extensión rítmica habitual de tu escritura en esa pieza.</p>
              <p style={subStyle}>Detalle verso a verso</p>
              <p style={detailStyle}>Una lista con el número de verso, el texto y la cuenta de sílabas de cada línea. Puedes desplazarla con scroll si el texto es largo. El contador usa un algoritmo específico para el español: tiene en cuenta diptongos, hiatos, sinéresis y sinalefa básica. Las palabras con acento en vocal fuerte o en «í/ú» tónica se tratan como hiatos. El resultado puede diferir ligeramente de un recuento manual según las licencias poéticas que uses.</p>
            </div>

            <div style={cardStyle}>
              <h4 style={titleStyle}>Detector de repeticiones</h4>
              <p style={textStyle}>
                Analiza el texto completo y clasifica automáticamente todas las repeticiones en cinco categorías distintas, cada una con su propio color e icono. El resultado aparece tanto en el panel técnico lateral como en una barra compacta debajo del editor (solo en modo canción).
              </p>

              <p style={subStyle}>✓ Estribillos <span style={{ color: "#4ECDC4" }}>(turquesa)</span></p>
              <p style={detailStyle}>Secciones de varios versos que se repiten de forma idéntica o casi idéntica a lo largo de la canción. Se muestran en turquesa porque son <strong>repeticiones esperadas y deseables</strong>: un estribillo que aparece 3 o 4 veces es señal de buena estructura. El número tras «×» indica cuántas veces aparece esa sección. Las etiquetas como [Estribillo] o [Verso] no cuentan como versos repetidos.</p>

              <p style={subStyle}>⚠ Bloques duplicados <span style={{ color: "#D4AF37" }}>(dorado)</span></p>
              <p style={detailStyle}>Grupos de dos o más versos consecutivos que aparecen repetidos en otro punto del texto pero que <strong>no corresponden a un estribillo identificado</strong>. Puede ser una variación deliberada de estribillo, un puente que se repite, o una duplicación accidental. Cuando dos bloques son casi iguales pero no idénticos, se muestra el porcentaje de similitud entre paréntesis.</p>

              <p style={subStyle}>≈ Versos muy similares <span style={{ color: "#FF9F43" }}>(naranja)</span></p>
              <p style={detailStyle}>Dos versos individuales que comparten la mayoría de sus palabras pero no son exactamente iguales (similitud ≥ 80%). El porcentaje indica cuán parecidos son. Útil para detectar variaciones de un verso que quizás quieras diferenciar más, o confirmar que la variación es intencional.</p>

              <p style={subStyle}>↩ Anáforas <span style={{ color: "#9B59B6" }}>(morado)</span></p>
              <p style={detailStyle}>El mismo fragmento de inicio (2 a 4 palabras) aparece en varias líneas distintas del texto. Es un recurso retórico muy frecuente en canciones («No puedo…», «No puedo…», «No puedo…»). Se muestra el fragmento inicial repetido y cuántas veces aparece. Una anáfora detectada no es un error: es una herramienta. Solo revísala si fue accidental.</p>

              <p style={subStyle}>= Versos idénticos sueltos <span style={{ color: "#6B8FFF" }}>(azul)</span></p>
              <p style={detailStyle}>Versos exactamente iguales que aparecen en distintos puntos del texto pero que no forman parte de ningún bloque ni estribillo reconocido. Son los más susceptibles de ser repeticiones involuntarias. El número indica cuántas veces aparece ese verso en total.</p>

              <p style={subStyle}>Cómo leer el panel en conjunto</p>
              <p style={detailStyle}>Lo turquesa es estructura: bien. Lo dorado y azul requiere tu atención: ¿es intencional o accidental? Lo naranja es una señal de variación que quizás quieras ampliar. Lo morado es casi siempre un recurso expresivo. Si no hay ninguna entrada, el detector muestra un icono de verificación verde.</p>
            </div>

            <div style={cardStyle}>
              <h4 style={titleStyle}>Detector de clichés</h4>
              <p style={textStyle}>
                Compara el texto con una biblioteca de expresiones poéticas muy desgastadas por el uso. Si alguna aparece en tu texto, se muestra con un icono de advertencia.
              </p>
              <p style={subStyle}>Lista de clichés detectados</p>
              <p style={detailStyle}>Incluye expresiones como «luz al final», «mariposas en el estómago», «mar de lágrimas», «corazón roto», «alma gemela», «contra viento y marea», «noche oscura del alma», «sin ti no soy nada», «a flor de piel», «perdido en tus ojos» y otras similares frecuentes en la escritura creativa popular.</p>
              <p style={subStyle}>Cómo usarlo</p>
              <p style={detailStyle}>La herramienta no prohíbe su uso: hay contextos en los que resignificar un cliché es precisamente el recurso. Pero si aparece una alerta, vale la pena preguntarse si esa expresión aporta algo propio o si puede sustituirse por una imagen más personal y original. Si no hay ningún cliché detectado, aparece un icono de verificación en turquesa.</p>
            </div>

            <div style={cardStyle}>
              <h4 style={titleStyle}>Análisis métrico (solo poesía)</h4>
              <p style={textStyle}>
                Cuando tienes una nota de tipo Poesía con un esquema seleccionado (Cuarteto, Lira, Soneto, etc.), el panel técnico añade una sección de análisis métrico completo:
              </p>
              <p style={subStyle}>Sílabas por verso vs. objetivo</p>
              <p style={detailStyle}>Para cada verso, muestra el conteo real y el número objetivo según el esquema elegido. Si la diferencia es de ±1 sílaba, se considera correcta (los poetas usan con frecuencia licencias como la sinalefa o la dialefa). Si el conteo se aleja más, el número aparece en rojo como advertencia.</p>
              <p style={subStyle}>Control de rima en el margen derecho</p>
              <p style={detailStyle}>Una columna de letras a la derecha del área de escritura muestra el esquema de rima esperado (A, B, a, b, etc.). Verde significa que la rima coincide con otra línea del mismo grupo; naranja indica que la terminación existe pero aún no coincide con ninguna otra; rojo indica que la rima no se cumple o que el verso está vacío. El carácter «·» (punto medio) se muestra en los versos que no tienen rima asignada según el esquema.</p>
              <p style={subStyle}>Contador de sílabas en el margen izquierdo</p>
              <p style={detailStyle}>Visible directamente en el editor, junto al área de escritura: muestra el número de sílabas de cada verso en tiempo real. El número aparece en rojo si no coincide con el objetivo del esquema seleccionado, y en blanco/gris si está dentro del rango correcto.</p>
            </div>

            <div style={cardStyle}>
              <h4 style={titleStyle}>Ritmo del verso libre (solo poesía)</h4>
              <p style={textStyle}>
                Cuando tienes una nota de tipo Poesía con esquema «Verso libre» o sin esquema seleccionado, el contador de sílabas añade un análisis de varianza rítmica:
              </p>
              <p style={subStyle}>Rango (mín – máx)</p>
              <p style={detailStyle}>El número de sílabas del verso más corto y el más largo del poema. Un rango amplio (ej. 2 – 18) indica que el texto alterna versos muy breves con versos extensos.</p>
              <p style={subStyle}>Ritmo del verso libre</p>
              <p style={detailStyle}>Una etiqueta que resume la variación de longitud entre versos: «Muy regular» (casi todos los versos tienen la misma longitud, desviación ≤ 1.5 sílabas), «Regular» (variación controlada, ≤ 3), «Libre moderado» (oscilación notable, ≤ 5) y «Muy libre» (variación alta, &gt; 5). No hay un valor mejor que otro: la etiqueta es descriptiva, no evaluativa.</p>
              <p style={subStyle}>Versos con longitud inusual</p>
              <p style={detailStyle}>En la lista verso a verso, los versos cuya longitud se aleja más de 1.8 desviaciones estándar respecto a la media aparecen con su número de sílabas en naranja. Son versos que rompen el patrón general del poema: puede ser un efecto expresivo deliberado (un verso muy corto para crear pausa, uno muy largo para acelerar) o una irregularidad no intencional que vale la pena revisar.</p>
            </div>

            <div style={cardStyle}>
              <h4 style={titleStyle}>Repeticiones en poesía</h4>
              <p style={textStyle}>
                En modo Poesía, el detector de repeticiones analiza tres tipos distintos:
              </p>
              <p style={subStyle}>Estrofas duplicadas</p>
              <p style={detailStyle}>Grupos de versos separados por líneas en blanco que aparecen idénticos en más de un punto del poema. A diferencia del modo canción, ninguna estrofa se considera «estribillo esperado»: toda duplicación en poesía se muestra como posible revisión.</p>
              <p style={subStyle}>Versos idénticos</p>
              <p style={detailStyle}>Versos sueltos que aparecen exactamente iguales (ignorando mayúsculas y puntuación) en distintos puntos del texto. Puede ser un leitmotiv intencional o una repetición accidental.</p>
              <p style={subStyle}>Anáforas</p>
              <p style={detailStyle}>El mismo fragmento de inicio (2 a 4 palabras) que se repite en tres o más versos distintos. La anáfora es uno de los recursos más comunes en la poesía en español y casi siempre es intencional. El detector solo la señala si aparece tres o más veces.</p>
            </div>

            <div style={{ ...cardStyle, borderLeftColor: "#4ECDC4" }}>
              <h4 style={{ ...titleStyle, color: "#4ECDC4" }}>Consejos de uso del panel técnico</h4>
              <p style={detailStyle}>• Usa la densidad léxica para detectar si estás sobreusando una misma palabra raíz. Si baja del 50%, considera introducir sinónimos o variaciones.</p>
              <p style={detailStyle}>• El contador de sílabas es una guía, no un árbitro. Usa las licencias poéticas (sinalefa, diéresis, hiato) con criterio propio: lo que importa es el efecto sonoro al leer en voz alta.</p>
              <p style={detailStyle}>• En verso libre, la etiqueta de ritmo («Muy regular», «Libre moderado»…) describe tu estilo, no lo juzga. Un poema con ritmo «Muy libre» puede ser exactamente lo que buscas.</p>
              <p style={detailStyle}>• Los clichés detectados en modo poesía son específicos de la escritura poética en español. Aparecen en una lista distinta a la del modo canción: expresiones como «desde que te vi pasar», «subir a la cima» o «ruinas que una vez fueron» son señales de que quizás puedas encontrar una imagen más propia.</p>
              <p style={detailStyle}>• Un detector de clichés con todas las alertas activas no es una mala nota, sino un primer borrador sin filtro. Los mejores textos a menudo empiezan con clichés y los superan en revisión.</p>
              <p style={detailStyle}>• En el modo comparador, los paneles técnicos de ambas versiones se muestran en las estadísticas comparativas, lo que te permite ver de un vistazo si la densidad léxica o el número de clichés ha mejorado entre versiones.</p>
              <p style={detailStyle}>• Para notas muy largas, el panel técnico sigue analizando el texto completo aunque no se muestre todo en pantalla. El scroll dentro de la lista de sílabas te permite navegar verso a verso.</p>
            </div>
          </>)}
        </div>
      </div>
    );
  };

  // ── POETRY LEARNING ──
  const PoetryLearnScreen = () => {
    const forms = [
      { name:"Haiku", origin:"Japón · s. XVII", icon:"✿", summary:"La forma poética más breve y contemplativa. Captura un instante de la naturaleza o una emoción efímera en tres versos.", structure:"3 versos · 5 — 7 — 5 sílabas · sin rima", rules:["El primer verso establece el contexto o escenario (5 sílabas).","El segundo verso amplía o profundiza la imagen (7 sílabas).","El tercero cierra con un giro, contraste o revelación (5 sílabas).","Suele incluir una referencia a la naturaleza o a una estación del año (kigo).","No usa rima ni métrica española convencional; el ritmo es visual y de imagen."], tips:"Evita las explicaciones: muestra, no cuentes. La fuerza del haiku está en lo que no se dice.", example:{ title:"Ejemplo", lines:["sobre el estanque,","una rana salta y cae:","silencio otra vez."] }, exampleNote:"5 — 7 — 5 sílabas · sin rima · imagen única" },
      { name:"Terceto", origin:"Italia · Renacimiento", icon:"▲", summary:"Estrofa de tres versos endecasílabos con rima encadenada. Base de la terza rima de Dante.", structure:"3 versos · 11 sílabas · rima ABA", rules:["Tres versos de once sílabas cada uno (endecasílabos).","Rima consonante en esquema ABA: el primer y tercer verso riman entre sí.","El verso central queda libre o enlaza con la siguiente estrofa (terza rima).","En la terza rima encadenada: ABA BCB CDC… el verso libre de cada estrofa rima con el primero y el tercero de la siguiente.","Admite variantes con versos de 7 sílabas (heptasílabos) en lugar de endecasílabos."], tips:"El verso central es el más poderoso: úsalo para la imagen más intensa o el giro emocional.", example:{ title:"Ejemplo", lines:["En medio del camino de la vida,","me encontré en una selva oscura y fría,","pues la senda derecha estaba perdida."] }, exampleNote:"11 sílabas · rima ABA · verso 1 y 3 riman en -ida" },
      { name:"Redondilla", origin:"España · s. XV", icon:"■", summary:"Una de las estrofas más populares de la lírica española. Cuatro versos octosílabos con rima abrazada.", structure:"4 versos · 8 sílabas · rima abba", rules:["Cuatro versos de ocho sílabas (octosílabos).","Rima consonante abrazada: el primero rima con el cuarto, el segundo con el tercero.","La rima es abba (minúsculas porque los versos son de arte menor, menos de 9 sílabas).","Muy usada en teatro clásico español (Lope de Vega, Calderón de la Barca).","El ritmo natural del octosílabo se adapta perfectamente al castellano hablado."], tips:"El cuarto verso tiene que sonar a cierre. Si el primero plantea una pregunta o imagen, el cuarto la responde o la redondea.", example:{ title:"Ejemplo", lines:["Amor es fuego escondido,","herida que duele y da vida,","camino sin otra salida,","nudo que no fue pedido."] }, exampleNote:"8 sílabas · rima abba · -ido / -ida / -ida / -ido" },
      { name:"Copla", origin:"España · tradición oral", icon:"♩", summary:"La estrofa del pueblo. Cuatro octosílabos donde solo riman los versos pares, en rima asonante. Corazón del flamenco y la canción popular.", structure:"4 versos · 8 sílabas · riman los pares (asonante)", rules:["Cuatro versos de ocho sílabas.","Solo riman el segundo y el cuarto verso, en rima asonante (solo las vocales de la última sílaba tónica coinciden).","Los versos primero y tercero quedan sueltos (sin rima).","La rima asonante es más suave y musical que la consonante.","Muy asociada al flamenco, la tonadilla y la canción popular andaluza."], tips:"La asonancia da libertad: no busques palabras que rimen exactamente, busca que las vocales finales suenen igual. 'pena' y 'tierra' son asonantes en e-a.", example:{ title:"Ejemplo", lines:["Tengo una pena tan grande","que no me cabe en el pecho,","y la llevo por el mundo","como un peso mal puesto."] }, exampleNote:"8 sílabas · rima asonante e-o en versos 2 y 4" },
      { name:"Cuarteto", origin:"Italia / España · Renacimiento", icon:"◈", summary:"Estrofa noble y equilibrada. Cuatro endecasílabos con rima abrazada. Primer bloque del soneto clásico.", structure:"4 versos · 11 sílabas · rima ABBA", rules:["Cuatro versos de once sílabas (endecasílabos).","Rima consonante abrazada: el primero rima con el cuarto (A), el segundo con el tercero (B).","Las mayúsculas indican arte mayor (más de 8 sílabas).","El soneto clásico se construye con dos cuartetos seguidos de dos tercetos.","El acento del endecasílabo suele caer en la 6.ª sílaba (acento rítmico principal)."], tips:"El cuarteto exige exactitud métrica. Cuenta las sílabas verso a verso y usa la sinalefa conscientemente para ajustar el cómputo.", example:{ title:"Ejemplo", lines:["¿Qué tengo yo que mi amistad procuras?","¿Qué interés se te sigue, Jesús mío,","que a mi puerta, cubierto de rocío,","pasas las noches del invierno a oscuras?"] }, exampleNote:"11 sílabas · rima ABBA · Lope de Vega" },
      { name:"Serventesio", origin:"Provenza · s. XII", icon:"✦", summary:"Cuatro endecasílabos con rima cruzada ABAB. Más dinámico que el cuarteto, con mayor sensación de movimiento.", structure:"4 versos · 11 sílabas · rima ABAB", rules:["Cuatro versos endecasílabos (11 sílabas).","Rima consonante cruzada o alterna: el primero rima con el tercero (A), el segundo con el cuarto (B).","El esquema ABAB crea un ritmo de alternancia que se siente más ágil que el ABBA del cuarteto.","Muy usado en la poesía del Romanticismo y el Modernismo hispanoamericano.","Puede encadenarse en estrofas ABAB CDCD… para componer poemas más largos."], tips:"Aprovecha la rima cruzada para crear diálogos internos entre los versos: el primero y el tercero pueden desarrollar una idea, el segundo y el cuarto otra.", example:{ title:"Ejemplo", lines:["Era un aire suave, de pausados giros;","el hada Harmonía ritmaba sus vuelos,","e iban frases vagas y tenues suspiros","entre los sollozos de los violoncelos."] }, exampleNote:"11 sílabas · rima ABAB · Rubén Darío" },
      { name:"Quintilla", origin:"España · s. XV–XVI", icon:"⬟", summary:"Cinco versos octosílabos con dos rimas distintas. Estrofa flexible que admite varios esquemas de rima.", structure:"5 versos · 8 sílabas · rima aabba (entre otras)", rules:["Cinco versos de ocho sílabas.","Solo se permiten dos rimas distintas entre los cinco versos.","No pueden rimar tres versos consecutivos.","El quinto verso no puede quedar suelto (sin rima).","Esquemas válidos: aabba, aabab, abaab, abbab, aabbb… entre otros."], tips:"La restricción de no tres versos seguidos con la misma rima obliga a variar el esquema y da más musicalidad al conjunto.", example:{ title:"Ejemplo", lines:["Recuerde el alma dormida,","avive el seso y despierte,","contemplando","cómo se pasa la vida,","cómo se viene la muerte."] }, exampleNote:"Jorge Manrique · esquema abbab · variante con pie quebrado" },
      { name:"Lira", origin:"Italia / España · s. XVI", icon:"♬", summary:"Combinación de cinco versos de 7 y 11 sílabas con rima aBabB. Garcilaso la introdujo en el español. Elegante y musical.", structure:"5 versos · 7-11-7-7-11 sílabas · rima aBabB", rules:["Alterna heptasílabos (7 sílabas) y endecasílabos (11 sílabas).","Esquema: 7a · 11B · 7a · 7b · 11B.","Los versos de 7 sílabas riman en minúsculas (a, b); los de 11 en mayúsculas (B).","El segundo y el quinto verso (los endecasílabos) comparten rima B.","Creada por Bernardo Tasso, popularizada en español por Garcilaso de la Vega."], tips:"El contraste de longitud entre el heptasílabo y el endecasílabo crea un ritmo ondulante muy particular. Deja los versos largos para las ideas principales.", example:{ title:"Ejemplo", lines:["Si de mi baja lira","tanto pudiese el son que en un momento","aplacase la ira","del animoso viento","y la furia del mar y el movimiento…"] }, exampleNote:"7a · 11B · 7a · 7b · 11B · Garcilaso de la Vega" },
      { name:"Sextilla", origin:"España · s. XVI", icon:"⬢", summary:"Seis versos octosílabos con rima ababcc. Estrofa narrativa muy usada en romances y poesía popular extensa.", structure:"6 versos · 8 sílabas · rima ababcc", rules:["Seis versos de ocho sílabas.","Rima ababcc: los cuatro primeros versos en rima cruzada, los dos últimos forman un pareado.","El pareado final (cc) funciona como cierre o remate de la estrofa.","Admite variantes en el esquema de rima (aabccb, aaabbb, etc.).","Muy usada en poesía épica y narrativa de los siglos de oro."], tips:"El pareado final tiene mucho peso: úsalo para la conclusión, la sentencia o el giro más memorable de la estrofa.", example:{ title:"Ejemplo", lines:["Fábulas son de poetas","las cosas que ellos fingieron,","cuyos versos e saetas","del tiempo huir no pudieron;","que hoy están ya tan secretas","como si nunca estuvieron."] }, exampleNote:"8 sílabas · rima ababcc · pareado de cierre" },
      { name:"Romance", origin:"España · s. XIV–XV", icon:"❧", summary:"La forma épica y narrativa más importante de la poesía española. Series de octosílabos donde solo riman los pares, con rima asonante uniforme en todo el poema.", structure:"Versos ilimitados · 8 sílabas · riman los pares (asonante)", rules:["Serie indeterminada de versos de ocho sílabas.","Los versos pares riman todos entre sí, en rima asonante, a lo largo de todo el romance.","Los versos impares quedan sueltos (sin rima).","La misma asonancia se mantiene de principio a fin del poema.","Surgió de la fragmentación de los cantares de gesta medievales."], tips:"La asonancia uniforme da cohesión al relato. Elige bien las vocales de tu rima: -a, -o y -a-o son las más comunes y musicales en romance.", example:{ title:"Ejemplo (fragmento)", lines:["Por el mes era de mayo,","cuando hace la calor,","cuando canta la calandria","y responde el ruiseñor,"] }, exampleNote:"8 sílabas · rima asonante -o-o en pares · Romancero anónimo" },
      { name:"Décima", origin:"España · s. XVI (Espinela)", icon:"◉", summary:"La 'Espinela', diez versos octosílabos con rima abbaaccddc. La más compleja y admirada de las estrofas de arte menor.", structure:"10 versos · 8 sílabas · rima abbaaccddc", rules:["Diez versos de ocho sílabas (octosílabos).","Rima consonante: abba · ac · cddc.","Los cuatro primeros forman una redondilla (abba).","El quinto verso enlaza con el sexto (ac) y con la segunda parte.","Los últimos cuatro forman otra redondilla invertida (cddc)."], tips:"La pausa interna más importante cae entre el cuarto y el quinto verso. El cuarto debe cerrar con cierta autonomía; el quinto abre una nueva dirección.", example:{ title:"Ejemplo", lines:["Aquí la envidia y mentira","me tuvieron encerrado.","Dichoso el humilde estado","del sabio que se retira","de aqueste mundo malvado,","y con pobre mesa y casa","en el campo deleitoso","con solo Dios se compasa","y a solas su vida pasa","ni envidiado ni envidioso."] }, exampleNote:"8 sílabas · rima abbaaccddc · Fray Luis de León" },
      { name:"Soneto", origin:"Italia · s. XIII (Sicilia)", icon:"◎", summary:"La forma poética más estudiada y admirada de la tradición occidental. Catorce endecasílabos en dos cuartetos y dos tercetos.", structure:"14 versos · 11 sílabas · ABBA ABBA + dos tercetos", rules:["Catorce versos endecasílabos (11 sílabas).","Dos cuartetos con rima abrazada ABBA ABBA: todos comparten las mismas dos rimas.","Dos tercetos con mayor libertad: CDC DCD, CDE CDE, o CDE DCE entre otros.","La división clásica: los cuartetos presentan el tema; los tercetos lo desarrollan o resuelven.","La 'volta' o giro conceptual suele producirse en el noveno verso (inicio de los tercetos)."], tips:"El verso 14 es el más importante del soneto: toda la tensión acumulada debe resolverse o intensificarse en él. Trabájalo hasta que sea perfecto.", example:{ title:"Ejemplo (Quevedo)", lines:["Cerrar podrá mis ojos la postrera","sombra que me llevare el blanco día,","y podrá desatar esta alma mía","hora a su afán ansioso lisonjera;","mas no, de esotra parte, en la ribera,","dejará la memoria en donde ardía:","nadar sabe mi llama la agua fría,","y perder el respeto a ley severa.","Alma a quien todo un dios prisión ha sido,","venas que humor a tanto fuego han dado,","médulas que han gloriosamente ardido,","su cuerpo dejarán, no su cuidado;","serán ceniza, mas tendrá sentido;","polvo serán, mas polvo enamorado."] }, exampleNote:"11 sílabas · ABBAABBA + CDC DCD · Francisco de Quevedo" },
    ];

    const cardBg = bgCard;
    const detBg  = bgCard2;
    const textC  = textColor;
    const mutC   = textMuted;
    const lineC  = borderColor;

    return (
      <div style={{ minHeight: "100vh", background: bg, fontFamily: "Montserrat,sans-serif" }}>
        <div style={{ background: bgDeep, padding: "7px 8px", display: "flex", alignItems: "center", gap: 8, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => { setActiveForm(null); setScreen("settings"); }} style={bs}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <h2 style={{ color: gold, fontSize: activeForm ? 15 : 16, fontWeight: 700, margin: 0, flex: 1 }}>{activeForm ? activeForm.name : "Aprendizaje de poesía"}</h2>
        </div>

        {!activeForm ? (
          <div style={{ padding: "12px 14px 80px" }}>
            <p style={{ color: mutC, fontSize: 11, lineHeight: 1.6, marginBottom: 16 }}>Explora las formas clásicas de la poesía en español. Pulsa cualquier forma para descubrir su estructura, reglas y un ejemplo real.</p>
            {forms.map(f => (
              <button key={f.name} onClick={() => setActiveForm(f)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 8, background: cardBg, border: `1px solid ${lineC}`, borderRadius: 12, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 22, width: 32, textAlign: "center", flexShrink: 0, color: gold }}>{f.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 13, fontWeight: 700 }}>{f.name}</div>
                  <div style={{ color: mutC, fontFamily: "Montserrat,sans-serif", fontSize: 10, marginTop: 1 }}>{f.structure}</div>
                  <div style={{ color: textC, fontFamily: "Montserrat,sans-serif", fontSize: 10, marginTop: 3, opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.summary}</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ padding: "14px 14px 80px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 36, color: gold }}>{activeForm.icon}</span>
              <div>
                <h3 style={{ color: gold, fontSize: 18, fontWeight: 700, margin: 0 }}>{activeForm.name}</h3>
                <span style={{ color: mutC, fontSize: 10 }}>{activeForm.origin}</span>
              </div>
            </div>
            <p style={{ color: textC, fontSize: 12, lineHeight: 1.7, marginBottom: 16 }}>{activeForm.summary}</p>
            <div style={{ background: `${gold}15`, border: `1px solid ${gold}44`, borderRadius: 8, padding: "8px 12px", marginBottom: 16, display: "inline-block" }}>
              <span style={{ color: gold, fontSize: 11, fontWeight: 600, fontFamily: "monospace" }}>{activeForm.structure}</span>
            </div>
            <div style={{ background: detBg, borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <p style={{ color: gold, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 10px" }}>Reglas</p>
              {activeForm.rules.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <span style={{ color: gold, fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                  <p style={{ color: textC, fontSize: 11, lineHeight: 1.6, margin: 0 }}>{r}</p>
                </div>
              ))}
            </div>
            <div style={{ background: "#4ECDC415", border: "1px solid #4ECDC444", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
              <p style={{ color: "#4ECDC4", fontSize: 10, fontWeight: 700, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 1 }}>Consejo</p>
              <p style={{ color: textC, fontSize: 11, lineHeight: 1.6, margin: 0 }}>{activeForm.tips}</p>
            </div>
            <div style={{ background: detBg, borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <p style={{ color: gold, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 10px" }}>{activeForm.example.title}</p>
              <div style={{ borderLeft: `3px solid ${gold}`, paddingLeft: 12 }}>
                {activeForm.example.lines.map((l, i) => (
                  <p key={i} style={{ color: textC, fontSize: 12, lineHeight: 1.8, margin: 0, fontStyle: "italic" }}>{l}</p>
                ))}
              </div>
              <p style={{ color: mutC, fontSize: 9, margin: "8px 0 0" }}>{activeForm.exampleNote}</p>
            </div>
            <button onClick={() => setActiveForm(null)} style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${gold}44`, background: "transparent", color: mutC, fontFamily: "Montserrat,sans-serif", fontSize: 12, cursor: "pointer" }}>← Volver a la lista</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", position: "relative", overflow: "hidden", minHeight: "100vh", background: bg }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}body{margin:0;background:#000;overflow-x:hidden}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#D4AF3744;border-radius:2px}textarea::placeholder,input::placeholder{color:${textFaint}}@keyframes fadeInToast{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      {TutorialOverlay()}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: bgPanel, border: `1px solid ${gold}`, borderRadius: 10, padding: "10px 20px", zIndex: 9998, color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 13, fontWeight: 600, boxShadow: `0 4px 20px rgba(0,0,0,0.4), 0 0 10px ${gold}22`, animation: "fadeInToast 0.3s ease" }}>
          {toast}
        </div>
      )}
      {screen === "home" && HomeScreen()}
      {screen === "editor" && EditorScreen()}
      {screen === "settings" && SettingsScreen()}
      {screen === "guide" && GuideScreen()}
      {screen === "compare" && CompareScreen()}
      {screen === "poetrylearn" && PoetryLearnScreen()}
    </div>
  );
}
