// Fixed, accent-free Spanish vocabulary. No guest or property data is involved.
export const GUIDE_PASSWORD_WORDS: readonly string[] = Object.freeze([
  "abeja", "abeto", "abril", "acero", "acera", "adobo", "afuera", "agave", "agua", "aguja",
  "ahora", "aire", "alado", "alamo", "aldea", "aleta", "algas", "aliso", "alma", "altar",
  "altura", "amable", "amigo", "amor", "ancho", "andar", "anexo", "anillo", "antes", "apoyo",
  "arado", "arbol", "arca", "arco", "arena", "aroma", "arpa", "arroz", "arte", "asado",
  "astro", "atajo", "atlas", "aula", "autor", "avena", "avion", "aviso", "ayuda", "azul",
  "babero", "bahia", "baile", "balsa", "bambu", "banco", "banda", "banjo", "barco", "barra",
  "base", "batata", "batido", "baul", "bello", "beso", "bingo", "blanco", "blando",
  "bloque", "boca", "boceto", "bodega", "boina", "bola", "bolero", "bolita", "bolsa", "bonito",
  "borde", "borla", "bosque", "bote", "brasa", "brazo", "brisa", "broche", "bronce", "brote",
  "bruma", "bueno", "bufalo", "buho", "bulbo", "bulto", "buzon", "cabal", "cabina", "cable",
  "cacao", "cacto", "cadena", "cadera", "caiman", "caja", "cajon", "calado", "caliza", "calma",
  "calor", "camada", "cambio", "camino", "camisa", "campo", "canal", "canela", "canoa", "canto",
  "caoba", "capa", "capote", "cara", "carpa", "carro", "carta", "casa", "casco", "casero",
  "castor", "causa", "cedro", "celda", "cena", "centro", "cerca", "cerco", "cerdo", "cesta",
  "chala", "charco", "chica", "chico", "chifle", "chispa", "choza", "cielo", "cifra", "cima",
  "cinco", "cinta", "circo", "cirio", "cisne", "claro", "clave", "clima", "cobre", "cocina",
  "coco", "codigo", "cofre", "colina", "color", "cometa", "comida", "compas", "conejo", "coral",
  "corcho", "cordel", "corona", "corral", "correo", "costa", "coyote", "crema", "crespo",
  "cruce", "cuadro", "cuatro", "cubeta", "cubo", "cuenta", "cuerda", "cuerpo", "cueva", "cuidar",
  "cumbre", "cupula", "curso", "curva", "dalia", "dama", "danza", "dardo", "datos", "deber",
  "decena", "dedal", "dedo", "delfin", "dentro", "deseo", "dibujo", "dicha", "diente", "disco",
  "doble", "doce", "dorado", "dorar", "dorsal", "dosis", "dulce", "duque", "duro",
  "ebano", "elote", "embudo", "emisor", "encina", "enero", "enlace", "entero", "entrar", "envio",
  "equipo", "escala", "escoba", "escudo", "esfera", "espuma", "estela", "estilo", "estufa", "etapa",
  "exacto", "fabula", "faceta", "faro", "fauna", "feliz", "feria", "fibra", "ficha", "fiel",
  "fiesta", "figura", "fila", "finca", "fino", "firme", "flaco", "flauta", "flecha", "flora",
  "flujo", "foca", "fogata", "folio", "fondo", "forma", "fosa", "foto", "frase",
  "freno", "fresa", "frio", "fronda", "fruto", "fuego", "fuente", "fuerte", "funda", "futuro",
  "lago", "puma",
]);

// Rejection sampling keeps every word and number equally likely.
function randomIndex(size: number): number {
  const range = 2 ** 32;
  const limit = range - (range % size);
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % size;
}

export function generateGuidePassword(): string {
  return GUIDE_PASSWORD_WORDS[randomIndex(GUIDE_PASSWORD_WORDS.length)]
    + randomIndex(1000).toString().padStart(3, "0");
}
