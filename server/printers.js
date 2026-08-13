const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { textoDeMetodo } = require('./metodos-pago');

const CONFIG_PATH = path.join(__dirname, '..', 'printers-config.json');
const RAWRINT_PS1 = path.join(__dirname, 'rawprint.ps1');

let config = {
  caja: {
    nombre: 'Impresora Caja',
    nombre_impresora: 'CAJA',
    tipo: 'windows',
    habilitada: true,
    ancho_papel: 80
  },
  cocina: {
    nombre: 'Impresora Cocina',
    nombre_impresora: 'COCINA',
    tipo: 'windows',
    habilitada: true,
    ancho_papel: 80
  },
  barra: {
    nombre: 'Impresora Barra',
    nombre_impresora: 'BARRA',
    tipo: 'windows',
    habilitada: true,
    ancho_papel: 80
  }
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    config = {
      caja:   { ...config.caja,   ...saved.caja },
      cocina: { ...config.cocina, ...saved.cocina },
      barra:  { ...config.barra,  ...(saved.barra || {}) }
    };
  } catch (e) {
    console.error('[PRINTERS] Error loading config:', e.message);
  }
}

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ==================== ESC/POS helper ====================

const ESC = 0x1b;
const GS = 0x1d;

// Comandos ESC/POS (bytes)
function cmdInit() { return [ESC, 0x40]; }                                    // ESC @
function cmdAlign(n) { return [ESC, 0x61, n]; }                               // ESC a n (0 izq, 1 centro, 2 der)
function cmdSize(n) { return [GS, 0x21, n]; }                                 // GS ! n (tamaño fuente)
function cmdBold(on) { return [ESC, 0x45, on ? 1 : 0]; }                      // ESC E n
function cmdFeed(n) { return [ESC, 0x64, n]; }                                // ESC d n (avance n lineas)
function cmdCut() { return [GS, 0x56, 0x42]; }                                // GS V 66 (corte total)
function cmdSpacing(n) { return [ESC, 0x33, n]; }                             // ESC 3 n (espaciado lineas en dots)

// Tamaños de fuente (GS ! n): bits 0-2 = ancho (0=1x,1=2x,2=3x), bits 4-6 = alto
const SZ_NORMAL = 0x00;   // 1x1
const SZ_DOUBLE_W = 0x01; // 2x1 (ancho doble)
const SZ_DOUBLE = 0x11;   // 2x2 (ancho y alto doble)
const SZ_TRIPLE = 0x22;   // 3x3 (ancho y alto triple)

function anchoColumnas(printerName) {
  const p = config[printerName];
  return p && p.ancho_papel >= 80 ? 48 : 32;
}

// Genera los bytes ESC/POS de una lista de líneas.
// line = { text, align: 'L'|'C'|'R', bold: bool, size: 0|1|2 (multiplicador 1x/2x/3x) }
function buildEscPos(lines, printerName) {
  const cols = anchoColumnas(printerName);
  const out = [];
  out.push(...cmdInit());
  out.push(...cmdSpacing(24)); // espaciado compacto para aprovechar papel

  const textBytes = (t) => {
    for (const ch of t) {
      const code = ch.codePointAt(0);
      if (code < 128) out.push(code);
      else out.push(0x3f); // '?' para caracteres no ASCII en fuentes base
    }
  };

  for (const ln of lines) {
    const text = ln.text || '';
    if (ln.size) out.push(...cmdSize(ln.size));
    if (ln.bold) out.push(...cmdBold(true));
    switch (ln.align) {
      case 'C': out.push(...cmdAlign(1)); break;
      case 'R': out.push(...cmdAlign(2)); break;
      default: out.push(...cmdAlign(0));
    }
    if (ln.padTo) {
      // texto con relleno manual para alinear columnas a la derecha
      const padded = text.length < ln.padTo ? text + ' '.repeat(ln.padTo - text.length) : text;
      textBytes(padded);
    } else {
      textBytes(text);
    }
    if (ln.bold) out.push(...cmdBold(false));
    if (ln.size) out.push(...cmdSize(SZ_NORMAL));
    out.push(0x0a);
  }

  out.push(...cmdFeed(4));
  out.push(...cmdCut());
  return Buffer.from(out);
}

function sepLine(c = '=', printerName) {
  const cols = anchoColumnas(printerName);
  return { text: c.repeat(cols), align: 'L' };
}

function blankLine() {
  return { text: '', align: 'L' };
}

function bigText(text) {
  return { text, align: 'C', size: SZ_DOUBLE, bold: true };
}

function midText(text) {
  return { text, align: 'C', size: SZ_DOUBLE_W };
}

// Línea con dos columnas: izquierda y derecha (precios/totales)
function twoCol(left, right, cols) {
  const space = Math.max(1, cols - left.length - right.length);
  return { text: left + ' '.repeat(space) + right, align: 'L' };
}

// Texto centrado con relleno manual para quedar centrado con fuente normal
function centerLine(text, cols) {
  const pad = Math.max(0, Math.floor((cols - text.length) / 2));
  return { text: ' '.repeat(pad) + text, align: 'L' };
}

// ---- Columnas profesionales ----
const P_W = 10;          // ancho fijo columna de importe
const GAP = 1;           // separador entre descripcion e importe

function fmtMoney(n) { return `S/${n.toFixed(2)}`; }

// Envuelve texto largo en varias líneas de máximo maxLen
function wrapText(text, maxLen) {
  const words = String(text).split(' ');
  const out = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; }
    else if ((cur + ' ' + w).length <= maxLen) { cur += ' ' + w; }
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

// Fila: descripción a la izquierda + importe anclado a la derecha en columna fija
function rowLine(desc, importe, cols) {
  const maxDesc = cols - P_W - GAP;
  const descLines = wrapText(desc, maxDesc);
  const padPrice = (s) => s.length < P_W ? ' '.repeat(P_W - s.length) + s : s;
  return descLines.map((l, i) => {
    if (i === 0) {
      const price = padPrice(importe);
      return { text: l + ' '.repeat(Math.max(GAP, cols - l.length - price.length)) + price, align: 'L' };
    }
    return { text: l, align: 'L' };
  });
}

// Texto de un modificador: grupo + opciones elegidas (p.ej. "Tipo de pasta: Pasta al Pesto")
function modLabel(mod) {
  const nombre = mod.nombre || mod;
  if (Array.isArray(mod.seleccion) && mod.seleccion.length) {
    return `${nombre}: ${mod.seleccion.map(s => s.nombre || s).join(', ')}`;
  }
  return nombre;
}

// Línea de item: cantidad+nombre con precio, y línea unitaria debajo
function itemRows(item, cols) {
  const out = [];
  const precioUnit = item.precio_unitario + (item.precio_adicional || 0);
  const importe = item.cantidad * precioUnit;
  const nombre = `${item.cantidad}x ${item.producto_nombre}`;
  out.push(...rowLine(nombre, fmtMoney(importe), cols));
  out.push({ text: `     S/${precioUnit.toFixed(2)} c/u`, align: 'L' });
  if (item.variante_nombre) out.push({ text: `     * ${item.variante_nombre}`, align: 'L' });
  if (item.notas) out.push({ text: `     * ${item.notas}`, align: 'L' });
  try {
    const mods = JSON.parse(item.modificadores_json || '[]');
    if (mods.length) out.push(...wrapText(`     + ${mods.map(modLabel).join(', ')}`, cols).map(t => ({ text: t, align: 'L' })));
  } catch (e) {}
  try {
    const agrs = JSON.parse(item.agregados_json || '[]');
    if (agrs.length) out.push(...wrapText(`     + ${agrs.map(a => a.nombre || a).join(', ')}`, cols).map(t => ({ text: t, align: 'L' })));
  } catch (e) {}
  return out;
}

// ==================== generadores ====================

function tipoLabel(areaTipo) {
  return areaTipo === 'DELIVERY' ? 'DELIVERY' : areaTipo === 'PARA_LLEVAR' ? 'PARA LLEVAR' : 'SALON';
}

// Solo delivery y para llevar necesitan datos del cliente en el ticket
function clienteRelevante(mesa) {
  const tipo = mesa && mesa.area_tipo;
  return tipo === 'DELIVERY' || tipo === 'PARA_LLEVAR';
}

function pushClienteLines(lines, pedido, areaTipo) {
  lines.push({ text: `TIPO: ${tipoLabel(areaTipo)}`, align: 'L', bold: true });
  if (pedido.cliente_nombre) lines.push({ text: `Cliente: ${pedido.cliente_nombre}`, align: 'L' });
  if (pedido.cliente_telefono) lines.push({ text: `Tel: ${pedido.cliente_telefono}`, align: 'L' });
  if (pedido.cliente_direccion) lines.push({ text: `Direccion: ${pedido.cliente_direccion}`, align: 'L' });
  if (pedido.hora_recogida) lines.push({ text: `Recoger: ${pedido.hora_recogida}`, align: 'L' });
}

function pushItemLines(lines, item, cols, showImporte = true) {
  if (showImporte) {
    lines.push(...itemRows(item, cols));
  } else {
    lines.push({ text: `${item.cantidad}x  ${item.producto_nombre}`, align: 'L' });
    if (item.variante_nombre) lines.push({ text: `     * ${item.variante_nombre}`, align: 'L' });
    if (item.notas) lines.push({ text: `     * ${item.notas}`, align: 'L' });
    try {
      const mods = JSON.parse(item.modificadores_json || '[]');
      if (mods.length) lines.push({ text: `     + ${mods.map(modLabel).join(', ')}`, align: 'L' });
    } catch (e) {}
    try {
      const agrs = JSON.parse(item.agregados_json || '[]');
      if (agrs.length) lines.push({ text: `     + ${agrs.map(a => a.nombre || a).join(', ')}`, align: 'L' });
    } catch (e) {}
  }
  lines.push(blankLine());
}

function calcDescuento(pedido, totalBruto) {
  let desc = 0;
  for (const d of (pedido.descuentos || [])) {
    if (d.tipo === 'porcentaje') desc += totalBruto * d.valor / 100;
    else desc += d.valor;
  }
  return Math.max(0, totalBruto - desc);
}

function headerLines(pedido, mesa, extraTitle) {
  const lines = [];
  const cols = 48;
  lines.push(blankLine());
  lines.push(bigText('RESTAURANTE SARITA'));
  lines.push(sepLine('=', 'caja'));
  if (extraTitle) {
    lines.push({ text: `   ${extraTitle}   `, align: 'C', bold: true });
    lines.push(sepLine('=', 'caja'));
  }
  lines.push(blankLine());
  const mesaNum = mesa && (mesa.numero || mesa.nombre);
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  const fecha = ahora.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  lines.push(twoCol(`MESA: ${mesaNum || ''}`, `HORA: ${hora}`, cols));
  lines.push(twoCol(`PEDIDO: #${pedido.id}`, `FECHA: ${fecha}`, cols));
  if (pedido.mesero_nombre) lines.push({ text: `MESERO: ${pedido.mesero_nombre}`, align: 'L' });
  return lines;
}

function footerLines() {
  return [
    blankLine(),
    sepLine('-', 'caja'),
    { text: 'GRACIAS POR SU VISITA', align: 'C', bold: true, size: SZ_DOUBLE_W },
    blankLine(),
    { text: 'Solicite su comprobante de pago', align: 'C' }
  ];
}

function tableHeader(cols) {
  return [
    rowLine('CANT  DESCRIPCION', 'IMPORTE', cols)[0],
    sepLine('-', 'caja')
  ];
}

function generateTicketText(pedido, items, mesa) {
  const cols = anchoColumnas('caja');
  const lines = [];
  const totalBruto = items.reduce((sum, i) => sum + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);

  lines.push(...headerLines(pedido, mesa));

  if (clienteRelevante(mesa) && pedido.cliente_nombre) {
    lines.push(blankLine());
    pushClienteLines(lines, pedido, mesa && mesa.area_tipo);
  }
  lines.push(blankLine());
  lines.push(...tableHeader(cols));

  for (const item of items) {
    if (item.estado === 'CANCELADO') continue;
    pushItemLines(lines, item, cols, true);
  }

  lines.push(sepLine('-', 'caja'));
  lines.push(...rowLine('SUBTOTAL', fmtMoney(totalBruto), cols));

  for (const d of (pedido.descuentos || [])) {
    if (d.tipo === 'porcentaje') {
      const monto = totalBruto * d.valor / 100;
      lines.push(...rowLine(`DESCUENTO ${d.valor}%`, `-${fmtMoney(monto)}`, cols));
    } else {
      lines.push(...rowLine('DESCUENTO', `-${fmtMoney(d.valor)}`, cols));
    }
    if (d.motivo) lines.push(...wrapText(`  Motivo: ${d.motivo}`, cols).map(t => ({ text: t, align: 'L' })));
  }

  const totalNeto = calcDescuento(pedido, totalBruto);
  lines.push(blankLine());
  const totalRow = rowLine('TOTAL', fmtMoney(totalNeto), cols)[0];
  totalRow.bold = true;
  totalRow.size = SZ_DOUBLE_W;
  lines.push(totalRow);
  lines.push(sepLine('=', 'caja'));

  let totalPropina = 0;
  if (pedido.pagos && pedido.pagos.length) {
    lines.push(blankLine());
    lines.push({ text: 'PAGOS', align: 'C', bold: true });
    for (const pg of pedido.pagos) {
      let detalle = textoDeMetodo(pg.metodo);
      if (pg.referencia) detalle += ` (${pg.referencia})`;
      const row = rowLine(detalle, fmtMoney(pg.monto), cols)[0];
      lines.push(row);
      if (pg.propina > 0) {
        totalPropina += pg.propina;
        lines.push(...rowLine('  Propina', fmtMoney(pg.propina), cols));
      }
    }
    const pagado = pedido.pagos.reduce((s, p) => s + p.monto, 0);
    if (pagado > totalNeto) {
      lines.push(...rowLine('CAMBIO', fmtMoney(pagado - totalNeto), cols));
    }
  }

  if (totalPropina > 0) {
    lines.push(...rowLine('PROPINA', fmtMoney(totalPropina), cols));
  }

  lines.push(...footerLines());

  return buildEscPos(lines, 'caja');
}

function generatePrecuentaText(pedido, items, mesa) {
  const cols = anchoColumnas('caja');
  const lines = [];
  const totalBruto = items.reduce((sum, i) => sum + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);

  lines.push(...headerLines(pedido, mesa, 'PRE-CUENTA'));
  lines.push({ text: '(NO VALIDO COMO COMPROBANTE)', align: 'C' });

  if (clienteRelevante(mesa) && pedido.cliente_nombre) {
    lines.push(blankLine());
    pushClienteLines(lines, pedido, mesa && mesa.area_tipo);
  }
  lines.push(blankLine());
  lines.push(...tableHeader(cols));

  for (const item of items) {
    if (item.estado === 'CANCELADO') continue;
    pushItemLines(lines, item, cols, true);
  }

  lines.push(sepLine('-', 'caja'));
  lines.push(...rowLine('SUBTOTAL', fmtMoney(totalBruto), cols));

  const totalNeto = calcDescuento(pedido, totalBruto);
  const totalRow = rowLine('TOTAL', fmtMoney(totalNeto), cols)[0];
  totalRow.bold = true;
  totalRow.size = SZ_DOUBLE_W;
  lines.push(totalRow);
  lines.push(sepLine('=', 'caja'));

  lines.push(blankLine());
  lines.push({ text: 'PROPINA SUGERIDA', align: 'C', bold: true });
  lines.push(...rowLine(`10%`, fmtMoney(totalNeto * 0.10), cols));
  lines.push(...rowLine(`15%`, fmtMoney(totalNeto * 0.15), cols));

  lines.push(...footerLines());

  return buildEscPos(lines, 'caja');
}

function generateComandaText(pedido, items, mesa) {
  const lines = [];
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  const fecha = ahora.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  lines.push(blankLine());
  lines.push(bigText('COMANDA'));
  lines.push(sepLine('=', 'cocina'));
  lines.push(blankLine());
  lines.push({ text: `MESA: ${mesa && (mesa.numero || mesa.nombre)}`, align: 'L', bold: true, size: SZ_DOUBLE_W });
  lines.push(twoCol(`TIPO: ${tipoLabel(mesa && mesa.area_tipo)}`, `HORA: ${hora}`, 48));
  if (clienteRelevante(mesa) && pedido.cliente_nombre) {
    lines.push({ text: `Cliente: ${pedido.cliente_nombre}`, align: 'L' });
    if (pedido.cliente_telefono) lines.push({ text: `Tel: ${pedido.cliente_telefono}`, align: 'L' });
    if (pedido.cliente_direccion) lines.push({ text: `Direccion: ${pedido.cliente_direccion}`, align: 'L' });
    if (pedido.hora_recogida) lines.push({ text: `Recoger: ${pedido.hora_recogida}`, align: 'L' });
  }
  if (pedido.mesero_nombre) lines.push({ text: `Mesero: ${pedido.mesero_nombre}`, align: 'L' });
  if (pedido.nota) lines.push({ text: `NOTA: ${pedido.nota}`, align: 'L', bold: true });
  lines.push(sepLine('=', 'cocina'));
  lines.push(blankLine());

  for (const item of items) {
    if (item.estado === 'CANCELADO') continue;
    lines.push({ text: `${item.cantidad}x  ${item.producto_nombre}`, align: 'L', bold: true, size: SZ_DOUBLE_W });
    if (item.variante_nombre) lines.push({ text: `     * ${item.variante_nombre}`, align: 'L' });
    if (item.notas) lines.push({ text: `     * ${item.notas}`, align: 'L' });
    try {
      const mods = JSON.parse(item.modificadores_json || '[]');
      if (mods.length) lines.push(...wrapText(`     + ${mods.map(modLabel).join(', ')}`, 48).map(t => ({ text: t, align: 'L' })));
    } catch (e) {}
    try {
      const agrs = JSON.parse(item.agregados_json || '[]');
      if (agrs.length) lines.push(...wrapText(`     + ${agrs.map(a => a.nombre || a).join(', ')}`, 48).map(t => ({ text: t, align: 'L' })));
    } catch (e) {}
    if (item.detalle) lines.push({ text: `     # ${item.detalle}`, align: 'L' });
    lines.push(blankLine());
  }

  lines.push(sepLine('=', 'cocina'));
  lines.push({ text: `PEDIDO #${pedido.id}`, align: 'C', bold: true });
  lines.push({ text: `${fecha}  ${hora}`, align: 'C' });

  return buildEscPos(lines, 'cocina');
}

// ==================== impresión ====================

function printRawEscPos(buffer, printerName) {
  const printer = config[printerName];
  if (!printer || !printer.habilitada) {
    console.log(`[PRINTER ${printerName}] Deshabilitada`);
    return { ok: false, reason: 'disabled' };
  }

  const printerDisplayName = printer.nombre_impresora || printerName;
  const tmpFile = path.join(__dirname, '..', 'data', `_print_${printerName}_${Date.now()}.bin`);

  try {
    fs.writeFileSync(tmpFile, buffer);

    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${RAWRINT_PS1}" -Printer "${printerDisplayName}" -FilePath "${tmpFile}"`;
    const output = execSync(cmd, { timeout: 20000, stdio: 'pipe', encoding: 'utf8' });

    fs.unlinkSync(tmpFile);

    if (/^OK:/.test(output.trim())) {
      console.log(`[PRINTER ${printerName}] Impreso en "${printerDisplayName}"`);
      return { ok: true };
    }
    throw new Error('Salida inesperada: ' + output.trim());
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch (e) {}

    console.error(`[PRINTER ${printerName}] Error raw:`, err.message);

    const fallbackDir = path.join(__dirname, '..', 'prints');
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
    const filename = `${printerName}_${Date.now()}.txt`;
    fs.writeFileSync(path.join(fallbackDir, filename), buffer);
    console.log(`[PRINTER ${printerName}] Guardado en prints/${filename}`);

    return { ok: false, reason: err.message };
  }
}

function printTicket(pedido, items, mesa) {
  const buffer = generateTicketText(pedido, items, mesa);
  return printRawEscPos(buffer, 'caja');
}

function printPrecuenta(pedido, items, mesa) {
  const buffer = generatePrecuentaText(pedido, items, mesa);
  return printRawEscPos(buffer, 'caja');
}

function generateComandaBarraText(pedido, items, mesa) {
  const lines = [];
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  const fecha = ahora.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  lines.push(blankLine());
  lines.push(bigText('BARRA'));
  lines.push(sepLine('=', 'barra'));
  lines.push(blankLine());
  lines.push({ text: `MESA: ${mesa && (mesa.numero || mesa.nombre)}`, align: 'L', bold: true, size: SZ_DOUBLE_W });
  lines.push(twoCol(`TIPO: ${tipoLabel(mesa && mesa.area_tipo)}`, `HORA: ${hora}`, 48));
  if (clienteRelevante(mesa) && pedido.cliente_nombre) {
    lines.push({ text: `Cliente: ${pedido.cliente_nombre}`, align: 'L' });
    if (pedido.cliente_telefono) lines.push({ text: `Tel: ${pedido.cliente_telefono}`, align: 'L' });
    if (pedido.cliente_direccion) lines.push({ text: `Direccion: ${pedido.cliente_direccion}`, align: 'L' });
    if (pedido.hora_recogida) lines.push({ text: `Recoger: ${pedido.hora_recogida}`, align: 'L' });
  }
  if (pedido.mesero_nombre) lines.push({ text: `Mesero: ${pedido.mesero_nombre}`, align: 'L' });
  if (pedido.nota) lines.push({ text: `NOTA: ${pedido.nota}`, align: 'L', bold: true });
  lines.push(sepLine('=', 'barra'));
  lines.push(blankLine());

  for (const item of items) {
    if (item.estado === 'CANCELADO') continue;
    lines.push({ text: `${item.cantidad}x  ${item.producto_nombre}`, align: 'L', bold: true, size: SZ_DOUBLE_W });
    if (item.variante_nombre) lines.push({ text: `     * ${item.variante_nombre}`, align: 'L' });
    if (item.notas) lines.push({ text: `     * ${item.notas}`, align: 'L' });
    try {
      const mods = JSON.parse(item.modificadores_json || '[]');
      if (mods.length) lines.push(...wrapText(`     + ${mods.map(modLabel).join(', ')}`, 48).map(t => ({ text: t, align: 'L' })));
    } catch (e) {}
    try {
      const agrs = JSON.parse(item.agregados_json || '[]');
      if (agrs.length) lines.push(...wrapText(`     + ${agrs.map(a => a.nombre || a).join(', ')}`, 48).map(t => ({ text: t, align: 'L' })));
    } catch (e) {}
    if (item.detalle) lines.push({ text: `     # ${item.detalle}`, align: 'L' });
    lines.push(blankLine());
  }

  lines.push(sepLine('=', 'barra'));
  lines.push({ text: `PEDIDO #${pedido.id}`, align: 'C', bold: true });
  lines.push({ text: `${fecha}  ${hora}`, align: 'C' });

  return buildEscPos(lines, 'barra');
}

function printComandaBarra(pedido, items, mesa) {
  const buffer = generateComandaBarraText(pedido, items, mesa);
  return printRawEscPos(buffer, 'barra');
}

function printComanda(pedido, items, mesa) {
  const itemsCocina = items.filter(i => ['cocina', 'ambos'].includes(i.destino_impresion || 'cocina'));
  const itemsBarra  = items.filter(i => ['barra',  'ambos'].includes(i.destino_impresion || 'cocina'));

  const results = [];
  if (itemsCocina.length) {
    results.push(printRawEscPos(generateComandaText(pedido, itemsCocina, mesa), 'cocina'));
  }
  if (itemsBarra.length) {
    results.push(printRawEscPos(generateComandaBarraText(pedido, itemsBarra, mesa), 'barra'));
  }
  return results[0] || { ok: true };
}

function generateResumenMovimientosText(fecha, movimientos, totales) {
  const cols = anchoColumnas('caja');
  const lines = [];
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });

  lines.push(blankLine());
  lines.push(bigText('RESUMEN MOVIMIENTOS'));
  lines.push(sepLine('=', 'caja'));
  lines.push(twoCol('FECHA', fecha, cols));
  lines.push(twoCol('HORA', hora, cols));
  lines.push(blankLine());

  if (movimientos.length === 0) {
    lines.push({ text: 'Sin movimientos registrados', align: 'C' });
  } else {
    for (const mv of movimientos) {
      const tipoTxt = mv.tipo === 'INGRESO' ? 'INGRESO' : 'EGRESO';
      lines.push(...rowLine(`[${tipoTxt}] ${mv.concepto}`, fmtMoney(mv.monto), cols));
      lines.push({ text: `     ${textoDeMetodo(mv.metodo_pago)}`, align: 'L' });
      if (mv.persona) lines.push({ text: `     Persona: ${mv.persona}`, align: 'L' });
      if (mv.usuario_nombre) lines.push({ text: `     Registro: ${mv.usuario_nombre}`, align: 'L' });
      if (mv.notas) lines.push(...wrapText(`     Notas: ${mv.notas}`, cols).map(t => ({ text: t, align: 'L' })));
      lines.push(blankLine());
    }
  }

  lines.push(sepLine('-', 'caja'));
  lines.push(...rowLine('INGRESOS', fmtMoney(totales.ingresos), cols));
  lines.push(...rowLine('EGRESOS', fmtMoney(totales.egresos), cols));
  const saldoRow = rowLine('SALDO', fmtMoney(totales.ingresos - totales.egresos), cols)[0];
  saldoRow.bold = true;
  saldoRow.size = SZ_DOUBLE_W;
  lines.push(saldoRow);
  lines.push(blankLine());

  if (totales.por_metodo) {
    lines.push({ text: 'POR METODO', align: 'C', bold: true });
    for (const [met, val] of Object.entries(totales.por_metodo)) {
      lines.push(...rowLine(textoDeMetodo(met), `+${fmtMoney(val.ingresos)} / -${fmtMoney(val.egresos)}`, cols));
    }
  }

  lines.push(blankLine());
  lines.push({ text: 'FIN DEL REPORTE', align: 'C', bold: true });
  lines.push(sepLine('=', 'caja'));

  return buildEscPos(lines, 'caja');
}

function printResumenMovimientos(fecha, movimientos, totales) {
  const buffer = generateResumenMovimientosText(fecha, movimientos, totales);
  return printRawEscPos(buffer, 'caja');
}

function getConfig() {
  return config;
}

function updateConfig(newConfig) {
  if (newConfig.caja)   config.caja   = { ...config.caja,   ...newConfig.caja };
  if (newConfig.cocina) config.cocina = { ...config.cocina, ...newConfig.cocina };
  if (newConfig.barra)  config.barra  = { ...config.barra,  ...newConfig.barra };
  saveConfig();
  return config;
}

function testPrinter(printerName) {
  const cols = anchoColumnas(printerName);
  const lines = [];
  lines.push(blankLine());
  lines.push(bigText('PRUEBA'));
  lines.push(bigText('POS SARITA'));
  lines.push(sepLine('=', printerName));
  lines.push({ text: new Date().toLocaleString('es-MX'), align: 'C' });
  lines.push({ text: `Impresora: ${config[printerName]?.nombre_impresora || printerName}`, align: 'C' });
  lines.push(blankLine());
  lines.push({ text: 'Si lees esto, la impresora', align: 'C' });
  lines.push({ text: 'funciona correctamente.', align: 'C' });
  lines.push(blankLine());
  lines.push(...tableHeader(cols));
  lines.push(...rowLine('LINEA 1', 'S/10.00', cols));
  lines.push(...rowLine('LINEA 2', 'S/20.00', cols));
  lines.push(...rowLine('LINEA 3', 'S/30.00', cols));
  lines.push(sepLine('-', printerName));
  const totalRow = rowLine('TOTAL', 'S/60.00', cols)[0];
  totalRow.bold = true;
  totalRow.size = SZ_DOUBLE_W;
  lines.push(totalRow);
  lines.push(blankLine());
  lines.push({ text: 'Gracias!', align: 'C' });

  const buffer = buildEscPos(lines, printerName);
  return printRawEscPos(buffer, printerName);
}

function detectPrinters() {
  try {
    const psCmd = 'Get-Printer | Select-Object Name, DriverName, PortName | ConvertTo-Json';
    const output = execSync(psCmd, { shell: 'powershell', timeout: 15000, encoding: 'utf8', stdio: 'pipe' });
    const parsed = JSON.parse(output.trim());
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter(p =>
      p.Name &&
      !p.Name.includes('OneNote') &&
      !p.Name.includes('Microsoft') &&
      !p.Name.includes('Fax') &&
      !p.Name.includes('XPS')
    );
  } catch (err) {
    console.error('[PRINTERS] Detection error:', err.message);
    return [];
  }
}

module.exports = {
  printTicket,
  printPrecuenta,
  generatePrecuentaText,
  generateComandaText,
  generateComandaBarraText,
  printComanda,
  printComandaBarra,
  printResumenMovimientos,
  getConfig,
  updateConfig,
  testPrinter,
  detectPrinters
};

