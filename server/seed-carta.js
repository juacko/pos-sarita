const db = require('./db');

function getId(table, nameCol, nameVal) {
  const r = db.prepare(`SELECT id FROM ${table} WHERE ${nameCol} = ?`).get(nameVal);
  return r ? r.id : null;
}

const seed = db.transaction(() => {
  // Limpiar datos de productos existentes
  db.exec('DELETE FROM agregados');
  db.exec('DELETE FROM opciones_mod');
  db.exec('DELETE FROM modificadores');
  db.exec('DELETE FROM variantes');
  db.exec('DELETE FROM productos');
  db.exec('DELETE FROM categorias');

  // Reset auto-increment
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('categorias','productos','variantes','modificadores','opciones_mod','agregados')");

  // ─── CATEGORÍAS ───
  const insertCat = db.prepare('INSERT INTO categorias (nombre, color) VALUES (?, ?)');
  const cats = [
    ['Hamburguesas', '#E11D48'],
    ['Sanguches', '#F97316'],
    ['Pizzas', '#DC2626'],
    ['Salchipapas', '#F59E0B'],
    ['Bebidas Sin Alcohol', '#3B82F6'],
    ['Bebidas Calientes', '#92400E'],
    ['Frappés', '#06B6D4'],
    ['Milk Shakes', '#EC4899'],
    ['Bebidas con Alcohol', '#7C3AED'],
    ['Postres', '#F59E0B'],
    ['Helados', '#06B6D4'],
    ['Alitas y Pollo Crujiente', '#DC2626'],
    ['Combos', '#059669'],
    ['Parrillas', '#92400E'],
    ['Caldos y Sopas', '#B45309'],
  ];
  for (const [n, c] of cats) insertCat.run(n, c);
  const cat = (n) => getId('categorias', 'nombre', n);

  // ─── HELPER ───
  const insProd = db.prepare('INSERT INTO productos (nombre, descripcion, precio, categoria_id) VALUES (?, ?, ?, ?)');
  const insVar = db.prepare('INSERT INTO variantes (producto_id, nombre, precio_adicional) VALUES (?, ?, ?)');
  const insMod = db.prepare('INSERT INTO modificadores (producto_id, nombre, tipo, requerido, max_opciones) VALUES (?, ?, ?, ?, ?)');
  const insOpc = db.prepare('INSERT INTO opciones_mod (modificador_id, nombre, precio_adicional) VALUES (?, ?, ?)');
  const insAgr = db.prepare('INSERT INTO agregados (producto_id, nombre, precio, maximo) VALUES (?, ?, ?, ?)');

  function addMod(productId, nombre, tipo, requerido, maxOpciones, opciones) {
    const r = insMod.run(productId, nombre, tipo, requerido, maxOpciones);
    const modId = r.lastInsertRowid;
    for (const [on, op] of opciones) insOpc.run(modId, on, op);
    return modId;
  }

  // ═══════════════════════════════════════════════════
  // HAMBURGUESAS
  // ═══════════════════════════════════════════════════
  const hamburguesas = [
    ['Ham Burger', 18, 'Pan, carne, lechuga, tomate, cebolla, aderezo'],
    ['Cheese Burger', 20, 'Pan, carne, queso, lechuga, tomate, cebolla, aderezo'],
    ['Clásica Pollo', 18, 'Pan, pechuga de pollo, lechuga, tomate, aderezo'],
    ['Clásica Res', 18, 'Pan, carne de res, lechuga, tomate, aderezo'],
    ['Clásica Cordero', 28, 'Pan, carne de cordero, lechuga, tomate, aderezo especial'],
    ['Royal New City Pollo', 20, 'Pan especial, pechuga de pollo, vegetales, salsa royal'],
    ['Royal New City Res', 20, 'Pan especial, carne de res, vegetales, salsa royal'],
    ['Royal New City Cordero', 23, 'Pan especial, carne de cordero, vegetales, salsa royal'],
    ['Big Burger Pollo', 20, 'Pan, pechuga de pollo, piña, tocino, cebolla caramelizada, aderezo'],
    ['Big Burger Res', 20, 'Pan, carne de res, piña, tocino, cebolla caramelizada, aderezo'],
    ['Big Burger Cordero', 23, 'Pan, carne de cordero, piña, tocino, cebolla caramelizada, aderezo'],
  ];
  for (const [n, p, d] of hamburguesas) insProd.run(n, d, p, cat('Hamburguesas'));

  // ═══════════════════════════════════════════════════
  // SÁNDUCHES
  // ═══════════════════════════════════════════════════
  const sanguches = [
    ['Cordero Power', 28, 'Pan, carne de cordero, lechuga, tomate, cebolla, aderezo especial'],
    ['Pizza Burger', 23, 'Pan, carne, salsa de tomate, queso derretido, pepperoni'],
    ['Pollo Crocante Burger', 23, 'Pan, pechuga de pollo crocante, lechuga, tomate, aderezo'],
  ];
  for (const [n, p, d] of sanguches) insProd.run(n, d, p, cat('Sanguches'));

  // ═══════════════════════════════════════════════════
  // PIZZAS
  // ═══════════════════════════════════════════════════
  const pizzas = [
    ['Americana', 32, 'Salsa de tomate, queso mozzarella, jamón'],
    ['Pepperoni', 34, 'Salsa de tomate, queso mozzarella, pepperoni'],
    ['Hawaiana', 35, 'Salsa de tomate, queso mozzarella, jamón, piña'],
    ['Al Tocino Ahumado', 36, 'Salsa de tomate, queso mozzarella, tocino ahumado'],
    ['Pollo Saltado', 38, 'Salsa de tomate, queso mozzarella, pollo saltado, cebolla'],
    ['Suprema Especial', 40, 'Salsa de tomate, queso mozzarella, pollo, jamón, champiñones, cebolla, pimentón'],
  ];
  for (const [n, p, d] of pizzas) {
    const r = insProd.run(n, d, p, cat('Pizzas'));
    const pid = r.lastInsertRowid;
    // Todas las pizzas llevan como base: salsa de tomate + queso
    // Agregados extra opcionales
    insAgr.run(pid, 'Queso extra', 8, 3);
    insAgr.run(pid, 'Pollo extra', 10, 2);
    insAgr.run(pid, 'Jamón extra', 8, 2);
    insAgr.run(pid, 'Champiñones', 6, 2);
    insAgr.run(pid, 'Aceitunas', 5, 2);
  }

  // ═══════════════════════════════════════════════════
  // SALCHIPAPAS
  // ═══════════════════════════════════════════════════
  const salchipapas = [
    ['Salchipapa Chorizo + Hot Dog', 18, 'Papas fritas con chorizo y hot dog'],
    ['Salchi Power', 24, 'Papas fritas con chorizo, pollo crocante y queso'],
    ['Salchi Crocante', 22, 'Papas fritas con pollo crocante y aderezo'],
    ['Achorada', 26, 'Papas fritas con chicharrón de pollo y huevo frito'],
    ['Mixta Especial', 32, 'Papas fritas con chorizo, pollo, huevo frito, queso y salsa especial'],
  ];
  for (const [n, p, d] of salchipapas) {
    const r = insProd.run(n, d, p, cat('Salchipapas'));
    const pid = r.lastInsertRowid;
    // Agregados opcionales para todas
    insAgr.run(pid, 'Queso extra', 5, 3);
    insAgr.run(pid, 'Huevo frito', 3, 3);
    insAgr.run(pid, 'Salsa extra', 2, 3);
    insAgr.run(pid, 'Chorizo extra', 6, 2);
  }

  // ═══════════════════════════════════════════════════
  // BEBIDAS SIN ALCOHOL (limonadas, maracuyá, chicha, gaseosas, agua)
  // ═══════════════════════════════════════════════════
  const bebidasSinAlcohol = [
    ['Limonada', 12, 'Limonada natural fresca'],
    ['Limonada Frozen', 15, 'Limonada helada tipo slush'],
    ['Maracuyá', 12, 'Jugo de maracuyá natural'],
    ['Maracuyá Frozen', 15, 'Maracuyá helado tipo slush'],
    ['Chicha Morada', 12, 'Chicha morada artesanal'],
    ['Gaseosa Personal', 4, 'Gaseosa personal 350ml'],
    ['Gaseosa 600ml', 5, 'Gaseosa 600ml'],
    ['Gaseosa 1 Litro', 8, 'Gaseosa 1 litro'],
    ['Gaseosa Gordita', 6, 'Gaseosa gordita 500ml'],
    ['Gaseosa 2.5 Litros', 12, 'Gaseosa familiar 2.5L'],
    ['Agua', 2, 'Agua mineral'],
  ];
  for (const [n, p, d] of bebidasSinAlcohol) insProd.run(n, d, p, cat('Bebidas Sin Alcohol'));

  // ═══════════════════════════════════════════════════
  // BEBIDAS CALIENTES
  // ═══════════════════════════════════════════════════
  const calientes = [
    ['Emoliente', 5, 'Emoliente tradicional caliente'],
    ['Emoliente Especial', 7, 'Emoliente con linaza, cebada y especias'],
    ['Emoliente Pisado', 8, 'Emoliente con ingredientes pisados'],
    ['Infusiones', 4, 'Infusión de hierbas (manzanilla, muña, etc.)'],
    ['Café', 5, 'Café negro recién hecho'],
  ];
  for (const [n, p, d] of calientes) {
    const r = insProd.run(n, d, p, cat('Bebidas Calientes'));
    // Emolientes pueden llevar azúcar
    if (n.startsWith('Emoliente')) {
      const pid = r.lastInsertRowid;
      addMod(pid, 'Endulzante', 'select', 0, 1, [['Sin azúcar', 0], ['Con azúcar', 0], ['Poco azúcar', 0]]);
    }
  }

  // ═══════════════════════════════════════════════════
  // FRAPPÉS
  // ═══════════════════════════════════════════════════
  const frappes = [
    ['Capuccino Frappé', 14, 'Frappé de capuccino con hielo'],
    ['Oreo Frappé', 15, 'Frappé de cookies & cream con Oreo'],
    ['Maracuyá Frappé', 14, 'Frappé de maracuyá con hielo'],
  ];
  for (const [n, p, d] of frappes) insProd.run(n, d, p, cat('Frappés'));

  // ═══════════════════════════════════════════════════
  // MILK SHAKES
  // ═══════════════════════════════════════════════════
  const milkshakes = [
    ['Chocolate', 16, 'Malteada de chocolate'],
    ['Vainilla', 16, 'Malteada de vainilla'],
    ['Chocochip', 17, 'Malteada de chocolate con chips'],
  ];
  for (const [n, p, d] of milkshakes) insProd.run(n, d, p, cat('Milk Shakes'));

  // ═══════════════════════════════════════════════════
  // BEBIDAS CON ALCOHOL
  // ═══════════════════════════════════════════════════
  const alcoholBase = [
    ['Pisco Sour', 18, 30, 'Pisco Sour clásico'],
    ['Toronja Sour', 18, 30, 'Sour de toronja'],
    ['Mojito Limón', 18, 30, 'Mojito de limón con hierbabuena'],
    ['Mojito Maracuyá', 18, 30, 'Mojito de maracuyá con hierbabuena'],
  ];
  for (const [n, copa, jarra, d] of alcoholBase) {
    const r = insProd.run(n, d + ' — Copa', copa, cat('Bebidas con Alcohol'));
    const pid = r.lastInsertRowid;
    insVar.run(pid, 'Copa', 0);
    insVar.run(pid, 'Jarra', jarra - copa);
    // Sabores como modificador para mojitos
    if (n.startsWith('Mojito')) {
      addMod(pid, 'Sabor', 'select', 1, 1, [['Clásico', 0], ['Fresa', 3], ['Mango', 3]]);
    }
  }

  // Bebidas premium
  const capuccinoLicor = insProd.run('Capuccino (Licor)', 'Capuccino con licor', 6, cat('Bebidas con Alcohol'));
  insProd.run('Jarra Uno', 'Jarra de chela', 20, cat('Bebidas con Alcohol'));
  insProd.run('Botella', 'Botella de chela', 30, cat('Bebidas con Alcohol'));

  // ═══════════════════════════════════════════════════
  // POSTRES
  // ═══════════════════════════════════════════════════
  const postres = [
    ['Torta Galleta', 10, 'Torta de galleta casera'],
    ['Waffles con Frutas', 16, 'Waffles con frutas frescas y miel'],
  ];
  for (const [n, p, d] of postres) {
    const r = insProd.run(n, d, p, cat('Postres'));
    const pid = r.lastInsertRowid;
    if (n === 'Waffles con Frutas') {
      addMod(pid, 'Tipo de fruta', 'multi', 1, 3, [['Fresa', 0], ['Plátano', 0], ['Durazno', 0], ['Mora', 0]]);
      insAgr.run(pid, 'Helado extra', 8, 2);
      insAgr.run(pid, 'Crema chantilly', 5, 2);
    }
  }

  // ═══════════════════════════════════════════════════
  // HELADOS
  // ═══════════════════════════════════════════════════
  const heladoBase = insProd.run('Helado', 'Helado artesanal', 5, cat('Helados'));
  const heladoId = heladoBase.lastInsertRowid;
  insVar.run(heladoId, '1 Bola', 0);
  insVar.run(heladoId, '2 Bolas', 3);
  insVar.run(heladoId, '3 Bolas', 5);
  addMod(heladoId, 'Sabor', 'multi', 1, 3, [
    ['Chocolate', 0], ['Vainilla', 0], ['Fresa', 0], ['Menta', 0],
    ['Mango', 0], ['Limón', 0], [' Lúcuma', 0]
  ]);

  // ═══════════════════════════════════════════════════
  // ALITAS Y POLLO CRUJIENTE
  // ═══════════════════════════════════════════════════
  const saboresAlitas = [
    'BBQ Clásica', 'BBQ Picante', 'BBQ con Piña', 'BBQ Tropical de Maracuyá',
    'Al Queso Especial', 'Acevichada Clásica', 'Acevichada Picante',
    'Mostaza Honey', 'Anticuchera', 'Maracuyá', 'Maracuyá Picante',
    'Teriyaki', 'Parrillera Chimichurri'
  ];
  const presentaciones = [
    ['x6', 20, 2], ['x8', 25, 2], ['x12', 35, 3], ['x15', 40, 3], ['x20', 50, 4], ['x30', 70, 6], ['x40', 90, 8]
  ];

  // Alitas
  const alitas = insProd.run('Alitas', 'Alitas de pollo con salsa a elegir', 20, cat('Alitas y Pollo Crujiente'));
  const alitasId = alitas.lastInsertRowid;
  for (const [nombre, precio, maxSabores] of presentaciones) {
    insVar.run(alitasId, nombre, precio - 20); // precio base es x6=20
  }
  // Modificador de sabores
  const modSabor = insMod.run(alitasId, 'Sabor(es)', 'multi', 1, 8); // max_opciones se actualizará por presentación
  const modSaborId = modSabor.lastInsertRowid;
  for (const s of saboresAlitas) insOpc.run(modSaborId, s, 0);

  // Pollo Crujiente
  const polloCruj = insProd.run('Pollo Crujiente', 'Pollo frito crocante', 20, cat('Alitas y Pollo Crujiente'));
  const polloId = polloCruj.lastInsertRowid;
  for (const [nombre, precio] of presentaciones) {
    insVar.run(polloId, nombre, precio - 20);
  }
  addMod(polloId, 'Sabor', 'multi', 1, 4, [
    ['Natural', 0], ['BBQ', 0], ['Picante', 0], ['Mostaza Honey', 0]
  ]);

  // ═══════════════════════════════════════════════════
  // COMBOS (plato + guarnición)
  // ═══════════════════════════════════════════════════
  const combos = [
    ['Pollo a la Plancha', [15, 18, 20]],
    ['Pollo Napolitano', [20, 23, 25]],
    ['Chicharrón de Pollo', [20, 23, 25]],
    ['Broaster Especial', [20, 23, 25]],
    ['Milanesa de Pollo', [20, 23, 25]],
    ['Lomo Saltado', [20, 23, 25]],
    ['Lomo Pobre', [30, 33, 36]],
    ['Delicia de Cordero', [30, 33, 35]],
    ['Gordon Blue', [30, 33, 35]],
  ];
  const guarniciones = ['Arroz Blanco', 'Chaufa', 'Pastas'];

  for (const [nombre, precios] of combos) {
    const desc = `${nombre} con guarnición a elegir`;
    const r = insProd.run(nombre, desc, precios[0], cat('Combos'));
    const pid = r.lastInsertRowid;
    // Variantes: cada guarnición tiene precio diferente
    for (let i = 0; i < guarniciones.length; i++) {
      insVar.run(pid, guarniciones[i], precios[i] - precios[0]);
    }
    // Agregados
    insAgr.run(pid, 'Arroz extra', 5, 2);
    insAgr.run(pid, 'Ensalada', 6, 2);
  }

  // ═══════════════════════════════════════════════════
  // PARRILLAS (carne + guarnición)
  // ═══════════════════════════════════════════════════
  const parrillaCarne = [
    ['Pollo', 22], ['Res', 22], ['Chancho', 22], ['Cordero', 25],
    ['Parrilla Doble', 45], ['Parrilla Triple', 60]
  ];
  const parrillaGuarn = [
    ['Carne (sin guarnición)', 0],
    ['Ensalada/Papa', 3],
    ['Choclo', 6],
    ['Pasta', 8]
  ];

  for (const [carne, base] of parrillaCarne) {
    const r = insProd.run(carne, `Parrilla de ${carne.toLowerCase()} con guarnición a elegir`, base, cat('Parrillas'));
    const pid = r.lastInsertRowid;
    for (const [guarn, extra] of parrillaGuarn) {
      insVar.run(pid, guarn, extra);
    }
    insAgr.run(pid, 'Ensalada extra', 8, 2);
    insAgr.run(pid, 'Papa extra', 7, 2);
  }

  // ═══════════════════════════════════════════════════
  // CALDOS Y SOPAS
  // ═══════════════════════════════════════════════════
  const sopas = [
    ['Caldo de Pollo', 15, 'Caldo de pollo con verduras'],
    ['Caldo de Cordero', 17, 'Caldo de cordero con verduras'],
    ['Sopa Wantán Mixta', 16, 'Sopa de wantán mixta con pollo y verduras'],
    ['Sopa Criolla', 20, 'Sopa criolla con leche, fideo y carne'],
    ['Ramen', 15, 'Ramen japonés con chashu y huevo'],
  ];
  for (const [n, p, d] of sopas) {
    const r = insProd.run(n, d, p, cat('Caldos y Sopas'));
    const pid = r.lastInsertRowid;
    if (n === 'Ramen') {
      addMod(pid, 'Término del huevo', 'select', 0, 1, [['Cocido', 0], ['Medio cocido', 0]]);
    }
  }
});

// Ejecutar seed
seed();

// Verificar
const cats = db.prepare('SELECT COUNT(*) as c FROM categorias').get();
const prods = db.prepare('SELECT COUNT(*) as c FROM productos').get();
const vars = db.prepare('SELECT COUNT(*) as c FROM variantes').get();
const mods = db.prepare('SELECT COUNT(*) as c FROM modificadores').get();
const opcs = db.prepare('SELECT COUNT(*) as c FROM opciones_mod').get();
const agrs = db.prepare('SELECT COUNT(*) as c FROM agregados').get();

console.log('✅ Seed completado:');
console.log(`   Categorías: ${cats.c}`);
console.log(`   Productos: ${prods.c}`);
console.log(`   Variantes: ${vars.c}`);
console.log(`   Modificadores: ${mods.c}`);
console.log(`   Opciones: ${opcs.c}`);
console.log(`   Agregados: ${agrs.c}`);
