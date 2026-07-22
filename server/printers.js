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

function generateTicketText(pedido, items, mesa) {
  const lines = [];
  const total = items.reduce((sum, i) => sum + i.cantidad * i.precio_unitario, 0);
  const now = new Date().toLocaleString('es-MX');

  lines.push('\x1B\x61\x01'); // center
  lines.push('='.repeat(32));
  lines.push('RESTAURANTE SARITA');
  lines.push('='.repeat(32));
  lines.push('\x1B\x61\x00'); // left
  lines.push('');
  lines.push(`Mesa: ${mesa.numero}     ${now}`);
  lines.push(`Pedido: #${pedido.id}`);
  if (pedido.mesero_nombre) lines.push(`Mesero: ${pedido.mesero_nombre}`);
  lines.push('-'.repeat(32));
  lines.push('');

  for (const item of items) {
    const importe = (item.cantidad * item.precio_unitario).toFixed(2);
    lines.push(`${item.cantidad}x ${item.producto_nombre}`);
    lines.push(`  $${item.precio_unitario.toFixed(2)}  ->  $${importe}`);
    if (item.notas) lines.push(`  * ${item.notas}`);
    lines.push('');
  }

  lines.push('-'.repeat(32));
  lines.push(`TOTAL: $${total.toFixed(2)}`.padStart(28));
  lines.push('');
  lines.push('\x1B\x61\x01');
  lines.push('Gracias por su visita!');
  lines.push('\x1B\x61\x00');
  lines.push('\n\n\n\n');
  lines.push('\x1B\x64\x02'); // feed 2 lines
  lines.push('\x1B\x6D'); // partial cut

  return lines.join('\n');
}

function generateComandaText(pedido, items, mesa) {
  const lines = [];
  const now = new Date().toLocaleString('es-MX');

  lines.push('\x1B\x61\x01'); // center
  lines.push('***  COMANDA  ***');
  lines.push('\x1B\x61\x00');
  lines.push('='.repeat(40));
  lines.push(`MESA: ${mesa.numero}`);
  lines.push(`Hora: ${now}`);
  if (pedido.mesero_nombre) lines.push(`Mesero: ${pedido.mesero_nombre}`);
  if (pedido.nota) lines.push(`NOTA: ${pedido.nota}`);
  lines.push('='.repeat(40));
  lines.push('');

  for (const item of items) {
    lines.push(`  ${item.cantidad}x  ${item.producto_nombre}`);
    if (item.notas) lines.push(`      -> ${item.notas}`);
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

function printTicket(pedido, items, mesa) {
  const text = generateTicketText(pedido, items, mesa);
  return printViaPowerShell(text, 'caja');
}

function printComanda(pedido, items, mesa) {
  const text = generateComandaText(pedido, items, mesa);
  return printViaPowerShell(text, 'cocina');
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
  printComanda,
  getConfig,
  updateConfig,
  testPrinter,
  detectPrinters
};
