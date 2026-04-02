function value(root, field) {
  return root.querySelector(`[data-field="${field}"]`)?.value;
}

function checked(root, field) {
  return root.querySelector(`[data-field="${field}"]`)?.checked || false;
}

function closeWithRender(ctx, nextState) {
  ctx.setState(nextState);
  ctx.render();
}

export async function handlePrepClick(event, ctx) {
  const {
    state,
    root,
    documentRef,
    windowRef,
    setState,
    render,
    commit,
    createDataset,
    fetchDatasets,
    setDatasets,
    setPrepError,
    clearPrepTransforms,
    setActivePanel,
    closeActivePanel,
    toggleRowExclusion,
    updateColumnMeta,
    addColumnMeta,
    addPrepTransform,
    setPrepTable,
    setColumns,
    setProfileCache,
    markPrepSaved,
    undoPrepTransform,
    undoPrepTransformTo,
    replayPrepTransforms,
    cleanText,
    filterRows,
    findReplace,
    removeDuplicates,
    handleMissing,
    renameColumn,
    changeColumnType,
    addCalculatedColumn,
    recodeValues,
    binColumn,
    splitColumn,
    concatColumns,
  } = ctx;

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return false;
  const action = actionTarget.dataset.action;

  switch (action) {
    case "prep-undo-to":
    case "prep-undo": {
      const stepIdx = action === "prep-undo-to" ? parseInt(actionTarget.dataset.step, 10) : undefined;
      if (state.dataPrep.transforms.length === 0) return true;
      let next = stepIdx != null ? undoPrepTransformTo(state, stepIdx) : undoPrepTransform(state);
      const replayed = replayPrepTransforms(next);
      if (replayed) {
        next = setPrepTable(next, replayed.table);
        next = setColumns(next, replayed.columns);
        next = setProfileCache(next, {});
        if (next.dataPrep.transforms.length === 0) next = markPrepSaved(next);
      }
      setState(next);
      render();
      return true;
    }
    case "prep-trim": {
      const cols = state.columnConfig.columns.filter((column) => column.dtype === "text");
      if (cols.length === 0 || !state.dataPrep.arqueroTable) return true;
      let table = state.dataPrep.arqueroTable;
      for (const column of cols) {
        try {
          table = cleanText(table, column.name, "trim");
        } catch {
          // Preserve previous skip-on-failure behavior.
        }
      }
      let next = addPrepTransform(state, { type: "trim", params: { columns: cols.map((column) => column.name) } });
      next = setPrepTable(next, table);
      setState(next);
      render();
      return true;
    }
    case "prep-save": {
      if (!state.dataPrep.rawRows || !state.dataPrep.selectedDatasetId) return true;
      try {
        await createDataset({
          name: `${state.datasets.find((dataset) => dataset.id === state.dataPrep.selectedDatasetId)?.name} (cleaned)`,
          columns: state.columnConfig.columns,
          rows: state.dataPrep.arqueroTable
            ? state.dataPrep.arqueroTable.objects().map((row) => {
                const out = {};
                for (const [key, rawValue] of Object.entries(row)) out[key] = rawValue != null ? String(rawValue) : "";
                return out;
              })
            : state.dataPrep.rawRows,
        });
        const datasets = await fetchDatasets();
        let next = setDatasets(state, datasets);
        next = markPrepSaved(next);
        setState(next);
        render();
      } catch (err) {
        commit(setPrepError(state, err.message));
      }
      return true;
    }
    case "prep-export-csv": {
      const exportTable = state.dataPrep.arqueroTable;
      const exportCols = state.columnConfig.columns || [];
      if (exportTable && exportCols.length > 0) {
        const header = exportCols.map((column) => column.name).join(",");
        const rows = exportTable.objects().map((row) =>
          exportCols
            .map((column) => {
              const rawValue = row[column.name];
              if (rawValue == null) return "";
              const stringValue = String(rawValue);
              return stringValue.includes(",") || stringValue.includes("\"") || stringValue.includes("\n")
                ? `"${stringValue.replace(/"/g, "\"\"")}"`
                : stringValue;
            })
            .join(",")
        );
        const csv = [header, ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const anchor = documentRef.createElement("a");
        const dataset = state.datasets.find((item) => item.id === state.dataPrep.selectedDatasetId);
        anchor.href = url;
        anchor.download = `${dataset?.name || "export"}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      return true;
    }
    case "prep-reset": {
      if (state.dataPrep.transforms.length === 0) return true;
      if (state.dataPrep.confirmingReset) {
        clearTimeout(windowRef._resetConfirmTimer);
        let next = clearPrepTransforms(state);
        next = { ...next, dataPrep: { ...next.dataPrep, confirmingReset: false } };
        commit(next);
      } else {
        const next = { ...state, dataPrep: { ...state.dataPrep, confirmingReset: true } };
        commit(next);
        windowRef._resetConfirmTimer = setTimeout(() => {
          if (state.dataPrep.confirmingReset) {
            commit({ ...state, dataPrep: { ...state.dataPrep, confirmingReset: false } });
          }
        }, 3000);
      }
      return true;
    }
    case "prep-filter":
      commit(setActivePanel(state, "filter"));
      return true;
    case "prep-find-replace":
      commit(setActivePanel(state, "find"));
      return true;
    case "prep-dedup":
      commit(setActivePanel(state, "dedup"));
      return true;
    case "prep-missing":
      commit(setActivePanel(state, "missing"));
      return true;
    case "prep-rename":
      commit(setActivePanel(state, "rename"));
      return true;
    case "prep-change-type":
      commit(setActivePanel(state, "change_type"));
      return true;
    case "prep-calc":
      commit(setActivePanel(state, "calculated"));
      return true;
    case "prep-recode":
      commit(setActivePanel(state, "recode"));
      return true;
    case "prep-bin":
      commit(setActivePanel(state, "bin"));
      return true;
    case "prep-split":
      commit(setActivePanel(state, "split"));
      return true;
    case "prep-concat":
      commit(setActivePanel(state, "concat"));
      return true;
    case "prep-apply-filter": {
      if (!state.dataPrep.arqueroTable) return true;
      const column = value(root, "filter-col");
      const operator = value(root, "filter-op");
      const val = value(root, "filter-val");
      const val2 = value(root, "filter-val2");
      if (!column || !operator) return true;
      const filterVal = operator === "between" ? [val, val2] : (operator === "is_null" || operator === "is_not_null") ? null : val;
      try {
        const table = filterRows(state.dataPrep.arqueroTable, column, operator, filterVal);
        let next = addPrepTransform(state, { type: "filter", params: { column, operator, value: filterVal } });
        next = setPrepTable(next, table);
        next = closeActivePanel(next);
        closeWithRender(ctx, next);
      } catch (err) {
        commit(setPrepError(state, err.message));
      }
      return true;
    }
    case "prep-apply-find": {
      if (!state.dataPrep.arqueroTable) return true;
      const column = value(root, "find-col");
      const search = value(root, "find-search");
      const replace = value(root, "find-replace") ?? "";
      const useRegex = checked(root, "find-regex");
      if (!search) return true;
      try {
        let table = state.dataPrep.arqueroTable;
        if (column === "__all__") {
          for (const col of table.columnNames()) {
            try {
              table = findReplace(table, col, search, replace, useRegex);
            } catch {
              // Preserve previous skip-on-failure behavior.
            }
          }
        } else {
          table = findReplace(table, column, search, replace, useRegex);
        }
        let next = addPrepTransform(state, { type: "find_replace", params: { column, find: search, replace, useRegex } });
        next = setPrepTable(next, table);
        next = closeActivePanel(next);
        closeWithRender(ctx, next);
      } catch (err) {
        commit(setPrepError(state, err.message));
      }
      return true;
    }
    case "prep-apply-dedup": {
      if (!state.dataPrep.arqueroTable) return true;
      const selectedColumns = [...root.querySelectorAll('[data-field="dedup-col"]:checked')].map((el) => el.value);
      if (selectedColumns.length === 0) return true;
      try {
        const table = removeDuplicates(state.dataPrep.arqueroTable, selectedColumns);
        let next = addPrepTransform(state, { type: "dedup", params: { keyColumns: selectedColumns } });
        next = setPrepTable(next, table);
        next = closeActivePanel(next);
        closeWithRender(ctx, next);
      } catch (err) {
        commit(setPrepError(state, err.message));
      }
      return true;
    }
    case "prep-apply-missing": {
      if (!state.dataPrep.arqueroTable) return true;
      const column = value(root, "missing-col");
      const strategy = value(root, "missing-strategy");
      const customValue = value(root, "missing-custom");
      if (!column || !strategy) return true;
      try {
        const table = handleMissing(state.dataPrep.arqueroTable, column, strategy, customValue || null);
        let next = addPrepTransform(state, { type: "missing", params: { column, strategy, customValue: customValue || null } });
        next = setPrepTable(next, table);
        next = closeActivePanel(next);
        closeWithRender(ctx, next);
      } catch (err) {
        commit(setPrepError(state, err.message));
      }
      return true;
    }
    case "prep-apply-rename": {
      if (!state.dataPrep.arqueroTable) return true;
      const oldName = value(root, "rename-col");
      const newName = value(root, "rename-new")?.trim();
      if (!oldName || !newName) return true;
      const existing = state.columnConfig.columns.map((column) => column.name);
      if (existing.includes(newName)) {
        commit(setPrepError(state, `Column "${newName}" already exists`));
        return true;
      }
      try {
        const table = renameColumn(state.dataPrep.arqueroTable, oldName, newName);
        let next = addPrepTransform(state, { type: "rename", params: { oldName, newName } });
        next = setPrepTable(next, table);
        next = updateColumnMeta(next, oldName, { name: newName });
        next = closeActivePanel(next);
        closeWithRender(ctx, next);
      } catch (err) {
        commit(setPrepError(state, err.message));
      }
      return true;
    }
    case "prep-apply-change-type": {
      if (!state.dataPrep.arqueroTable) return true;
      const column = value(root, "type-col");
      const targetType = value(root, "type-target");
      if (!column || !targetType) return true;
      try {
        const table = changeColumnType(state.dataPrep.arqueroTable, column, targetType);
        let next = addPrepTransform(state, { type: "change_type", params: { column, targetType } });
        next = setPrepTable(next, table);
        next = updateColumnMeta(next, column, { dtype: targetType });
        next = closeActivePanel(next);
        closeWithRender(ctx, next);
      } catch (err) {
        commit(setPrepError(state, err.message));
      }
      return true;
    }
    case "prep-apply-calc": {
      if (!state.dataPrep.arqueroTable) return true;
      const newColName = value(root, "calc-name")?.trim();
      const expression = value(root, "calc-expr")?.trim();
      if (!newColName || !expression) return true;
      const columns = state.columnConfig.columns.map((column) => column.name);
      if (columns.includes(newColName)) {
        commit(setPrepError(state, `Column "${newColName}" already exists`));
        return true;
      }
      try {
        const table = addCalculatedColumn(state.dataPrep.arqueroTable, newColName, expression, columns);
        let next = addPrepTransform(state, { type: "calculated", params: { newColName, expression, columns } });
        next = setPrepTable(next, table);
        next = addColumnMeta(next, [{ name: newColName, dtype: "numeric" }]);
        next = closeActivePanel(next);
        closeWithRender(ctx, next);
      } catch (err) {
        commit(setPrepError(state, err.message));
      }
      return true;
    }
    case "prep-apply-recode": {
      if (!state.dataPrep.arqueroTable) return true;
      const column = value(root, "recode-col");
      const asNew = checked(root, "recode-new-col");
      const newColName = asNew ? value(root, "recode-new-name")?.trim() : null;
      if (!column || (asNew && !newColName)) return true;
      const mapping = {};
      root.querySelectorAll(".prep-mapping-row").forEach((row) => {
        const oldValue = row.querySelector('[data-field="recode-old"]')?.value;
        const newValue = row.querySelector('[data-field="recode-new"]')?.value;
        if (oldValue != null && oldValue !== "") mapping[oldValue] = newValue ?? "";
      });
      if (Object.keys(mapping).length === 0) return true;
      try {
        const table = recodeValues(state.dataPrep.arqueroTable, column, mapping, newColName);
        let next = addPrepTransform(state, { type: "recode", params: { column, mapping, newColName } });
        next = setPrepTable(next, table);
        if (newColName) next = addColumnMeta(next, [{ name: newColName, dtype: "text" }]);
        next = closeActivePanel(next);
        closeWithRender(ctx, next);
      } catch (err) {
        commit(setPrepError(state, err.message));
      }
      return true;
    }
    case "prep-apply-bin": {
      if (!state.dataPrep.arqueroTable) return true;
      const column = value(root, "bin-col");
      const binCount = parseInt(value(root, "bin-count") || "5", 10);
      const useCustom = checked(root, "bin-custom");
      const newColName = value(root, "bin-name")?.trim() || `${column}_binned`;
      let customBreaks = null;
      if (useCustom) {
        const breaksStr = value(root, "bin-breaks") || "";
        customBreaks = breaksStr.split(",").map((part) => parseFloat(part.trim())).filter((n) => !isNaN(n)).sort((a, b) => a - b);
        if (customBreaks.length === 0) {
          commit(setPrepError(state, "Enter valid break values"));
          return true;
        }
      }
      if (!column) return true;
      try {
        const table = binColumn(state.dataPrep.arqueroTable, column, binCount, newColName, customBreaks);
        let next = addPrepTransform(state, { type: "bin", params: { column, binCount, newColName, customBreaks } });
        next = setPrepTable(next, table);
        next = addColumnMeta(next, [{ name: newColName, dtype: "text" }]);
        next = closeActivePanel(next);
        closeWithRender(ctx, next);
      } catch (err) {
        commit(setPrepError(state, err.message));
      }
      return true;
    }
    case "prep-apply-split": {
      if (!state.dataPrep.arqueroTable) return true;
      const column = value(root, "split-col");
      const delimiter = value(root, "split-delim") || ",";
      const maxParts = parseInt(value(root, "split-parts") || "2", 10);
      if (!column) return true;
      try {
        const table = splitColumn(state.dataPrep.arqueroTable, column, delimiter, maxParts);
        let next = addPrepTransform(state, { type: "split", params: { column, delimiter, maxParts } });
        next = setPrepTable(next, table);
        const newCols = Array.from({ length: maxParts }, (_, i) => ({ name: `${column}_${i + 1}`, dtype: "text" }));
        next = addColumnMeta(next, newCols);
        next = closeActivePanel(next);
        closeWithRender(ctx, next);
      } catch (err) {
        commit(setPrepError(state, err.message));
      }
      return true;
    }
    case "prep-apply-concat": {
      if (!state.dataPrep.arqueroTable) return true;
      const columns = [...root.querySelectorAll('[data-field="concat-col"]:checked')].map((el) => el.value);
      const separator = value(root, "concat-sep") ?? " ";
      const newColName = value(root, "concat-name")?.trim() || "combined";
      if (columns.length < 2) return true;
      try {
        const table = concatColumns(state.dataPrep.arqueroTable, columns, separator, newColName);
        let next = addPrepTransform(state, { type: "concat", params: { columns, separator, newColName } });
        next = setPrepTable(next, table);
        next = addColumnMeta(next, [{ name: newColName, dtype: "text" }]);
        next = closeActivePanel(next);
        closeWithRender(ctx, next);
      } catch (err) {
        commit(setPrepError(state, err.message));
      }
      return true;
    }
    case "prep-recode-add-row": {
      const container = root.querySelector(".prep-mapping-rows");
      if (container) {
        const row = documentRef.createElement("div");
        row.className = "prep-mapping-row";
        row.innerHTML = `<input type="text" data-field="recode-old" placeholder="old value" /><span class="prep-panel-label">-></span><input type="text" data-field="recode-new" placeholder="new value" />`;
        container.appendChild(row);
      }
      return true;
    }
    case "prep-validate":
      commit(setActivePanel(state, "validate"));
      return true;
    case "toggle-row-exclude": {
      const rowIdx = Number(actionTarget.dataset.row);
      if (!isNaN(rowIdx)) commit(toggleRowExclusion(state, rowIdx));
      return true;
    }
    case "prep-toggle-all-visible-rows": {
      const totalRows = state.dataPrep.arqueroTable ? state.dataPrep.arqueroTable.numRows() : state.dataPrep.datasetPoints.length;
      const visibleCount = Math.min(totalRows, 500);
      const current = new Set(state.dataPrep.excludedRows || []);
      const selectedVisibleCount = Array.from({ length: visibleCount }, (_, i) => i)
        .reduce((sum, i) => sum + (current.has(i) ? 0 : 1), 0);
      const shouldSelectAll = selectedVisibleCount !== visibleCount;
      for (let i = 0; i < visibleCount; i += 1) {
        if (shouldSelectAll) current.delete(i);
        else current.add(i);
      }
      commit({ ...state, dataPrep: { ...state.dataPrep, excludedRows: [...current].sort((a, b) => a - b) } });
      return true;
    }
    case "prep-apply-validate": {
      const column = value(root, "validate-col");
      const type = value(root, "validate-type");
      if (!column || !type) return true;
      let rule;
      if (type === "range") {
        const min = value(root, "validate-min");
        const max = value(root, "validate-max");
        rule = { type: "range", min: min !== "" ? Number(min) : null, max: max !== "" ? Number(max) : null };
      } else if (type === "allowed") {
        const values = (value(root, "validate-values") || "").split(",").map((part) => part.trim()).filter(Boolean);
        rule = { type: "allowed", values };
      } else if (type === "regex") {
        rule = { type: "regex", pattern: value(root, "validate-pattern") || "" };
      }
      if (rule) {
        let next = updateColumnMeta(state, column, { validation: rule });
        next = closeActivePanel(next);
        closeWithRender(ctx, next);
      }
      return true;
    }
    case "prep-clear-validate": {
      const column = value(root, "validate-col");
      if (column) {
        let next = updateColumnMeta(state, column, { validation: null });
        next = closeActivePanel(next);
        closeWithRender(ctx, next);
      }
      return true;
    }
    default:
      return false;
  }
}
