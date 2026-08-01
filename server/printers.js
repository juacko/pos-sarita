const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const CONFIG_PATH = path.join(__dirname, '..', 'printers-config.json');

let config = {
  caja: {
    nombre: 'Impresora Caja',
    nombre_impresora: 'CAJA',
    tipo: 'windows',
    habilitada: true,
    ancho_papel: 58
  },
  cocina: {
    nombre: 'Impresora Cocina',
    nombre_impresora: 'COCINA',
    tipo: 'windows',
    habilitada: true,
    ancho_papel: 80
  }
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    config = { caja: { ...config.caja, ...saved.caja }, cocina: { ...config.cocina, ...saved.cocina } };
  } catch (e) {
    console.error('[PRINTERS] Error loading config:', e.message);
  }
}

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function tipoLabel(areaTipo) {
  return areaTipo === 'DELIVERY' ? '🛵 DELIVERY' : areaTipo === 'PARA_LLEVAR' ? '🥡 PARA LLEVAR' : 'SALON';
}

function pushClienteLines(lines, pedido, areaTipo) {
  lines.push(`TIPO: ${tipoLabel(areaTipo)}`);
  if (pedido.cliente_nombre) lines.push(`Cliente: ${pedido.cliente_nombre}`);
  if (pedido.cliente_telefono) lines.push(`Tel: ${pedido.cliente_telefono}`);
  if (pedido.cliente_direccion) lines.push(`Dirección: ${pedido.cliente_direccion}`);
  if (pedido.hora_recogida) lines.push(`Recoger: ${pedido.hora_recogida}`);
}

function generateTicketText(pedido, items, mesa) {
  const lines = [];
  const totalBruto = items.reduce((sum, i) => sum + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);
  const now = new Date().toLocaleString('es-MX');

  lines.push('\x1B\x61\x01');
  lines.push('='.repeat(32));
  lines.push('RESTAURANTE SARITA');
  lines.push('='.repeat(32));
  lines.push('\x1B\x61\x00');
  lines.push('');
  lines.push(`Mesa: ${mesa.numero || mesa.nombre}     ${now}`);
  lines.push(`Pedido: #${pedido.id}`);
  if (pedido.mesero_nombre) lines.push(`Mesero: ${pedido.mesero_nombre}`);
  if (pedido.cliente_nombre) {
    lines.push('');
    pushClienteLines(lines, pedido, mesa && mesa.area_tipo);
  }
  lines.push('-'.repeat(32));
  lines.push('');

  for (const item of items) {
    const precioUnit = item.precio_unitario + (item.precio_adicional || 0);
    const importe = (item.cantidad * precioUnit).toFixed(2);
    lines.push(`${item.cantidad}x ${item.producto_nombre}`);
    lines.push(`  $${item.precio_unitario.toFixed(2)}  ->  $${importe}`);
    if (item.variante_nombre) lines.push(`  Var: ${item.variante_nombre}`);
    if (item.notas) lines.push(`  * ${item.notas}`);
    try {
      const mods = JSON.parse(item.modificadores_json || '[]');
      if (mods.length) lines.push(`  Mod: ${mods.map(m => m.nombre || m).join(', ')}`);
    } catch (e) {}
    try {
      const agrs = JSON.parse(item.agregados_json || '[]');
      if (agrs.length) lines.push(`  Agr: ${agrs.map(a => a.nombre || a).join(', ')}`);
    } catch (e) {}
    lines.push('');
  }

  lines.push('-'.repeat(32));
  lines.push(`Subtotal: $${totalBruto.toFixed(2)}`.padStart(28));

  if (pedido.descuentos && pedido.descuentos.length) {
    let totalDescuento = 0;
    for (const d of pedido.descuentos) {
      if (d.tipo === 'porcentaje') {
        const montoDesc = totalBruto * d.valor / 100;
        totalDescuento += montoDesc;
        lines.push(`Descuento ${d.valor}%: -$${montoDesc.toFixed(2)}`);
      } else {
        totalDescuento += d.valor;
        lines.push(`Descuento: -$${d.valor.toFixed(2)}`);
      }
      if (d.motivo) lines.push(`  Motivo: ${d.motivo}`);
    }
  }

  const descuentoRow = pedido.descuentos || [];
  let totalDescCalc = 0;
  for (const d of descuentoRow) {
    if (d.tipo === 'porcentaje') totalDescCalc += totalBruto * d.valor / 100;
    else totalDescCalc += d.valor;
  }
  const totalNeto = Math.max(0, totalBruto - totalDescCalc);
  lines.push(`TOTAL: $${totalNeto.toFixed(2)}`.padStart(28));

  let totalPropina = 0;
  if (pedido.pagos && pedido.pagos.length) {
    lines.push('');
    lines.push('PAGOS:');
    for (const pg of pedido.pagos) {
      let pagoInfo = `  ${pg.metodo}: $${pg.monto.toFixed(2)}`;
      if (pg.propina > 0) {
        pagoInfo += ` (+$${pg.propina.toFixed(2)} propina)`;
        totalPropina += pg.propina;
      }
      if (pg.referencia) pagoInfo += ` [${pg.referencia}]`;
      if (pg.notas) pagoInfo += ` (${pg.notas})`;
      lines.push(pagoInfo);
    }
    const pagado = pedido.pagos.reduce((s, p) => s + p.monto, 0);
    if (pagado > totalNeto) {
      lines.push(`  CAMBIO: $${(pagado - totalNeto).toFixed(2)}`);
    }
  }

  if (totalPropina > 0) {
    lines.push('');
    lines.push(`PROPINA: $${totalPropina.toFixed(2)}`.padStart(28));
  }

  lines.push('');
  lines.push('\x1B\x61\x01');
  lines.push('Gracias por su visita!');
  lines.push('\x1B\x61\x00');
  lines.push('\n\n\n\n');
  lines.push('\x1B\x64\x02');
  lines.push('\x1B\x6D');

  return lines.join('\n');
}

function generateComandaText(pedido, items, mesa) {
  const lines = [];
  const now = new Date().toLocaleString('es-MX');

  lines.push('\x1B\x61\x01');
  lines.push('***  COMANDA  ***');
  lines.push('\x1B\x61\x00');
  lines.push('='.repeat(40));
  lines.push(`MESA: ${mesa.numero || mesa.nombre}`);
  lines.push(`TIPO: ${tipoLabel(mesa && mesa.area_tipo)}`);
  if (pedido.cliente_nombre) {
    lines.push(`Cliente: ${pedido.cliente_nombre}`);
    if (pedido.cliente_telefono) lines.push(`Tel: ${pedido.cliente_telefono}`);
    if (pedido.cliente_direccion) lines.push(`Dirección: ${pedido.cliente_direccion}`);
    if (pedido.hora_recogida) lines.push(`Recoger: ${pedido.hora_recogida}`);
  }
  lines.push(`Hora: ${now}`);
  if (pedido.mesero_nombre) lines.push(`Mesero: ${pedido.mesero_nombre}`);
  if (pedido.nota) lines.push(`NOTA: ${pedido.nota}`);
  lines.push('='.repeat(40));
  lines.push('');

  for (const item of items) {
    if (item.estado === 'CANCELADO') continue;
    lines.push(`  ${item.cantidad}x  ${item.producto_nombre}`);
    if (item.variante_nombre) lines.push(`      Var: ${item.variante_nombre}`);
    if (item.notas) lines.push(`      * ${item.notas}`);
    try {
      const mods = JSON.parse(item.modificadores_json || '[]');
      if (mods.length) lines.push(`      Mod: ${mods.map(m => m.nombre || m).join(', ')}`);
    } catch (e) {}
    try {
      const agrs = JSON.parse(item.agregados_json || '[]');
      if (agrs.length) lines.push(`      Agr: ${agrs.map(a => a.nombre || a).join(', ')}`);
    } catch (e) {}
    if (item.detalle) lines.push(`      Det: ${item.detalle}`);
    lines.push('');
  }

  lines.push('='.repeat(40));
  lines.push(`Pedido #${pedido.id}`);
  lines.push('\n\n\n\n');
  lines.push('\x1B\x64\x02');
  lines.push('\x1B\x6D');

  return lines.join('\n');
}

function printViaPowerShell(text, printerName) {
  const printer = config[printerName];
  if (!printer || !printer.habilitada) {
    console.log(`[PRINTER ${printerName}] Deshabilitada`);
    return { ok: false, reason: 'disabled' };
  }

  const printerDisplayName = printer.nombre_impresora || printerName;
  const tmpFile = path.join(__dirname, '..', 'data', `_print_${printerName}_${Date.now()}.txt`);
  const tmpCopy = tmpFile.replace('.txt', '_copy.txt');

  try {
    fs.writeFileSync(tmpFile, text, 'utf8');

    let printed = false;
    const errors = [];

    // Método 1: Out-Printer con pipeline
    try {
      execSync(
        `Get-Content -Path "${tmpFile}" -Raw | Out-Printer -Name "${printerDisplayName}"`,
        { shell: 'powershell', timeout: 15000, stdio: 'pipe' }
      );
      printed = true;
    } catch (e) {
      errors.push('Out-Printer: ' + e.message);
    }

    // Método 2: Copy-Item al puerto (fallback)
    if (!printed) {
      try {
        const portCmd = `Copy-Item -Path "${tmpFile}" -Destination "${printerDisplayName}"`;
        execSync(portCmd, { shell: 'powershell', timeout: 5000, stdio: 'pipe' });
        printed = true;
      } catch (e) {
        errors.push('Copy-Item: ' + e.message);
      }
    }

    // Método 3: cmd print command via share (fallback)
    if (!printed) {
      try {
        execSync(
          `copy "${tmpFile}" "\\\\localhost\\${printerDisplayName}"`,
          { shell: 'cmd', timeout: 5000, stdio: 'pipe' }
        );
        printed = true;
      } catch (e) {
        errors.push('copy: ' + e.message);
      }
    }

    // Método 4: Write-Printer con bytes (fallback)
    if (!printed) {
      try {
        const psBytesCmd = `
          \$bytes = [System.IO.File]::ReadAllBytes("${tmpFile}");
          Write-Printer -Name "${printerDisplayName}" -Data \$bytes
        `;
        execSync(psBytesCmd, { shell: 'powershell', timeout: 15000, stdio: 'pipe' });
        printed = true;
      } catch (e) {
        errors.push('Write-Printer: ' + e.message);
      }
    }

    // Cleanup temp files
    try { fs.unlinkSync(tmpFile); } catch (e) {}
    try { fs.unlinkSync(tmpCopy); } catch (e) {}

    if (printed) {
      console.log(`[PRINTER ${printerName}] Impreso en "${printerDisplayName}"`);
      return { ok: true };
    }

    throw new Error(errors.join(' | '));
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch (e) {}
    try { fs.unlinkSync(tmpCopy); } catch (e) {}

    console.error(`[PRINTER ${printerName}] Error:`, err.message);

    const fallbackDir = path.join(__dirname, '..', 'prints');
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
    const filename = `${printerName}_${Date.now()}.txt`;
    fs.writeFileSync(path.join(fallbackDir, filename), text);
    console.log(`[PRINTER ${printerName}] Guardado en prints/${filename}`);

    return { ok: false, reason: err.message };
  }
}

function generatePrecuentaText(pedido, items, mesa) {
  const lines = [];
  const totalBruto = items.reduce((sum, i) => sum + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);
  const now = new Date().toLocaleString('es-MX');

  lines.push('\x1B\x61\x01');
  lines.push('='.repeat(32));
  lines.push('RESTAURANTE SARITA');
  lines.push('*** PRE-CUENTA ***');
  lines.push('(NO VÁLIDO COMO COMPROBANTE)');
  lines.push('='.repeat(32));
  lines.push('\x1B\x61\x00');
  lines.push('');
  lines.push(`Mesa: ${mesa.numero || mesa.nombre}     ${now}`);
  lines.push(`Pedido: #${pedido.id}`);
  if (pedido.mesero_nombre) lines.push(`Mesero: ${pedido.mesero_nombre}`);
  if (pedido.cliente_nombre) {
    lines.push('');
    pushClienteLines(lines, pedido, mesa && mesa.area_tipo);
  }
  lines.push('-'.repeat(32));
  lines.push('');

  for (const item of items) {
    const precioUnit = item.precio_unitario + (item.precio_adicional || 0);
    const importe = (item.cantidad * precioUnit).toFixed(2);
    lines.push(`${item.cantidad}x ${item.producto_nombre}`);
    lines.push(`  $${item.precio_unitario.toFixed(2)}  ->  $${importe}`);
    if (item.variante_nombre) lines.push(`  Var: ${item.variante_nombre}`);
    if (item.notas) lines.push(`  * ${item.notas}`);
    try {
      const mods = JSON.parse(item.modificadores_json || '[]');
      if (mods.length) lines.push(`  Mod: ${mods.map(m => m.nombre || m).join(', ')}`);
    } catch (e) {}
    try {
      const agrs = JSON.parse(item.agregados_json || '[]');
      if (agrs.length) lines.push(`  Agr: ${agrs.map(a => a.nombre || a).join(', ')}`);
    } catch (e) {}
    lines.push('');
  }

  lines.push('-'.repeat(32));
  lines.push(`Subtotal: $${totalBruto.toFixed(2)}`.padStart(28));

  const descuentoRow = pedido.descuentos || [];
  let totalDescCalc = 0;
  for (const d of descuentoRow) {
    if (d.tipo === 'porcentaje') {
      const m = totalBruto * d.valor / 100;
      totalDescCalc += m;
      lines.push(`Descuento ${d.valor}%: -$${m.toFixed(2)}`);
    } else {
      totalDescCalc += d.valor;
      lines.push(`Descuento: -$${d.valor.toFixed(2)}`);
    }
  }
  const totalNeto = Math.max(0, totalBruto - totalDescCalc);
  lines.push(`TOTAL: $${totalNeto.toFixed(2)}`.padStart(28));

  lines.push('');
  lines.push('-'.repeat(32));
  lines.push(' PROPINA SUGERIDA:');
  lines.push(`  10%: $${(totalNeto * 0.10).toFixed(2)}`);
  lines.push(`  15%: $${(totalNeto * 0.15).toFixed(2)}`);
  lines.push('-'.repeat(32));

  lines.push('');
  lines.push('\x1B\x61\x01');
  lines.push('Solicite su comprobante final');
  lines.push('¡Muchas Gracias!');
  lines.push('\x1B\x61\x00');
  lines.push('\n\n\n\n');
  lines.push('\x1B\x64\x02');
  lines.push('\x1B\x6D');

  return lines.join('\n');
}

function printTicket(pedido, items, mesa) {
  const text = generateTicketText(pedido, items, mesa);
  return printViaPowerShell(text, 'caja');
}

function printPrecuenta(pedido, items, mesa) {
  const text = generatePrecuentaText(pedido, items, mesa);
  return printViaPowerShell(text, 'caja');
}

function printComanda(pedido, items, mesa) {
  const text = generateComandaText(pedido, items, mesa);
  return printViaPowerShell(text, 'cocina');
}

function generateResumenMovimientosText(fecha, movimientos, totales) {
  const lines = [];
  const now = new Date().toLocaleString('es-MX');

  lines.push('\x1B\x61\x01');
  lines.push('='.repeat(32));
  lines.push('RESUMEN DE MOVIMIENTOS');
  lines.push('RESTAURANTE SARITA');
  lines.push('='.repeat(32));
  lines.push('\x1B\x61\x00');
  lines.push(`Fecha: ${fecha}`);
  lines.push(`Hora: ${now}`);
  lines.push('-'.repeat(32));
  lines.push('');

  const metodosLabel = { efectivo: '💵 Efectivo', yape: '📱 Yape', plin: '📱 Plin', tarjeta: '💳 Tarjeta', transferencia: '🏦 Transferencia' };

  if (movimientos.length === 0) {
    lines.push('  Sin movimientos registrados');
  } else {
    for (const mv of movimientos) {
      const tipoLabel = mv.tipo === 'INGRESO' ? '➕ INGRESO' : '➖ EGRESO';
      lines.push(`${tipoLabel}`);
      lines.push(`  Concepto: ${mv.concepto}`);
      lines.push(`  Monto: $${mv.monto.toFixed(2)} (${metodosLabel[mv.metodo_pago] || mv.metodo_pago})`);
      if (mv.persona) lines.push(`  Persona: ${mv.persona}`);
      if (mv.usuario_nombre) lines.push(`  Registró: ${mv.usuario_nombre}`);
      if (mv.notas) lines.push(`  Notas: ${mv.notas}`);
      lines.push('');
    }
  }

  lines.push('-'.repeat(32));
  lines.push(`INGRESOS: $${totales.ingresos.toFixed(2)}`.padStart(28));
  lines.push(`EGRESOS:  $${totales.egresos.toFixed(2)}`.padStart(28));
  lines.push(`SALDO:    $${(totales.ingresos - totales.egresos).toFixed(2)}`.padStart(28));
  lines.push('');

  if (totales.por_metodo) {
    lines.push('Por método:');
    for (const [met, val] of Object.entries(totales.por_metodo)) {
      const label = metodosLabel[met] || met;
      lines.push(`  ${label}: +$${val.ingresos.toFixed(2)} / -$${val.egresos.toFixed(2)}`);
    }
  }

  lines.push('');
  lines.push('\x1B\x61\x01');
  lines.push('Fin del reporte');
  lines.push('\x1B\x61\x00');
  lines.push('\n\n\n\n');
  lines.push('\x1B\x64\x02');
  lines.push('\x1B\x6D');

  return lines.join('\n');
}

function printResumenMovimientos(fecha, movimientos, totales) {
  const text = generateResumenMovimientosText(fecha, movimientos, totales);
  return printViaPowerShell(text, 'caja');
}

function getConfig() {
  return config;
}

function updateConfig(newConfig) {
  if (newConfig.caja) config.caja = { ...config.caja, ...newConfig.caja };
  if (newConfig.cocina) config.cocina = { ...config.cocina, ...newConfig.cocina };
  saveConfig();
  return config;
}

function testPrinter(printerName) {
  const text = `PRUEBA DE IMPRESION - POS SARITA
${new Date().toLocaleString('es-MX')}
Impresora: ${config[printerName]?.nombre_impresora || printerName}

Si lees esto, la impresora funciona correctamente.

LINEA 1 ............  $10.00
LINEA 2 ............  $20.00
LINEA 3 ............  $30.00
--------------------------------
TOTAL ..............  $60.00

Gracias!



`;
  return printViaPowerShell(text, printerName);
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
  printComanda,
  printResumenMovimientos,
  getConfig,
  updateConfig,
  testPrinter,
  detectPrinters
};
