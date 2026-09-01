    let detectedPrinters = [];
    let configActual = {};

    async function init() {
      await Promise.all([cargarConfig(), detectarImpresoras()]);
    }

    async function cargarConfig() {
      try {
        const res = await fetch('/api/printers/config');
        configActual = await res.json();
      } catch (e) {
        console.error('Error loading config:', e);
      }
    }

    async function detectarImpresoras() {
      document.getElementById('loadingMsg').style.display = 'block';
      document.getElementById('cardCaja').style.display = 'none';
      document.getElementById('cardCocina').style.display = 'none';
      document.getElementById('cardBarra').style.display = 'none';

      try {
        const res = await fetch('/api/printers/detect');

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Error del servidor al detectar impresoras');
        }

        detectedPrinters = await res.json();

        if (!Array.isArray(detectedPrinters)) detectedPrinters = [];

        if (detectedPrinters.length === 0) {
          document.getElementById('loadingMsg').innerHTML = `
            <h2>No se detectaron impresoras</h2>
            <p style="margin-top:8px;">Asegúrate de que las impresoras estén instaladas en Windows</p>
          `;
          return;
        }

        document.getElementById('loadingMsg').style.display = 'none';
        document.getElementById('cardCaja').style.display = 'block';
        document.getElementById('cardCocina').style.display = 'block';
        document.getElementById('cardBarra').style.display = 'block';

        renderSelect('selectCaja', 'caja');
        renderSelect('selectCocina', 'cocina');
        renderSelect('selectBarra', 'barra');

      } catch (e) {
        document.getElementById('loadingMsg').innerHTML = `
          <h2>Error al detectar impresoras</h2>
          <p style="color:var(--red);">${e.message}</p>
        `;
      }
    }

    function renderSelect(selectId, tipo) {
      const select = document.getElementById(selectId);
      select.innerHTML = '<option value="">-- Seleccionar impresora --</option>';

      const currentName = configActual[tipo]?.nombre_impresora || '';

      for (const p of detectedPrinters) {
        if (!p.Name || p.Name.includes('OneNote')) continue;
        const opt = document.createElement('option');
        opt.value = p.Name;
        opt.innerHTML = `${p.Name} <small style="color:var(--gray)">(${p.PortName} · ${p.DriverName})</small>`;
        if (p.Name === currentName) opt.selected = true;
        select.appendChild(opt);
      }

      const statusEl = document.getElementById(`status${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`);
      if (currentName) {
        statusEl.className = 'printer-status ok';
        statusEl.innerHTML = `✅ Configurada: <strong>${currentName}</strong>`;
      } else {
        statusEl.className = 'printer-status waiting';
        statusEl.innerHTML = '⚙️ Sin configurar';
      }
    }

    async function testPrinter(tipo) {
      const select = document.getElementById(`select${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`);
      const printerName = select.value;
      const resultEl = document.getElementById(`testResult${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`);
      const statusEl = document.getElementById(`status${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`);

      if (!printerName) {
        resultEl.innerHTML = '<div class="test-result error">❌ Selecciona una impresora primero</div>';
        return;
      }

      statusEl.className = 'printer-status waiting';
      statusEl.innerHTML = '⏳ Imprimiendo prueba...';
      resultEl.innerHTML = '';

      try {
        const res = await fetch(`/api/printers/test/${tipo}`, { method: 'POST' });
        const data = await res.json();

        if (data.ok) {
          statusEl.className = 'printer-status ok';
          statusEl.innerHTML = `✅ <strong>${printerName}</strong> - Imprime correctamente`;
          resultEl.innerHTML = '<div class="test-result success">✅ Impresión de prueba enviada con éxito</div>';
        } else {
          statusEl.className = 'printer-status err';
          statusEl.innerHTML = `❌ Error: ${data.reason || 'No imprime'}`;
          resultEl.innerHTML = `<div class="test-result error">❌ Error: ${data.reason}. El archivo se guardó en la carpeta "prints/"</div>`;
        }
      } catch (e) {
        statusEl.className = 'printer-status err';
        statusEl.innerHTML = '❌ Error de conexión';
        resultEl.innerHTML = `<div class="test-result error">❌ ${e.message}</div>`;
      }
    }

    async function guardarConfig() {
      const cajaName = document.getElementById('selectCaja').value;
      const cocinaName = document.getElementById('selectCocina').value;
      const barraName = document.getElementById('selectBarra').value;

      if (!cajaName && !cocinaName && !barraName) {
        alert('Selecciona al menos una impresora');
        return;
      }

      const config = {};
      if (cajaName) config.caja = { nombre_impresora: cajaName, habilitada: true };
      if (cocinaName) config.cocina = { nombre_impresora: cocinaName, habilitada: true };
      if (barraName) config.barra = { nombre_impresora: barraName, habilitada: true };

      try {
        const res = await fetch('/api/printers/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
        if (res.ok) {
          alert('✅ Configuración guardada correctamente');
          configActual = await res.json();
          renderSelect('selectCaja', 'caja');
          renderSelect('selectCocina', 'cocina');
          renderSelect('selectBarra', 'barra');
        } else {
          alert('❌ Error al guardar');
        }
      } catch (e) {
        alert('❌ Error de conexión');
      }
    }

    init();