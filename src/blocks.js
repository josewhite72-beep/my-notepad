// Modelo de la nota por bloques: [{ id, type: 'text', text } | { id, type: 'table', rows: [[celda]] }]

const TABLE_LINE = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/;

export const blockId = () => Math.random().toString(36).slice(2, 10);

export function textBlock(text = '') {
  return { id: blockId(), type: 'text', text };
}

export function tableBlock(rows = 3, cols = 3) {
  return {
    id: blockId(),
    type: 'table',
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''))
  };
}

function splitCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

// Iguala el número de columnas de todas las filas
function squareRows(rows) {
  const cols = Math.max(1, ...rows.map(r => r.length));
  return rows.map(r => Array.from({ length: cols }, (_, i) => String(r[i] ?? '')));
}

// Convierte el texto antiguo (con tablas escritas con barras) en bloques
export function parseBody(body = '') {
  const blocks = [];
  let textBuf = [];
  let tableBuf = [];

  const flushText = () => {
    if (textBuf.length) blocks.push(textBlock(textBuf.join('\n')));
    textBuf = [];
  };
  const flushTable = () => {
    const rows = tableBuf.filter(l => !TABLE_SEP.test(l)).map(splitCells);
    if (rows.length) blocks.push({ id: blockId(), type: 'table', rows: squareRows(rows) });
    tableBuf = [];
  };

  for (const line of body.split('\n')) {
    if (TABLE_LINE.test(line)) {
      flushText();
      tableBuf.push(line);
    } else {
      flushTable();
      textBuf.push(line);
    }
  }
  flushTable();
  flushText();
  return blocks;
}

// Limpia bloques (de la base de datos o de una copia importada)
export function sanitizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return null;
  const clean = [];
  for (const b of blocks) {
    if (b?.type === 'text') {
      clean.push({ id: String(b.id || blockId()), type: 'text', text: String(b.text ?? '') });
    } else if (b?.type === 'table' && Array.isArray(b.rows) && b.rows.length) {
      const rows = b.rows.filter(Array.isArray);
      if (rows.length) clean.push({ id: String(b.id || blockId()), type: 'table', rows: squareRows(rows) });
    }
  }
  return clean;
}

// Siempre hay texto al inicio y al final, y nunca dos textos seguidos
export function tidyBlocks(blocks) {
  const out = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (b.type === 'text' && prev?.type === 'text') {
      prev.text = [prev.text, b.text].filter(t => t !== '').join('\n');
    } else {
      out.push(b);
    }
  }
  if (out[0]?.type !== 'text') out.unshift(textBlock(''));
  if (out[out.length - 1].type !== 'text') out.push(textBlock(''));
  return out;
}

// Bloques de una nota, venga del formato nuevo o del antiguo (solo body)
export function noteBlocks(note) {
  const blocks = sanitizeBlocks(note?.blocks) || parseBody(note?.body || '');
  return tidyBlocks(blocks.length ? blocks : [textBlock('')]);
}

// Texto plano equivalente: sirve para buscar y como respaldo legible
export function blocksToBody(blocks) {
  return blocks.map(b => b.type === 'text'
    ? b.text
    : b.rows.map(r => `| ${r.join(' | ')} |`).join('\n')
  ).join('\n').replace(/\s+$/, '');
}

export function blocksEmpty(blocks) {
  return blocks.every(b => b.type === 'text' ? !b.text.trim() : false);
}
