const qs = (id) => document.getElementById(id);

const statusEl = qs("status");
const detailsEl = qs("details");
const toastEl = qs("toast");
const refreshButton = qs("refresh");
const installButton = qs("install");
const apiConfigEl = qs("api-config");
const apiBaseUrlInput = qs("api-base-url");
const saveApiUrlButton = qs("save-api-url");

const authDetailsEl = qs("auth-details");
const farmDetailsEl = qs("farm-details");
const farmListEl = qs("farm-list");
const plotDetailsEl = qs("plot-details");
const plotListEl = qs("plot-list");
const cropDetailsEl = qs("crop-details");
const cropListEl = qs("crop-list");
const activityDetailsEl = qs("activity-details");
const activityListEl = qs("activity-list");
const reportDetailsEl = qs("report-details");
const dashboardMetricsEl = qs("dashboard-metrics");
const dashboardAlertsEl = qs("dashboard-alerts");
const operationalModuleEl = qs("operational-module");
const operationalFarmEl = qs("operational-farm");
const operationalPlotEl = qs("operational-plot");
const operationalCropEl = qs("operational-crop");
const operationalFieldsEl = qs("operational-fields");
const operationalDetailsEl = qs("operational-details");
const operationalListEl = qs("operational-list");

let authToken = localStorage.getItem("agro_token") || "";
let deferredInstallPrompt;
let editingFarmId = null;
let editingPlotId = null;
let editingCropId = null;
let editingOperationalId = null;
let operationalRecordsCache = [];
let capturedGps = null;
let farmsCache = [];
let plotsCache = [];
let cropsCache = [];
let toastTimer;
const isNativeApp = location.protocol === "capacitor:" || location.protocol === "ionic:";
const urlParams = new URLSearchParams(location.search);
const isDesktopMode = urlParams.get("desktop") === "1";
let apiBaseUrl = getInitialApiBaseUrl();
let forceApiConfigVisible = false;

const ROLE_LABELS = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  OPERATOR: "Operador"
};

function showToast(message, type = "info") {
  if (!toastEl || !message) return;

  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = `toast ${type === "info" ? "" : type}`.trim();
  toastEl.hidden = false;
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 3600);
}

function describeResponse(el, value) {
  if (!value) return "";
  if (typeof value === "string") return value;

  if (el === detailsEl) {
    return "Sistema online e pronto para uso.";
  }

  if (el === authDetailsEl) {
    const user = value.user;
    if (user) return `Sessão ativa: ${user.name} (${ROLE_LABELS[user.role] || user.role}).`;
    return "";
  }

  if (el === reportDetailsEl) {
    if (value.summary) {
      const summary = value.summary;
      return `Total de atividades: ${summary.total}. Plantio: ${summary.PLANTIO}. Colheita: ${summary.COLHEITA}. Aplicações: ${summary.APLICACAO}. Quantidade total: ${summary.quantityTotal}.`;
    }

    if (Array.isArray(value.items)) {
      if (!value.items.length) return "Nenhum dado encontrado para este relatório.";
      return value.items.map((item) => `${item.cropName || item.title || "Item"}: ${item.total ?? ""}`).join(" | ");
    }
  }

  if (el === operationalDetailsEl) {
    if (value.item) return "Registro salvo com sucesso.";
    if (Array.isArray(value.items)) {
      const queue = value.offlineQueue ? ` ${value.offlineQueue} pendente(s) offline.` : "";
      return value.items.length ? `${value.items.length} registro(s) carregado(s).${queue}` : `Nenhum registro neste módulo.${queue}`;
    }
  }

  if (value.item) return "Registro salvo com sucesso.";
  if (Array.isArray(value.items)) return "";

  return "";
}

function setText(el, value, type = "info") {
  const message = describeResponse(el, value);

  if (!message) {
    el.textContent = "";
    el.hidden = true;
    return;
  }

  el.textContent = message;
  el.hidden = false;
  el.className = `details ${type === "info" ? "" : type}`.trim();
}

function normalizeApiBaseUrl(value) {
  const input = String(value || "").trim();
  if (!input) return "";

  const withScheme = /^https?:\/\//i.test(input) ? input : `http://${input}`;

  try {
    const url = new URL(withScheme);
    if (!url.port && url.protocol === "http:") {
      url.port = "4000";
    }

    return url.origin;
  } catch {
    return input.replace(/\/+(health|api\/health)?$/i, "").replace(/\/+$/, "");
  }
}

function getInitialApiBaseUrl() {
  const stored = normalizeApiBaseUrl(localStorage.getItem("agro_api_base_url"));
  if (stored) return stored;

  const runtimeConfigured = normalizeApiBaseUrl(window.AGRO_CONFIG?.apiBaseUrl || window.AGRO_API_BASE_URL);
  if (runtimeConfigured) return runtimeConfigured;

  return "";
}

function apiUrl(path) {
  if (/^https?:\/\//i.test(path) || !path.startsWith("/api/") || !apiBaseUrl) return path;
  return `${apiBaseUrl}${path.replace(/^\/api/, "")}`;
}

function refreshApiConfig() {
  if (!apiConfigEl || !apiBaseUrlInput) return;

  apiBaseUrlInput.value = apiBaseUrl;
  apiConfigEl.hidden = !isNativeApp && !isDesktopMode && !apiBaseUrl && !forceApiConfigVisible;
}

function showApiConfig() {
  forceApiConfigVisible = true;
  refreshApiConfig();
}

function configuredApiUrl(path) {
  if (path.startsWith("/api/") && isNativeApp && !apiBaseUrl) {
    const error = new Error("Configure o servidor do app antes de continuar.");
    error.code = "SERVER_NOT_CONFIGURED";
    throw error;
  }

  return apiUrl(path);
}

function clearAuthenticatedState(message = "Sua sessão expirou. Entre novamente para continuar.", type = "warning") {
  authToken = "";
  localStorage.removeItem("agro_token");
  farmsCache = [];
  plotsCache = [];
  cropsCache = [];
  operationalRecordsCache = [];
  fillSelect(qs("plot-farm"), [], (v) => v.name);
  fillSelect(qs("activity-farm"), [], (v) => v.name);
  fillSelect(qs("activity-plot"), [], (v) => v.name);
  fillSelect(qs("activity-crop"), [], (v) => v.name);
  refreshOperationalSelectors();
  renderList(farmListEl, [], () => document.createElement("div"));
  renderList(plotListEl, [], () => document.createElement("div"));
  renderList(cropListEl, [], () => document.createElement("div"));
  renderList(activityListEl, [], () => document.createElement("div"));
  renderList(operationalListEl, [], () => document.createElement("div"));
  dashboardMetricsEl.innerHTML = '<p class="muted">Faça login para carregar o dashboard.</p>';
  dashboardAlertsEl.innerHTML = "";
  setText(authDetailsEl, message, type);
}

function friendlyError(error) {
  if (error?.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (error?.code === "SERVER_NOT_CONFIGURED") return "Configure o servidor do app para conectar ao sistema.";
  if (!error?.status) return "Servidor indisponível. Verifique a conexão e o endereço do servidor.";
  return error?.message || "Não foi possível concluir a ação. Tente novamente.";
}

function handleRequestError(targetEl, error) {
  if (error?.status === 401) {
    clearAuthenticatedState();
    return true;
  }

  if (error?.code === "SERVER_NOT_CONFIGURED" || !error?.status) {
    showApiConfig();
  }

  setText(targetEl, friendlyError(error), "error");
  return true;
}

function authHeaders() {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

async function apiRequest(path, options = {}) {
  const response = await fetch(configuredApiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.error || `Erro ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return data;
}

function fillSelect(selectEl, items, labelFn, includeEmpty = true) {
  selectEl.innerHTML = "";

  if (includeEmpty) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "--";
    selectEl.appendChild(opt);
  }

  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = labelFn(item);
    selectEl.appendChild(opt);
  });
}

async function loadStatus() {
  statusEl.textContent = "Consultando...";
  statusEl.className = "status";
  detailsEl.textContent = "";
  detailsEl.hidden = true;

  if (isNativeApp && !apiBaseUrl) {
    statusEl.textContent = "Configurar";
    statusEl.classList.add("error");
    showApiConfig();
    setText(detailsEl, "Informe o servidor do app para conectar ao sistema.", "warning");
    return;
  }

  try {
    const response = await fetch(configuredApiUrl("/api/health"));
    const data = await response.json();
    const ok = response.ok && data.status === "ok";

    statusEl.textContent = ok ? "Online" : "Erro";
    statusEl.classList.add(ok ? "ok" : "error");
    setText(detailsEl, data);
  } catch (error) {
    statusEl.textContent = "Erro";
    statusEl.classList.add("error");
    showApiConfig();
    setText(detailsEl, "Não foi possível conectar ao sistema. Verifique o IP do servidor e se o backend está ligado.", "error");
  }
}

function clearFarmForm() {
  editingFarmId = null;
  qs("farm-name").value = "";
  qs("farm-location").value = "";
  qs("farm-area").value = "";
  qs("btn-farm-save").textContent = "Salvar fazenda";
}

function clearPlotForm() {
  editingPlotId = null;
  qs("plot-name").value = "";
  qs("plot-area").value = "";
  qs("btn-plot-save").textContent = "Salvar talhão";
}

function clearCropForm() {
  editingCropId = null;
  qs("crop-name").value = "";
  qs("crop-scientific").value = "";
  qs("crop-cycle").value = "";
  qs("btn-crop-save").textContent = "Salvar cultura";
}

function clearActivityForm() {
  qs("activity-type").value = "PLANTIO";
  qs("activity-date").value = "";
  qs("activity-quantity").value = "";
  qs("activity-unit").value = "";
  qs("activity-notes").value = "";
}

function renderList(target, items, renderItem) {
  target.innerHTML = "";

  if (!items.length) {
    target.innerHTML = '<p class="muted">Nenhum item.</p>';
    return;
  }

  items.forEach((item) => target.appendChild(renderItem(item)));
}

async function loadFarms() {
  if (!authToken) {
    farmsCache = [];
    fillSelect(qs("plot-farm"), [], (v) => v.name);
    fillSelect(qs("activity-farm"), [], (v) => v.name);
    refreshOperationalSelectors();
    renderList(farmListEl, [], () => document.createElement("div"));
    setText(farmDetailsEl, "Faça login para gerenciar fazendas.");
    return;
  }

  try {
    const data = await apiRequest("/api/farms");
    farmsCache = data.items || [];
    fillSelect(qs("plot-farm"), farmsCache, (farm) => farm.name, false);
    fillSelect(qs("activity-farm"), farmsCache, (farm) => farm.name, false);
    refreshOperationalSelectors();
    setText(farmDetailsEl, data);

    renderList(farmListEl, farmsCache, (item) => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `<strong>${item.name}</strong><br><span class="muted">${item.location || "-"} | ${item.areaHectare ?? "-"} ha</span>`;

      const actions = document.createElement("div");
      actions.className = "actions";

      const edit = document.createElement("button");
      edit.textContent = "Editar";
      edit.onclick = () => {
        editingFarmId = item.id;
        qs("farm-name").value = item.name || "";
        qs("farm-location").value = item.location || "";
        qs("farm-area").value = item.areaHectare ?? "";
        qs("btn-farm-save").textContent = "Atualizar fazenda";
      };

      const del = document.createElement("button");
      del.className = "danger";
      del.textContent = "Excluir";
      del.onclick = async () => {
        try {
          await apiRequest(`/api/farms/${item.id}`, { method: "DELETE" });
          showToast("Fazenda excluída.");
          await loadFarms();
          await loadPlots();
          await loadActivities();
        } catch (error) {
          handleRequestError(farmDetailsEl, error);
        }
      };

      actions.append(edit, del);
      el.appendChild(actions);
      return el;
    });

    await loadPlots();
    await loadActivities();
  } catch (error) {
    handleRequestError(farmDetailsEl, error);
  }
}

async function loadPlots() {
  if (!authToken) {
    plotsCache = [];
    fillSelect(qs("activity-plot"), [], (plot) => plot.name);
    refreshOperationalSelectors();
    renderList(plotListEl, [], () => document.createElement("div"));
    setText(plotDetailsEl, "Faça login para gerenciar talhões.");
    return;
  }

  const farmId = qs("plot-farm").value || qs("activity-farm").value;
  if (!farmId) {
    plotsCache = [];
    fillSelect(qs("activity-plot"), [], (plot) => plot.name);
    refreshOperationalSelectors();
    setText(plotDetailsEl, "Selecione uma fazenda para listar talhões.");
    renderList(plotListEl, [], () => document.createElement("div"));
    return;
  }

  try {
    const data = await apiRequest(`/api/plots?farmId=${encodeURIComponent(farmId)}`);
    plotsCache = data.items || [];
    fillSelect(qs("activity-plot"), plotsCache, (plot) => plot.name);
    refreshOperationalSelectors();
    setText(plotDetailsEl, data);

    renderList(plotListEl, plotsCache, (item) => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `<strong>${item.name}</strong><br><span class="muted">Área: ${item.areaHectare ?? "-"} ha</span>`;
      const actions = document.createElement("div");
      actions.className = "actions";

      const edit = document.createElement("button");
      edit.textContent = "Editar";
      edit.onclick = () => {
        editingPlotId = item.id;
        qs("plot-name").value = item.name || "";
        qs("plot-area").value = item.areaHectare ?? "";
        qs("plot-farm").value = item.farmId;
        qs("btn-plot-save").textContent = "Atualizar talhão";
      };

      const del = document.createElement("button");
      del.className = "danger";
      del.textContent = "Excluir";
      del.onclick = async () => {
        try {
          await apiRequest(`/api/plots/${item.id}`, { method: "DELETE" });
          showToast("Talhão excluído.");
          await loadPlots();
          await loadActivities();
        } catch (error) {
          handleRequestError(plotDetailsEl, error);
        }
      };

      actions.append(edit, del);
      el.appendChild(actions);
      return el;
    });
  } catch (error) {
    handleRequestError(plotDetailsEl, error);
  }
}

async function loadCrops() {
  if (!authToken) {
    cropsCache = [];
    fillSelect(qs("activity-crop"), [], (crop) => crop.name);
    refreshOperationalSelectors();
    renderList(cropListEl, [], () => document.createElement("div"));
    setText(cropDetailsEl, "Faça login para gerenciar culturas.");
    return;
  }

  try {
    const data = await apiRequest("/api/crops");
    cropsCache = data.items || [];
    fillSelect(qs("activity-crop"), cropsCache, (crop) => crop.name);
    refreshOperationalSelectors();
    setText(cropDetailsEl, data);

    renderList(cropListEl, cropsCache, (item) => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `<strong>${item.name}</strong><br><span class="muted">${item.scientificName || "-"} | ciclo: ${item.cycleDays ?? "-"} dias</span>`;
      const actions = document.createElement("div");
      actions.className = "actions";

      const edit = document.createElement("button");
      edit.textContent = "Editar";
      edit.onclick = () => {
        editingCropId = item.id;
        qs("crop-name").value = item.name || "";
        qs("crop-scientific").value = item.scientificName || "";
        qs("crop-cycle").value = item.cycleDays ?? "";
        qs("btn-crop-save").textContent = "Atualizar cultura";
      };

      const del = document.createElement("button");
      del.className = "danger";
      del.textContent = "Excluir";
      del.onclick = async () => {
        try {
          await apiRequest(`/api/crops/${item.id}`, { method: "DELETE" });
          showToast("Cultura excluída.");
          await loadCrops();
        } catch (error) {
          handleRequestError(cropDetailsEl, error);
        }
      };

      actions.append(edit, del);
      el.appendChild(actions);
      return el;
    });
  } catch (error) {
    handleRequestError(cropDetailsEl, error);
  }
}

async function loadActivities() {
  if (!authToken) {
    renderList(activityListEl, [], () => document.createElement("div"));
    setText(activityDetailsEl, "Faça login para gerenciar atividades.");
    return;
  }

  try {
    const farmId = qs("activity-farm").value;
    const params = new URLSearchParams();
    if (farmId) params.set("farmId", farmId);

    const data = await apiRequest(`/api/activities${params.toString() ? `?${params}` : ""}`);
    setText(activityDetailsEl, data);

    renderList(activityListEl, data.items || [], (item) => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `<strong>${item.type}</strong> - ${new Date(item.date).toLocaleDateString("pt-BR")}<br>
      <span class="muted">Fazenda: ${item.farm?.name || "-"} | Talhão: ${item.plot?.name || "-"} | Cultura: ${item.crop?.name || "-"}</span><br>
      <span class="muted">Qtd: ${item.quantity ?? "-"} ${item.unit || ""}</span><br>
      <span class="muted">Obs: ${item.notes || "-"}</span>`;

      const actions = document.createElement("div");
      actions.className = "actions";
      const del = document.createElement("button");
      del.className = "danger";
      del.textContent = "Excluir";
      del.onclick = async () => {
        try {
          await apiRequest(`/api/activities/${item.id}`, { method: "DELETE" });
          showToast("Atividade excluída.");
          await loadActivities();
        } catch (error) {
          handleRequestError(activityDetailsEl, error);
        }
      };
      actions.append(del);
      el.appendChild(actions);
      return el;
    });
  } catch (error) {
    handleRequestError(activityDetailsEl, error);
  }
}

const OPERATIONAL_MODULES = [
  {
    key: "ASSET_MACHINE",
    label: "Máquinas",
    category: "PROPERTY",
    subtype: "MACHINE",
    fields: [
      ["machineName", "Nome da máquina"],
      ["plate", "Placa/série"],
      ["hourMeter", "Horímetro", "number"],
      ["fuelType", "Combustível"],
      ["notes", "Observações", "textarea"]
    ]
  },
  {
    key: "ASSET_EMPLOYEE",
    label: "Funcionários",
    category: "PROPERTY",
    subtype: "EMPLOYEE",
    fields: [
      ["employeeName", "Nome"],
      ["role", "Função"],
      ["phone", "Telefone"],
      ["permissions", "Permissões"],
      ["signature", "Assinatura digital"]
    ]
  },
  {
    key: "CONTACT",
    label: "Fornecedores e clientes",
    category: "PROPERTY",
    subtype: "CONTACT",
    fields: [
      ["contactType", "Tipo", "select", ["Fornecedor", "Cliente"]],
      ["name", "Nome"],
      ["document", "CPF/CNPJ"],
      ["phone", "Telefone"],
      ["notes", "Observações", "textarea"]
    ]
  },
  {
    key: "ANIMAL",
    label: "Animais",
    category: "PROPERTY",
    subtype: "ANIMAL",
    fields: [
      ["species", "Espécie/lote"],
      ["count", "Quantidade", "number"],
      ["location", "Local"],
      ["notes", "Observações", "textarea"]
    ]
  },
  {
    key: "SEASON_PLAN",
    label: "Planejamento de safra",
    category: "SEASON",
    subtype: "PLAN",
    fields: [
      ["season", "Safra"],
      ["plantingWindow", "Janela de plantio"],
      ["cropRotation", "Rotação de culturas"],
      ["harvestForecast", "Previsão de colheita", "date"],
      ["history", "Histórico por safra", "textarea"]
    ]
  },
  {
    key: "APPLICATION",
    label: "Aplicações",
    category: "APPLICATION",
    subtype: "CHEMICAL",
    fields: [
      ["productType", "Tipo", "select", ["Herbicida", "Fungicida", "Inseticida", "Fertilizante"]],
      ["productName", "Produto"],
      ["lot", "Lote"],
      ["expiryDate", "Validade", "date"],
      ["dose", "Dosagem"],
      ["operator", "Operador"],
      ["weather", "Clima no momento"],
      ["equipment", "Equipamento usado"],
      ["prescription", "Receituário agronômico"],
      ["graceUntil", "Carência até", "date"],
      ["reentryUntil", "Reentrada até", "date"],
      ["traceability", "Rastreabilidade", "textarea"]
    ]
  },
  {
    key: "STOCK",
    label: "Estoque",
    category: "STOCK",
    subtype: "ITEM",
    fields: [
      ["itemType", "Tipo", "select", ["Defensivo", "Fertilizante", "Semente", "Combustível", "Ferramenta", "Lubrificante", "Peça", "EPI", "Outro"]],
      ["itemName", "Item"],
      ["quantity", "Quantidade", "number"],
      ["unit", "Unidade"],
      ["minQuantity", "Estoque mínimo", "number"],
      ["purchaseValue", "Valor de compra", "number"],
      ["lot", "Lote"],
      ["expiryDate", "Validade", "date"],
      ["barcode", "Código de barras"],
      ["invoicePhoto", "Foto nota/embalagem", "file"]
    ]
  },
  {
    key: "FINANCE",
    label: "Financeiro",
    category: "FINANCE",
    subtype: "FLOW",
    fields: [
      ["flowType", "Tipo", "select", ["Pagar", "Receber", "Despesa", "Receita", "Financiamento"]],
      ["description", "Descrição"],
      ["amount", "Valor", "number"],
      ["hectareCost", "Custo por hectare", "number"],
      ["cropCost", "Custo por cultura", "number"],
      ["dieselMaintenance", "Diesel/manutenção", "number"],
      ["notes", "Observações", "textarea"]
    ]
  },
  {
    key: "PROFITABILITY",
    label: "Rentabilidade por talhão",
    category: "PROFITABILITY",
    subtype: "PLOT_RESULT",
    fields: [
      ["production", "Produção", "number"],
      ["costs", "Custos", "number"],
      ["revenue", "Receita", "number"],
      ["comparison", "Comparação entre áreas", "textarea"]
    ]
  },
  {
    key: "MACHINE_MAINTENANCE",
    label: "Máquinas e manutenção",
    category: "MACHINE",
    subtype: "MAINTENANCE",
    fields: [
      ["machine", "Máquina"],
      ["hourMeter", "Horímetro", "number"],
      ["fuelConsumption", "Consumo de combustível", "number"],
      ["maintenanceType", "Manutenção/troca de óleo"],
      ["repairHistory", "Histórico de reparos", "textarea"],
      ["cost", "Custo", "number"]
    ]
  },
  {
    key: "TEAM_TASK",
    label: "Equipe e tarefas",
    category: "TEAM",
    subtype: "TASK",
    fields: [
      ["employee", "Funcionário"],
      ["journey", "Jornada/escala"],
      ["task", "Tarefa"],
      ["dailyProduction", "Produção diária"],
      ["signature", "Assinatura digital"]
    ]
  },
  {
    key: "WEATHER_MARKET",
    label: "Clima e mercado",
    category: "WEATHER_MARKET",
    subtype: "INFO",
    fields: [
      ["forecast", "Previsão do tempo"],
      ["rainRadar", "Radar de chuva"],
      ["windSpeed", "Velocidade do vento"],
      ["frostAlert", "Alerta de geada"],
      ["sprayWindow", "Janela de pulverização"],
      ["commodity", "Commodity"],
      ["commodityValue", "Valor", "number"]
    ]
  },
  {
    key: "MAP_GPS",
    label: "Mapas e GPS",
    category: "MAP_GPS",
    subtype: "POINT",
    fields: [
      ["locationName", "Local"],
      ["problem", "Problema marcado"],
      ["offlineRoute", "Navegação offline"],
      ["droneIntegration", "Integração com drone"]
    ]
  },
  {
    key: "IMAGE_MONITORING",
    label: "Monitoramento por imagens",
    category: "MONITORING",
    subtype: "IMAGE",
    fields: [
      ["source", "Origem", "select", ["Satélite", "Drone", "Foto de campo"]],
      ["ndvi", "NDVI"],
      ["waterStress", "Estresse hídrico"],
      ["plantingFailures", "Falhas de plantio"],
      ["image", "Imagem", "file"],
      ["notes", "Observações", "textarea"]
    ]
  },
  {
    key: "DAILY_WORK",
    label: "Atividades diárias",
    category: "DAILY_WORK",
    subtype: "EQUIPMENT_LOG",
    fields: [
      ["employee", "Funcionário"],
      ["equipment", "Equipamento"],
      ["startHourMeter", "Horímetro inicial", "number"],
      ["endHourMeter", "Horímetro final", "number"],
      ["startPhoto", "Foto horímetro inicial", "file"],
      ["endPhoto", "Foto horímetro final", "file"],
      ["notes", "Observações", "textarea"]
    ]
  },
  {
    key: "REMINDER",
    label: "Lembretes da equipe",
    category: "REMINDER",
    subtype: "TEAM",
    fields: [
      ["message", "Mensagem", "textarea"],
      ["team", "Equipe"],
      ["priority", "Prioridade", "select", ["Baixa", "Normal", "Alta"]]
    ]
  },
  {
    key: "INTEGRATION",
    label: "Equipamentos e sensores",
    category: "INTEGRATION",
    subtype: "EQUIPMENT",
    fields: [
      ["integrationType", "Tipo", "select", ["Piloto automático", "Sensor IoT", "Estação meteorológica", "Telemetria", "Balança", "Trator"]],
      ["equipment", "Equipamento"],
      ["reading", "Leitura"],
      ["notes", "Observações", "textarea"]
    ]
  },
  {
    key: "AI_ANALYSIS",
    label: "IA e análise preditiva",
    category: "AI_ANALYSIS",
    subtype: "PREDICTION",
    fields: [
      ["productivityRisk", "Produtividade prevista"],
      ["diseaseRisk", "Risco de doenças"],
      ["plantingRecommendation", "Melhor época de plantio"],
      ["irrigationNeed", "Necessidade de irrigação"],
      ["notes", "Observações", "textarea"]
    ]
  }
];

const STATUS_LABELS = {
  OPEN: "Aberto",
  PLANNED: "Planejado",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluído"
};

function currentModule() {
  return OPERATIONAL_MODULES.find((module) => module.key === operationalModuleEl.value) || OPERATIONAL_MODULES[0];
}

function humanStatus(status) {
  return STATUS_LABELS[status] || status || "Aberto";
}

function operationalFieldLabel(module, fieldName) {
  const field = module.fields.find(([name]) => name === fieldName);
  return field?.[1] || fieldName;
}

function formatDateTimeLocal(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function refreshOperationalSelectors() {
  if (!operationalFarmEl) return;

  fillSelect(operationalFarmEl, farmsCache, (farm) => farm.name);
  fillSelect(operationalPlotEl, plotsCache, (plot) => plot.name);
  fillSelect(operationalCropEl, cropsCache, (crop) => crop.name);
}

function renderOperationalModules() {
  operationalModuleEl.innerHTML = "";
  OPERATIONAL_MODULES.forEach((module) => {
    const opt = document.createElement("option");
    opt.value = module.key;
    opt.textContent = module.label;
    operationalModuleEl.appendChild(opt);
  });
}

function makeVoiceButton(input) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition || ["date", "datetime-local", "number", "file", "password"].includes(input.type)) {
    return null;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary small";
  button.textContent = "Voz";
  button.onclick = () => {
    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    button.textContent = "Ouvindo";
    recognition.onresult = (event) => {
      input.value = event.results[0][0].transcript;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    recognition.onend = () => {
      button.textContent = "Voz";
    };
    recognition.start();
  };

  return button;
}

function renderOperationalFields(record) {
  const module = currentModule();
  operationalFieldsEl.innerHTML = "";

  module.fields.forEach(([name, label, type = "text", options = []]) => {
    const wrapper = document.createElement("label");
    wrapper.textContent = label;
    const fieldWrap = document.createElement("div");
    fieldWrap.className = "inline-field";
    let input;

    if (type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 2;
    } else if (type === "select") {
      input = document.createElement("select");
      options.forEach((option) => {
        const opt = document.createElement("option");
        opt.value = option;
        opt.textContent = option;
        input.appendChild(opt);
      });
    } else {
      input = document.createElement("input");
      input.type = type === "number" ? "text" : type;
      if (type === "number") input.inputMode = "decimal";
      if (type === "file") {
        input.accept = "image/*";
        input.capture = "environment";
      }
    }

    input.id = `op-${name}`;
    input.dataset.field = name;

    if (record?.data?.[name] && type !== "file") {
      input.value = record.data[name];
    }

    fieldWrap.appendChild(input);
    const voice = makeVoiceButton(input);
    if (voice) fieldWrap.appendChild(voice);
    wrapper.appendChild(fieldWrap);
    operationalFieldsEl.appendChild(wrapper);
  });
}

async function fileToDataUrl(file) {
  if (!file) return "";

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function collectOperationalData() {
  const data = {};

  for (const input of operationalFieldsEl.querySelectorAll("[data-field]")) {
    if (input.type === "file") {
      const file = input.files?.[0];
      if (file) {
        data[input.dataset.field] = await fileToDataUrl(file);
        data[`${input.dataset.field}Name`] = file.name;
      }
    } else {
      data[input.dataset.field] = input.value;
    }
  }

  if (capturedGps) {
    data.gps = capturedGps;
  }

  const module = currentModule();
  if (module.key === "PROFITABILITY") {
    data.netProfit = Number(data.revenue || 0) - Number(data.costs || 0);
  }

  data.recordedAutomaticallyAt = new Date().toISOString();
  return data;
}

function queuedRecords() {
  return JSON.parse(localStorage.getItem("agro_offline_records") || "[]");
}

function setQueuedRecords(items) {
  localStorage.setItem("agro_offline_records", JSON.stringify(items));
}

async function saveOperationalRecord() {
  if (!authToken) {
    setText(operationalDetailsEl, "Faça login para salvar registros.");
    return;
  }

  const module = currentModule();
  const payload = {
    category: module.category,
    subtype: module.subtype,
    title: qs("operational-title").value || module.label,
    status: qs("operational-status").value,
    eventAt: qs("operational-eventAt").value || new Date().toISOString(),
    dueAt: qs("operational-dueAt").value || null,
    farmId: operationalFarmEl.value || null,
    plotId: operationalPlotEl.value || null,
    cropId: operationalCropEl.value || null,
    data: await collectOperationalData()
  };

  const path = editingOperationalId ? `/api/operational-records/${editingOperationalId}` : "/api/operational-records";
  const method = editingOperationalId ? "PUT" : "POST";

  try {
    const data = await apiRequest(path, { method, body: JSON.stringify(payload) });
    editingOperationalId = null;
    setText(operationalDetailsEl, data);
    showToast(data.item?.title ? `${data.item.title} salvo com sucesso.` : "Registro salvo com sucesso.");
    clearOperationalForm(false);
    await loadOperationalRecords();
    await loadDashboard();
  } catch (error) {
    if (error.status) {
      handleRequestError(operationalDetailsEl, error);
      return;
    }

    const queue = queuedRecords();
    queue.push({ path, method, payload, queuedAt: new Date().toISOString() });
    setQueuedRecords(queue);
    setText(operationalDetailsEl, `Registro guardado no modo offline. Pendentes: ${queue.length}.`, "warning");
    showToast("Registro salvo no modo offline.", "warning");
  }
}

function clearOperationalForm(resetModule = true) {
  editingOperationalId = null;
  capturedGps = null;
  qs("operational-title").value = "";
  qs("operational-status").value = "OPEN";
  qs("operational-eventAt").value = formatDateTimeLocal();
  qs("operational-dueAt").value = "";
  if (resetModule) operationalModuleEl.selectedIndex = 0;
  renderOperationalFields();
}

async function syncOperationalQueue() {
  const queue = queuedRecords();
  if (!queue.length) {
    setText(operationalDetailsEl, "Nenhum registro offline pendente.");
    return;
  }

  const remaining = [];
  for (const item of queue) {
    try {
      await apiRequest(item.path, { method: item.method, body: JSON.stringify(item.payload) });
    } catch {
      remaining.push(item);
    }
  }

  setQueuedRecords(remaining);
  setText(operationalDetailsEl, remaining.length ? `${remaining.length} registro(s) continuam pendentes.` : "Fila offline sincronizada.");
  showToast(remaining.length ? "Alguns registros continuam pendentes." : "Registros offline sincronizados.", remaining.length ? "warning" : "info");
  await loadOperationalRecords();
  await loadDashboard();
}

async function loadOperationalRecords() {
  if (!authToken) {
    operationalRecordsCache = [];
    renderList(operationalListEl, [], () => document.createElement("div"));
    setText(operationalDetailsEl, "Faça login para usar os módulos operacionais.");
    return;
  }

  const module = currentModule();
  let data;
  try {
    data = await apiRequest(`/api/operational-records?category=${encodeURIComponent(module.category)}&subtype=${encodeURIComponent(module.subtype)}`);
  } catch (error) {
    operationalRecordsCache = [];
    renderList(operationalListEl, [], () => document.createElement("div"));
    handleRequestError(operationalDetailsEl, error);
    return;
  }

  operationalRecordsCache = data.items || [];
  setText(operationalDetailsEl, { ...data, offlineQueue: queuedRecords().length });

  renderList(operationalListEl, operationalRecordsCache, (item) => {
    const el = document.createElement("div");
    el.className = "item";
    const displayModule = OPERATIONAL_MODULES.find((candidate) => candidate.category === item.category && candidate.subtype === item.subtype) || module;
    const fields = Object.entries(item.data || {})
      .filter(([key, value]) => value && !String(value).startsWith("data:image") && key !== "recordedAutomaticallyAt")
      .slice(0, 5)
      .map(([key, value]) => `<span class="badge">${operationalFieldLabel(displayModule, key)}: ${String(value).slice(0, 40)}</span>`)
      .join(" ");
    el.innerHTML = `<strong>${item.title}</strong> <span class="muted">${humanStatus(item.status)}</span><br>
      <span class="muted">${new Date(item.eventAt).toLocaleString("pt-BR")} | ${item.farm?.name || "sem fazenda"} | ${item.plot?.name || "sem talhão"}</span><br>${fields}`;

    const actions = document.createElement("div");
    actions.className = "actions";

    const edit = document.createElement("button");
    edit.textContent = "Editar";
    edit.onclick = () => editOperationalRecord(item);

    const done = document.createElement("button");
    done.className = "secondary";
    done.textContent = "Concluir";
    done.onclick = async () => {
      try {
        await apiRequest(`/api/operational-records/${item.id}`, { method: "PUT", body: JSON.stringify({ status: "DONE" }) });
        showToast("Registro concluído.");
        await loadOperationalRecords();
        await loadDashboard();
      } catch (error) {
        handleRequestError(operationalDetailsEl, error);
      }
    };

    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Excluir";
    del.onclick = async () => {
      try {
        await apiRequest(`/api/operational-records/${item.id}`, { method: "DELETE" });
        showToast("Registro excluído.");
        await loadOperationalRecords();
        await loadDashboard();
      } catch (error) {
        handleRequestError(operationalDetailsEl, error);
      }
    };

    actions.append(edit, done, del);
    el.appendChild(actions);
    return el;
  });
}

function editOperationalRecord(item) {
  const module = OPERATIONAL_MODULES.find((candidate) => candidate.category === item.category && candidate.subtype === item.subtype);
  if (module) operationalModuleEl.value = module.key;
  editingOperationalId = item.id;
  qs("operational-title").value = item.title || "";
  qs("operational-status").value = item.status || "OPEN";
  qs("operational-eventAt").value = formatDateTimeLocal(new Date(item.eventAt));
  qs("operational-dueAt").value = item.dueAt ? formatDateTimeLocal(new Date(item.dueAt)) : "";
  operationalFarmEl.value = item.farmId || "";
  operationalPlotEl.value = item.plotId || "";
  operationalCropEl.value = item.cropId || "";
  capturedGps = item.data?.gps || null;
  renderOperationalFields(item);
}

async function captureOperationalGps() {
  if (!navigator.geolocation) {
    setText(operationalDetailsEl, "GPS não disponível neste navegador.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      capturedGps = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        capturedAt: new Date().toISOString()
      };
      setText(operationalDetailsEl, "Localização anexada ao próximo registro.");
      showToast("Localização anexada.");
    },
    () => setText(operationalDetailsEl, "Não foi possível obter a localização. Verifique a permissão do GPS.", "warning"),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

async function loadDashboard() {
  if (!authToken) {
    dashboardMetricsEl.innerHTML = '<p class="muted">Faça login para carregar o dashboard.</p>';
    dashboardAlertsEl.innerHTML = "";
    return;
  }

  let data;
  try {
    data = await apiRequest("/api/dashboard/operational");
  } catch (error) {
    handleRequestError(authDetailsEl, error);
    dashboardMetricsEl.innerHTML = '<p class="muted">Faça login para carregar o dashboard.</p>';
    dashboardAlertsEl.innerHTML = "";
    return;
  }

  const metrics = [
    ["Fazendas", data.totals.farms],
    ["Talhões", data.totals.plots],
    ["Culturas", data.totals.crops],
    ["Atividades", data.totals.activities],
    ["Registros", data.totals.operationalRecords],
    ["Saldo", Number(data.finance.balance || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })]
  ];

  dashboardMetricsEl.innerHTML = metrics.map(([label, value]) => `<div class="metric"><span class="muted">${label}</span><strong>${value}</strong></div>`).join("");
  dashboardAlertsEl.innerHTML = "";

  if (!data.alerts.length) {
    dashboardAlertsEl.innerHTML = '<p class="muted">Sem alertas no momento.</p>';
    return;
  }

  data.alerts.forEach((alert) => {
    const el = document.createElement("div");
    el.className = "item alert";
    el.innerHTML = `<strong>${alert.title}</strong><br><span class="muted">${alert.message}</span>`;
    dashboardAlertsEl.appendChild(el);
  });
}

function exportOperationalCsv() {
  const rows = [["Modulo", "Titulo", "Status", "Data", "Fazenda", "Talhao", "Cultura", "Dados"]];
  operationalRecordsCache.forEach((item) => {
    const data = Object.fromEntries(Object.entries(item.data || {}).filter(([, value]) => !String(value).startsWith("data:image")));
    rows.push([
      currentModule().label,
      item.title,
      item.status,
      new Date(item.eventAt).toLocaleString("pt-BR"),
      item.farm?.name || "",
      item.plot?.name || "",
      item.crop?.name || "",
      JSON.stringify(data)
    ]);
  });

  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `agro-${currentModule().key.toLowerCase()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function initOperationalArea() {
  if (!operationalModuleEl) return;

  renderOperationalModules();
  refreshOperationalSelectors();
  qs("dashboard-notes").value = localStorage.getItem("agro_dashboard_notes") || "";
  clearOperationalForm(false);
  renderOperationalFields();
}

async function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (isNativeApp) return;

  try {
    await navigator.serviceWorker.register("/service-worker.js");
  } catch {
    showToast("Modo offline indisponível neste navegador.", "warning");
  }
}

qs("btn-register").addEventListener("click", async () => {
  try {
    const creatingFromLoggedSession = Boolean(authToken);
    const data = await apiRequest(creatingFromLoggedSession ? "/api/users" : "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: qs("register-name").value,
        email: qs("register-email").value,
        password: qs("register-password").value,
        role: qs("register-role").value
      })
    });

    if (data.token) {
      authToken = data.token;
      localStorage.setItem("agro_token", authToken);
      setText(authDetailsEl, data);
      showToast("Usuário cadastrado e sessão iniciada.");
      await loadFarms();
      await loadCrops();
      await loadDashboard();
      await loadOperationalRecords();
      return;
    }

    setText(authDetailsEl, `Usuário ${data.user?.email || ""} criado com sucesso.`);
    showToast("Usuário criado com sucesso.");
  } catch (error) {
    handleRequestError(authDetailsEl, error);
  }
});

qs("btn-login").addEventListener("click", async () => {
  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: qs("login-email").value, password: qs("login-password").value })
    });

    authToken = data.token;
    localStorage.setItem("agro_token", authToken);
    setText(authDetailsEl, data);
    showToast("Sessão iniciada.");
    await loadFarms();
    await loadCrops();
    await loadDashboard();
    await loadOperationalRecords();
  } catch (error) {
    handleRequestError(authDetailsEl, error);
  }
});

qs("btn-me").addEventListener("click", async () => {
  try {
    const data = await apiRequest("/api/auth/me");
    setText(authDetailsEl, data);
  } catch (error) {
    handleRequestError(authDetailsEl, error);
  }
});

qs("btn-logout").addEventListener("click", () => {
  clearAuthenticatedState("Sessão encerrada.", "info");
  clearFarmForm();
  clearPlotForm();
  clearCropForm();
  clearActivityForm();
  clearOperationalForm();
  showToast("Sessão encerrada.");
});

qs("btn-farm-save").addEventListener("click", async () => {
  try {
    const wasEditing = Boolean(editingFarmId);
    const payload = { name: qs("farm-name").value, location: qs("farm-location").value, areaHectare: qs("farm-area").value };
    if (editingFarmId) {
      await apiRequest(`/api/farms/${editingFarmId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await apiRequest("/api/farms", { method: "POST", body: JSON.stringify(payload) });
    }

    clearFarmForm();
    await loadFarms();
    showToast(wasEditing ? "Fazenda atualizada." : "Fazenda cadastrada.");
  } catch (error) {
    handleRequestError(farmDetailsEl, error);
  }
});

qs("btn-plot-save").addEventListener("click", async () => {
  try {
    const wasEditing = Boolean(editingPlotId);
    const payload = { name: qs("plot-name").value, areaHectare: qs("plot-area").value, farmId: qs("plot-farm").value };
    if (editingPlotId) {
      await apiRequest(`/api/plots/${editingPlotId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await apiRequest("/api/plots", { method: "POST", body: JSON.stringify(payload) });
    }

    clearPlotForm();
    await loadPlots();
    showToast(wasEditing ? "Talhão atualizado." : "Talhão cadastrado.");
  } catch (error) {
    handleRequestError(plotDetailsEl, error);
  }
});

qs("btn-crop-save").addEventListener("click", async () => {
  try {
    const wasEditing = Boolean(editingCropId);
    const payload = {
      name: qs("crop-name").value,
      scientificName: qs("crop-scientific").value,
      cycleDays: qs("crop-cycle").value
    };

    if (editingCropId) {
      await apiRequest(`/api/crops/${editingCropId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await apiRequest("/api/crops", { method: "POST", body: JSON.stringify(payload) });
    }

    clearCropForm();
    await loadCrops();
    showToast(wasEditing ? "Cultura atualizada." : "Cultura cadastrada.");
  } catch (error) {
    handleRequestError(cropDetailsEl, error);
  }
});

qs("btn-activity-save").addEventListener("click", async () => {
  try {
    const payload = {
      type: qs("activity-type").value,
      date: qs("activity-date").value,
      farmId: qs("activity-farm").value,
      plotId: qs("activity-plot").value || null,
      cropId: qs("activity-crop").value || null,
      quantity: qs("activity-quantity").value,
      unit: qs("activity-unit").value,
      notes: qs("activity-notes").value
    };

    await apiRequest("/api/activities", { method: "POST", body: JSON.stringify(payload) });
    clearActivityForm();
    await loadActivities();
    showToast("Atividade registrada.");
  } catch (error) {
    handleRequestError(activityDetailsEl, error);
  }
});

qs("btn-report-summary").addEventListener("click", async () => {
  try {
    const farmId = qs("activity-farm").value;
    const data = await apiRequest(`/api/reports/activities-summary${farmId ? `?farmId=${farmId}` : ""}`);
    setText(reportDetailsEl, data);
  } catch (error) {
    handleRequestError(reportDetailsEl, error);
  }
});

qs("btn-report-crop").addEventListener("click", async () => {
  try {
    const data = await apiRequest("/api/reports/activities-by-crop");
    setText(reportDetailsEl, data);
  } catch (error) {
    handleRequestError(reportDetailsEl, error);
  }
});

saveApiUrlButton?.addEventListener("click", async () => {
  apiBaseUrl = normalizeApiBaseUrl(apiBaseUrlInput.value);
  if (apiBaseUrl) {
    localStorage.setItem("agro_api_base_url", apiBaseUrl);
    forceApiConfigVisible = false;
  } else {
    localStorage.removeItem("agro_api_base_url");
    apiBaseUrl = getInitialApiBaseUrl();
    forceApiConfigVisible = true;
  }

  refreshApiConfig();
  showToast("Servidor do app salvo. Testando conexão...");
  await loadStatus();
});

refreshButton.addEventListener("click", loadStatus);
qs("btn-farm-clear").addEventListener("click", clearFarmForm);
qs("btn-farms-refresh").addEventListener("click", loadFarms);
qs("btn-plot-clear").addEventListener("click", clearPlotForm);
qs("btn-plots-refresh").addEventListener("click", loadPlots);
qs("btn-crop-clear").addEventListener("click", clearCropForm);
qs("btn-crops-refresh").addEventListener("click", loadCrops);
qs("btn-activity-clear").addEventListener("click", clearActivityForm);
qs("btn-activities-refresh").addEventListener("click", loadActivities);
operationalModuleEl.addEventListener("change", async () => {
  clearOperationalForm(false);
  await loadOperationalRecords();
});
operationalFarmEl.addEventListener("change", async () => {
  qs("plot-farm").value = operationalFarmEl.value;
  await loadPlots();
});
qs("btn-operational-save").addEventListener("click", saveOperationalRecord);
qs("btn-operational-clear").addEventListener("click", () => clearOperationalForm());
qs("btn-operational-refresh").addEventListener("click", loadOperationalRecords);
qs("btn-operational-sync").addEventListener("click", syncOperationalQueue);
qs("btn-operational-gps").addEventListener("click", captureOperationalGps);
qs("btn-operational-export").addEventListener("click", exportOperationalCsv);
qs("btn-operational-print").addEventListener("click", () => window.print());
qs("btn-dashboard-refresh").addEventListener("click", loadDashboard);
qs("btn-dashboard-save").addEventListener("click", () => {
  localStorage.setItem("agro_dashboard_notes", qs("dashboard-notes").value);
  showToast("Anotações do dashboard salvas.");
});
qs("plot-farm").addEventListener("change", loadPlots);
qs("activity-farm").addEventListener("change", async () => {
  qs("plot-farm").value = qs("activity-farm").value;
  await loadPlots();
  await loadActivities();
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

window.addEventListener("appinstalled", () => {
  installButton.hidden = true;
});

initOperationalArea();
refreshApiConfig();
setupServiceWorker();
loadStatus();
loadFarms();
loadCrops();
loadActivities();
loadDashboard();
loadOperationalRecords();
setText(authDetailsEl, authToken ? "Sessão ativa neste dispositivo." : "Sem sessão. Faça login ou cadastro.");
setText(farmDetailsEl, "Faça login para gerenciar fazendas.");
setText(plotDetailsEl, "Faça login para gerenciar talhões.");
setText(cropDetailsEl, "Faça login para gerenciar culturas.");
setText(activityDetailsEl, "Faça login para gerenciar atividades.");
setText(reportDetailsEl, "Selecione uma ação de relatório.");
