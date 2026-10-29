// Editor de nota por bloques: cuadros de texto y tablas con celdas editables
import { textBlock, tableBlock, tidyBlocks } from './blocks.js';
import { CHECK_RE } from './views/cards.js';

let root = null;        // contenedor #note-blocks
let onChange = () => {};
let lastText = null;    // último cuadro de texto con el foco
let lastCell = null;    // última celda con el foco

export function initEditor(container, changeHandler) {
  root = container;
  onChange = changeHandler;

  root.addEventListener('focusin', e => {
    if (e.target.matches('.block-text')) lastText = e.target;
    if (e.target.matches('.cell')) lastCell = e.target;
  });

  root.addEventListener('input', e => {
    if (e.target.matches('.block-text')) autoGrow(e.target);
    onChange();
  });

  root.addEventListener('keydown', e => {
    if (e.target.matches('.block-text')) handleTextEnter(e);
    else if (e.target.matches('.cell')) handleCellKey(e);
  });

  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-tbl-action]');
    if (btn) tableAction(btn.closest('.block-table'), btn.dataset.tblAction);
  });

  // Que los botones de la tabla no cierren el teclado
  root.addEventListener('mousedown', e => {
    if (e.target.closest('[data-tbl-action]')) e.preventDefault();
  });
}

// ---------- Construcción del DOM ----------
function makeText(block) {
  const ta = document.createElement('textarea');
  ta.className = 'block-text';
  ta.dataset.block = block.id;
  ta.rows = 1;
  ta.value = block.text;
  ta.placeholder = 'Escribe aquí...';
  return ta;
}

function makeCell(value, isHeader) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cell' + (isHeader ? ' cell-head' : '');
  input.value = value;
  input.enterKeyHint = 'next';
  input.setAttribute('aria-label', 'Celda');
  return input;
}

function makeTable(block) {
  const wrap = document.createElement('div');
  wrap.className = 'block-table';
  wrap.dataset.block = block.id;

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'edit-table';
  const tbody = document.createElement('tbody');
  block.rows.forEach((row, r) => {
    const tr = document.createElement('tr');
    row.forEach(val => {
      const td = document.createElement('td');
      td.appendChild(makeCell(val, r === 0));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  scroll.appendChild(table);

  const tools = document.createElement('div');
  tools.className = 'table-tools';
  tools.innerHTML = `
    <button type="button" data-tbl-action="add-row">+ Fila</button>
    <button type="button" data-tbl-action="add-col">+ Columna</button>
    <button type="button" data-tbl-action="del-row">− Fila</button>
    <button type="button" data-tbl-action="del-col">− Columna</button>
    <button type="button" data-tbl-action="del-table" class="danger" aria-label="Eliminar tabla">🗑</button>`;

  wrap.append(scroll, tools);
  return wrap;
}

export function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

export function loadBlocks(blocks) {
  root.replaceChildren(...blocks.map(b => b.type === 'text' ? makeText(b) : makeTable(b)));
  lastText = root.querySelector('.block-text');
  lastCell = null;
  requestAnimationFrame(() => root.querySelectorAll('.block-text').forEach(autoGrow));
}

export function readBlocks() {
  return [...root.children].map(el => {
    if (el.matches('.block-text')) {
      return { id: el.dataset.block, type: 'text', text: el.value.replace(/\s+$/, '') };
    }
    const rows = [...el.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('.cell')].map(c => c.value));
    return { id: el.dataset.block, type: 'table', rows };
  });
}

export function focusStart() {
  const first = root.querySelector('.block-text');
  if (first) first.focus();
}

export function refreshSizes() {
  root.querySelectorAll('.block-text').forEach(autoGrow);
}

// ---------- Insertar tabla en la posición del cursor ----------
export function insertTable(rows, cols) {
  const blocks = readBlocks();
  const table = tableBlock(rows, cols);
  let target = lastText && root.contains(lastText) ? lastText : null;

  if (!target) {
    blocks.push(table);
  } else {
    const i = blocks.findIndex(b => b.id === target.dataset.block);
    const value = target.value;
    const pos = target.selectionStart ?? value.length;
    // Partir el texto donde está el cursor (al final de la línea actual)
    const nl = value.indexOf('\n', pos);
    const cut = nl === -1 ? value.length : nl;
    const before = value.slice(0, cut);
    const after = value.slice(cut).replace(/^\n/, '');
    blocks.splice(i, 1, textBlock(before), table, textBlock(after));
  }

  loadBlocks(tidyBlocks(blocks));
  const firstCell = root.querySelector(`.block-table[data-block="${table.id}"] .cell`);
  if (firstCell) {
    firstCell.focus();
    firstCell.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  onChange();
}

// ---------- Acciones de tabla ----------
function cellPos(cell) {
  const td = cell.closest('td');
  const tr = td.parentElement;
  return { row: [...tr.parentElement.children].indexOf(tr), col: [...tr.children].indexOf(td) };
}

function focusCell(wrap, row, col) {
  const trs = wrap.querySelectorAll('tr');
  const tr = trs[Math.min(row, trs.length - 1)];
  const cells = tr?.querySelectorAll('.cell');
  const cell = cells?.[Math.min(col, cells.length - 1)];
  if (cell) cell.focus();
}

function tableAction(wrap, action) {
  const tbody = wrap.querySelector('tbody');
  const trs = [...tbody.children];
  const cols = trs[0].children.length;
  const ref = lastCell && wrap.contains(lastCell) ? cellPos(lastCell) : { row: trs.length - 1, col: cols - 1 };

  if (action === 'add-row') {
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      td.appendChild(makeCell('', false));
      tr.appendChild(td);
    }
    trs[ref.row].after(tr);
    focusCell(wrap, ref.row + 1, ref.col);
  }

  if (action === 'add-col') {
    trs.forEach((tr, r) => {
      const td = document.createElement('td');
      td.appendChild(makeCell('', r === 0));
      tr.children[ref.col].after(td);
    });
    focusCell(wrap, ref.row, ref.col + 1);
  }

  if (action === 'del-row') {
    if (trs.length === 1) return tableAction(wrap, 'del-table');
    if (rowHasText(trs[ref.row]) && !confirm('¿Quitar esta fila con su contenido?')) return;
    trs[ref.row].remove();
    // Si se quitó el encabezado, la nueva primera fila pasa a serlo
    tbody.firstElementChild.querySelectorAll('.cell').forEach(c => c.classList.add('cell-head'));
    focusCell(wrap, ref.row, ref.col);
  }

  if (action === 'del-col') {
    if (cols === 1) return tableAction(wrap, 'del-table');
    const hasText = trs.some(tr => tr.children[ref.col].querySelector('.cell').value.trim());
    if (hasText && !confirm('¿Quitar esta columna con su contenido?')) return;
    trs.forEach(tr => tr.children[ref.col].remove());
    focusCell(wrap, ref.row, ref.col);
  }

  if (action === 'del-table') {
    if (!confirm('¿Eliminar la tabla completa?')) return;
    wrap.remove();
    loadBlocks(tidyBlocks(readBlocks()));
  }

  onChange();
}

function rowHasText(tr) {
  return [...tr.querySelectorAll('.cell')].some(c => c.value.trim());
}

// Enter en una celda baja a la fila siguiente; en la última fila crea una nueva
function handleCellKey(e) {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  const cell = e.target;
  const wrap = cell.closest('.block-table');
  const { row, col } = cellPos(cell);
  const rows = wrap.querySelectorAll('tr').length;
  if (row < rows - 1) {
    focusCell(wrap, row + 1, col);
  } else {
    lastCell = cell;
    tableAction(wrap, 'add-row');
  }
}

// ---------- Listas de tareas dentro del texto ----------
function lineBounds(value, pos) {
  const start = value.lastIndexOf('\n', pos - 1) + 1;
  const nl = value.indexOf('\n', pos);
  return { start, end: nl === -1 ? value.length : nl };
}

export function insertList() {
  const ta = lastText && root.contains(lastText) ? lastText : root.querySelector('.block-text');
  if (!ta) return;
  const v = ta.value;
  const s = ta.selectionStart ?? v.length;
  const e = ta.selectionEnd ?? v.length;
  const { start, end } = lineBounds(v, s);

  if (s !== e) {
    const blockEnd = lineBounds(v, e).end;
    const block = v.slice(start, blockEnd).split('\n')
      .map(l => (CHECK_RE.test(l) || !l.trim()) ? l : '- [ ] ' + l).join('\n');
    ta.setRangeText(block, start, blockEnd, 'end');
  } else if (!v.slice(start, end).trim()) {
    ta.setRangeText('- [ ] ', start, end, 'end');
  } else {
    ta.setRangeText('\n- [ ] ', end, end, 'end');
  }
  ta.focus();
  autoGrow(ta);
  onChange();
}

function handleTextEnter(e) {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  const ta = e.target;
  if (ta.selectionStart !== ta.selectionEnd) return;
  const s = ta.selectionStart;
  const { start, end } = lineBounds(ta.value, s);
  if (s !== end) return;
  const m = ta.value.slice(start, end).match(CHECK_RE);
  if (!m) return;
  e.preventDefault();
  if (!m[4].trim()) ta.setRangeText('', start, end, 'end');
  else ta.setRangeText('\n- [ ] ', s, s, 'end');
  autoGrow(ta);
  onChange();
}
